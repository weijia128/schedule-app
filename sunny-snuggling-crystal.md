# 文档问答 RAG 系统 - 可行性分析与实施计划

## 背景

基于现有知识分享排期管理系统，为团队上传的文档（主要是 Markdown 和 PDF）
构建本地 RAG 问答功能。服务部署在云端内网，无显卡，低配（2-4 核 / ≤8G RAM），
但有内部大模型服务可调用。

## 可行性结论：完全可行

| 条件         | 状态       | 说明                                                  |
|--------------|------------|-------------------------------------------------------|
| 无 GPU       | 不影响     | 文档解析、embedding、向量搜索均可 CPU 完成             |
| 低配服务器   | 基本不影响 | 主要 markdown 文件，解析开销极小；向量搜索毫秒级      |
| 有内部 LLM   | 核心关键   | 最重量级的推理任务外包给内部 LLM，本机只做轻量处理    |
| 主要 md 文件 | 最简情况   | 直接读取，无需 OCR，无需 MinerU                       |

## 你不需要的服务（针对当前文档类型）

- **MinerU** - 主要用于扫描版 PDF 结构化解析，你的文档以 md 为主，不需要
- **DeepSeek OCR** - 用于图片/扫描件 OCR，文字版 PDF 不需要
- **Milvus / Weaviate** - 重型向量数据库，团队文档规模（百级 chunk）完全不需要
- **独立 GPU 推理服务** - 内部 LLM 已满足

## 确认：内网同时提供 LLM 推理 + Embedding 接口

两者均调用内网服务，**app 服务器本机零模型部署**，完全没有 GPU 和内存压力。

## 推荐架构（极简，不引入新中间件）

```
用户提问
   |
前端新增"文档问答"页面
   |
POST /api/rag/query  (新增 Express 路由，接在现有 server.js 或独立服务)
   |
  [1] 对问题文本调用 embedding 接口 -> 得到查询向量
   |
  [2] 在本地向量索引中做余弦相似度搜索 -> 取 Top-K 文档片段
   |
  [3] 拼装 Prompt (问题 + 相关片段) 调用内部 LLM API
   |
  [4] 返回答案 + 引用来源
   |
前端展示回答和引用的原始文档
```

**向量索引存储**: JSON 文件（`server/rag-index.json`）
- 文档规模 < 1000 chunks 时，暴力余弦搜索 < 10ms
- 完全不需要 Chroma / Qdrant / Milvus

## 实现步骤

### Phase 1: RAG 后端服务（新增文件）

**`server/rag/indexer.js`** - 文档索引器
- 递归扫描 `server/uploads/{date}/` 目录下所有文件
  - 目录结构: `uploads/2026-01-02/xxx.md`、`uploads/2026-01-02/xxx.pdf`
  - 元数据从目录名（日期）和 db.json 中关联的 schedule 记录提取
- Markdown / .txt: 直接读取文本
- 文字版 PDF: 用 `pdf-parse` npm 包提取文本（无需 GPU）
- 按 500 字符 + 50 字符 overlap 分块（chunk）
- 调用 embedding API 获取每个 chunk 的向量
- 保存到 `server/rag-index.json`，每条记录携带来源文件名、日期、所属 week

**`server/rag/searcher.js`** - 向量搜索
- 加载 `rag-index.json`
- 实现余弦相似度计算
- 返回 Top-K 相关 chunks

**`server/rag/router.js`** - Express 路由
- `POST /api/rag/query` - 问答入口（含 rerank）
- `POST /api/rag/reindex` - 手动触发重新索引
- `GET /api/rag/status` - 索引状态查询

**`server/rag/reranker.js`** - ReRank 模块
- 对 Top-K 召回结果调用内网 rerank 服务二次排序
- 入参: `{ query, passages: [text...] }` → 出参: `[{ index, score }]`
- Phase 1 即可启用（内网 rerank 模型已有）

### Phase 2: 前端新增问答页面

在 `schedule.html` 中新增"文档问答"Tab 或独立入口：
- 对话式 UI（输入框 + 消息列表）
- 显示答案 + 引用来源（文件名 + 所属周次）
- 支持历史对话上下文

### Phase 3: 触发索引更新

在文件上传成功后自动触发增量索引，无需手动维护

## 技术选型

| 组件         | 选型                              | 理由                                    |
|--------------|-----------------------------------|-----------------------------------------|
| 文本提取     | `pdf-parse` (npm)                 | 轻量，仅文字版 PDF，无 GPU 依赖         |
| Embedding    | 内网 embedding 服务（已确认可用）  | 零本地部署，直接 HTTP 调用              |
| 向量存储     | JSON 文件 (`rag-index.json`)      | 团队规模不需要向量数据库                |
| 向量搜索     | 内联余弦相似度（纯 JS）           | 百级 chunk 毫秒级，零依赖               |
| LLM 推理     | 内网大模型 API（已确认可用）      | 零本地部署，OpenAI 兼容格式 HTTP 调用  |
| 语言         | Node.js（接入现有 server.js）     | 无需引入 Python 环境                    |

## 新增依赖（最小化）

```json
{
  "pdf-parse": "^1.1.1"
}
```

若 embedding 接口不可用，额外添加：
```json
{
  "@xenova/transformers": "^2.17.2"
}
```

## 关键配置（环境变量）

```env
RAG_LLM_BASE_URL=http://internal-llm:8080/v1   # 内部 LLM base url
RAG_LLM_MODEL=qwen2.5-7b                        # 模型名
RAG_EMBEDDING_BASE_URL=http://internal-llm:8080/v1  # embedding 接口（同服务或不同）
RAG_EMBEDDING_MODEL=bge-m3                       # embedding 模型名
RAG_TOP_K=5                                      # 检索片段数（rerank 前）
RAG_TOP_N=3                                      # rerank 后保留数
RAG_CHUNK_SIZE=500                               # 分块大小（字符）
RAG_RERANK_BASE_URL=http://internal-rerank:8080  # 内网 rerank 服务
```

## 需修改的文件

- `server/server.js` - 注册 rag router，上传成功后触发增量索引
- `schedule.html` - 新增文档问答 UI 入口

## 新增文件

- `server/rag/indexer.js` - 文档解析 + 索引构建
- `server/rag/searcher.js` - 向量相似搜索
- `server/rag/router.js` - Express 路由定义
- `server/rag-index.json` - 向量索引持久化存储（运行时生成）

## 验证方案

1. 启动后端，访问 `GET /api/rag/status` 确认索引已建立
2. 调用 `POST /api/rag/reindex` 手动索引现有文档
3. 用 curl 测试 `POST /api/rag/query` 返回结果含答案和来源
4. 在前端 UI 中提问"LangSmith 有哪些功能"应能检索到对应 PDF 内容
5. 上传新文档后，再次提问确认增量索引生效

## 检索策略演进路线（可插拔设计）

Phase 1 就要以 **策略模式（Strategy Pattern）** 设计检索层，
确保后续增强无需重构核心逻辑。

### 检索策略接口设计

```javascript
// server/rag/strategies/base.js
// 每种策略实现相同接口
class BaseRetriever {
  async retrieve(query, topK) {
    // 返回: [{ content, metadata, score }]
  }
}
```

### Phase 2: 混合检索（Hybrid Search）

**稠密向量 + 稀疏关键词（BM25）双路检索，RRF 融合排序**

```
用户提问
   ├── 稠密检索: embedding 向量 → 语义相似 Top-K
   └── 稀疏检索: BM25 关键词 → 精确匹配 Top-K
             ↓
        RRF (Reciprocal Rank Fusion) 融合
             ↓
        最终排序结果
```

- BM25 实现: `wink-bm25-text-search` npm 包（纯 JS，无依赖）
- 索引同步: 文档入库时同时建立向量索引 + BM25 倒排索引
- 适合场景: 查询包含专有名词、工具名、作者名时精度更高

### Phase 3: 查询路由（Query Router）

**用内网 LLM 判断 query 意图，动态选择检索策略**

```
用户提问 → LLM 路由分类器
   ├── 事实型问题（"X 是什么"）       → 向量检索
   ├── 比较型问题（"X 和 Y 的区别"）  → 混合检索
   ├── 关系型问题（"谁研究了 X"）     → 图检索
   └── 总结型问题（"最近学了哪些"）   → 全文检索 + LLM 综合
```

路由 Prompt 示例（调用内网 LLM）:
```
判断以下问题的类型: "{query}"
输出 JSON: {"type": "factual|comparative|relational|summary"}
```

### Phase 4: 图谱检索（Graph RAG）

**构建知识图谱，支持关系型推理**

```
文档 → LLM 抽取实体和关系 → 知识图谱（JSON 存储）
        ↓
查询时: 实体识别 → 图遍历 → 子图召回 → LLM 推理
```

知识图谱结构（`server/rag-graph.json`）:
```json
{
  "entities": {
    "MinerU": { "type": "tool", "description": "...", "docs": ["file1.md"] },
    "龚丽":   { "type": "person", "docs": ["file1.md", "file2.md"] }
  },
  "relations": [
    { "from": "龚丽", "rel": "分享了", "to": "MinerU", "source": "file1.md" }
  ]
}
```

- 实体抽取: 调用内网 LLM（无额外服务）
- 图遍历: 纯 JS 实现（`graphology` npm 包）
- 无需 Neo4j / ArangoDB 等图数据库（文档规模不值当）

### 整体架构（含路由）

```
用户提问
   |
Query Router (LLM 意图分类)
   |
   ├─ VectorRetriever    (Phase 1: 向量检索)
   ├─ HybridRetriever    (Phase 2: 向量 + BM25)
   └─ GraphRetriever     (Phase 4: 知识图谱)
   |
ReRanker (内网 rerank 模型，Phase 1 即可启用)
   |
Context Builder (拼装 Prompt)
   |
内网 LLM → 生成答案 + 引用
```

## 未来可选扩展

- 若后续有大量扫描版 PDF → 接入 MinerU 作为独立解析服务
- 若文档超千份 → 迁移到 Qdrant（Docker 部署，REST API）
- 若需要权限控制 → 按周次/上传者过滤检索范围
- ReRank 模型：**内网已有**，可直接接入到检索后排序步骤中（Phase 1 就可启用）
