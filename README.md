# 知识分享排班表系统

> 用于管理团队知识分享活动的 Web 应用系统，内置文档库与 AI 问答功能

## 📋 项目简介

知识分享排班表系统是一个轻量级的 Web 应用，用于管理和追踪团队的知识分享活动。支持排班管理、文件上传、文档库检索、AI 文档问答、任务追踪、数据备份等功能。

前端为 `schedule.html + 原生 JS Modules`，无需构建步骤；后端为 Node.js + json-server，数据存储在本地 JSON 文件和文件系统中。

## ✨ 核心功能

- 📅 **排班管理** — 人员分配、主题编辑、备注管理
- 📁 **文件管理** — 上传/下载/预览文件，按日期自动分类存储
- 📚 **分享文档库** — 汇总所有分享文档，支持搜索、排序、分页、批量下载、内联预览
- 🤖 **文档问答（RAG）** — 基于已上传文档的 AI 对话问答，答案附带可点击来源引用
- ✅ **任务追踪** — 任务完成状态跟踪，过期自动勾选
- 📊 **统计分析** — 实时统计各成员完成情况
- 📝 **留言板** — 团队留言和公告
- 📝 **操作日志** — 记录所有编辑和文件操作
- 🔄 **自动备份** — 定期自动备份数据和文件

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装后端依赖
cd server
npm install
cd ..

# 2. （可选）配置 RAG 文档问答
cp server/.env.example server/.env
# 编辑 server/.env，填写内网 LLM 和 Embedding 服务地址

# 3. 启动后端服务（终端 1）
./start-backend.sh

# 4. 启动前端服务（终端 2）
./start-frontend.sh

# 5. 访问应用
open http://localhost:8000/schedule.html
```

### 服务器部署

```bash
# 1. 打包项目
./pack-for-deploy.sh

# 2. 上传到服务器
scp schedule-app-*.tar.gz user@server:/path/

# 3. 在服务器上解压并部署
# 详见 DEPLOY.md
```

## 📂 项目结构

```
schedule-app/
├── schedule.html           # 页面结构与样式
├── js/
│   ├── api.js              # API 调用封装
│   ├── schedule.js         # 页面初始化与排班逻辑
│   ├── document-library.js # 文档库、上传、预览、分页
│   ├── rag-chat.js         # 文档问答
│   ├── message-board.js    # 留言板
│   └── stats.js            # 统计渲染
├── smoke-test.sh           # 页面 smoke test 入口
├── scripts/
│   └── smoke_test.py       # Playwright smoke test 实现
├── start-backend.sh        # 后端启动脚本（自动加载 .env）
├── start-frontend.sh       # 前端启动脚本
├── pack-for-deploy.sh      # 打包脚本
├── backup.sh               # 备份脚本
├── restore.sh              # 恢复脚本
├── README.md               # 项目说明（本文档）
├── BACKUP.md               # 备份指南
├── LOGS.md                 # 日志说明
├── crontab.example         # 定时任务示例
├── backups/                # 备份文件目录
└── server/
    ├── server.js           # Node.js 后端服务
    ├── db.json             # JSON 数据库
    ├── package.json        # 依赖配置
    ├── .env.example        # RAG 配置模板
    ├── .env                # RAG 配置（本地填写，不提交）
    ├── operation.log       # 操作日志
    ├── rag-index.json      # RAG 向量索引（运行时生成，不提交）
    ├── uploads/            # 文件上传目录
    └── rag/                # RAG 文档问答模块
```

## 🔧 技术栈

### 前端
- HTML5 / CSS3 / JavaScript（无框架，无构建）
- marked.js（Markdown 渲染）+ DOMPurify（XSS 防护）

### 后端
- Node.js >= 18.0.0
- Express.js（通过 json-server）
- Multer 2.1.1（文件上传）
- lowdb（JSON 数据库）
- pdf-parse（PDF 文本提取）

### RAG 组件（均调用内网服务，本机零模型部署）
| 组件 | 方式 |
|------|------|
| Embedding | 内网服务（OpenAI 兼容 `/embeddings` 接口） |
| 向量存储 | 本地 JSON 文件（百级 chunk，暴力余弦搜索 < 10ms） |
| ReRank | 内网 rerank 服务（可选，不配置则跳过） |
| LLM 推理 | 内网大模型（OpenAI 兼容 `/chat/completions` 接口） |

### 部署
- Python 3.x（前端静态服务器）
- PM2（进程管理，可选）
- Nginx（反向代理，可选）

## 🎯 功能详情

### 排班管理

- **灵活编辑**：双击编辑主题和备注，支持换行（`Option/Shift+Enter`）
- **实时保存**：编辑内容自动保存到服务器
- **人员分配**：T1（AI/产品工具）、T2（论文/开源项目）、T3（技术主题）
- **假期标记**：支持标记节假日

### 文件管理

- **按日期分类**：上传的文件按排班日期自动归档到 `uploads/{date}/`
- **进度显示**：实时显示上传进度条
- **大小限制**：单个文件最大 50MB，最多同时上传 10 个
- **内联预览**：Markdown 渲染预览、PDF 嵌入预览、纯文本预览
- **文件删除**：删除文件时同步清理 RAG 向量索引
- **目录自动识别**：支持直接把文件放进 `server/uploads/{date}/`，后端会自动同步到文档库并触发增量索引

### 分享文档库

- **统一视图**：汇总所有排班记录的上传文件
- **搜索排序**：按文件名搜索，按上传时间/文件名排序
- **分页浏览**：每页 10 条，支持翻页
- **批量下载**：勾选多个文件一键打包下载
- **内联预览**：点击文件名直接在页面内全屏预览

### 文档问答（RAG）

- **对话式问答**：输入问题，AI 从已上传文档中检索相关内容作答
- **来源引用**：答案下方展示引用的文件来源和命中摘要，点击标签可直接预览原文档
- **多轮对话**：保留最近 3 轮上下文，追问时会先改写为独立检索问题
- **清空对话**：一键清除历史记录
- **索引管理**：页面顶部显示索引状态（文件数/chunk 数），支持手动重建索引
- **增量更新**：上传新文件后自动触发异步增量索引，删除/同名覆盖文件时同步清理旧索引

## ⚙️ RAG 配置

复制配置模板并填写内网服务地址：

```bash
cp server/.env.example server/.env
```

`server/.env` 示例：

```env
# 内网 LLM（OpenAI 兼容格式）
RAG_LLM_BASE_URL=http://internal-llm:8080/v1
RAG_LLM_MODEL=qwen2.5-7b

# Embedding 服务
RAG_EMBEDDING_BASE_URL=http://internal-llm:8080/v1
RAG_EMBEDDING_MODEL=bge-m3

# ReRank 服务（可选，不配置则跳过重排序）
RAG_RERANK_BASE_URL=http://internal-rerank:8080
RAG_RERANK_MODEL=bge-reranker-v2-m3

# 检索参数（可选，以下为默认值）
RAG_TOP_K=5        # 向量检索召回数
RAG_TOP_N=3        # ReRank 后保留数
RAG_MIN_VECTOR_SCORE=0.28   # 低于该相似度的召回结果会被过滤
RAG_MIN_RERANK_SCORE=0.08   # ReRank 过低时直接拒答
RAG_REWRITE_HISTORY_TURNS=2 # 追问时用于改写检索问题的历史轮数
RAG_CHUNK_SIZE=500 # 分块大小（字符数）
RAG_CHUNK_OVERLAP=80 # 相邻 chunk 重叠字符数
RAG_EMBED_BATCH_SIZE=32 # 每批 Embedding 请求包含的 chunk 数
RAG_EMBEDDING_DECIMALS=6 # 向量写盘保留小数位，降低索引体积与内存占用

# RAG 请求超时与重试（可选）
RAG_HTTP_TIMEOUT_MS=30000
RAG_HTTP_RETRIES=2
RAG_HTTP_RETRY_DELAY_MS=800
```

> `.env` 文件已加入 `.gitignore`，不会被提交。
> 启动脚本（`start-backend.sh`）和 `server.js` 均会自动加载同目录下的 `.env`，已有 shell 环境变量优先级更高。
> 若内网网关偶发 `ECONNRESET` / `ETIMEDOUT`，可适当提高 `RAG_HTTP_TIMEOUT_MS` 与 `RAG_HTTP_RETRIES`。
> 若 `rag-index.json` 已经较大，部署本次优化后建议执行一次「重建索引」，会把索引改为紧凑格式并降低查询时内存峰值。

### 初始化索引

配置完成后，首次使用需手动触发全量索引：

```bash
# 方式 1：在页面"文档问答"区域点击「重建索引」按钮

# 方式 2：直接调用 API
curl -X POST http://localhost:3000/api/rag/reindex
```

### RAG API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/rag/status` | 查看索引状态（文件数、chunk 数、是否配置） |
| `POST` | `/api/rag/reindex` | 全量重建向量索引 |
| `POST` | `/api/rag/query` | 问答查询，body: `{ query, history? }` |

说明：

- `query` 会先做向量召回，再根据可选的 ReRank 分数做二次过滤；若证据不足会直接拒答。
- 有 `history` 时，系统会先把追问改写成可独立检索的问题，再进入召回流程。

## 🧪 Smoke Test

页面级 smoke test 使用 Python Playwright，覆盖以下主流程：

- 文件上传
- 文档预览
- 留言板新增 / 编辑 / 删除
- 文档库分页
- RAG 重建索引、问答与来源回跳

首次执行前需要安装 Playwright：

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

执行 smoke test：

```bash
./smoke-test.sh
```

常用参数：

```bash
./smoke-test.sh --skip-rag
./smoke-test.sh --keep-artifacts
./smoke-test.sh --artifacts-dir ./tmp/smoke
```

说明：

- 脚本会自动复用已运行的本地前后端；若未启动，则自动拉起并在测试结束后关闭
- 测试会临时上传 5 个 Markdown 文件，并在结束后自动删除
- 留言板数据会在测试结束后恢复
- 默认会执行一次 RAG 重建索引；若当前环境未配置 RAG，可用 `--skip-rag` 跳过

## 📝 使用说明

### 上传文件

1. 点击对应行的"📤 上传"按钮
2. 选择一个或多个文件（最大 50MB）
3. 等待上传完成，文件自动按日期分类保存
4. 上传成功后系统自动在后台触发 RAG 增量索引

### 直接放入目录

1. 将文件直接放入 `server/uploads/{date}/`，例如 `server/uploads/2026-01-02/xxx.md`
2. 后端会按 `UPLOAD_SYNC_INTERVAL_MS` 周期自动扫描目录
3. 新文件会自动写入 `db.json`，出现在文档库，并触发增量索引
4. 删除或覆盖目录中的文件后，也会自动同步到文档库和 RAG 索引

> 目录名需能匹配排班日期（如 `2026-01-02`）或 `schedule_{id}`；否则会被跳过并在后端日志中提示。

### 文档问答

1. 向内网 LLM / Embedding 服务确认可达
2. 配置 `server/.env` 并重启后端
3. 点击「重建索引」或上传新文件触发自动索引
4. 在"文档问答"区域输入问题，按 `Enter` 发送
5. AI 回答下方的来源标签可点击，直接预览原文档

### 查看日志

```bash
tail -f backend.log           # 后端运行日志（含 RAG 索引日志）
tail -f server/operation.log  # 操作记录日志

# 查看今天的操作
grep "$(date +%Y-%m-%d)" server/operation.log

# 查看 RAG 相关日志
grep "\[RAG\]" backend.log
```

### 备份数据

```bash
# 手动备份（包含 db.json 和 uploads/）
./backup.sh

# 定时自动备份
0 2 * * * cd /path/to/schedule-app && ./backup.sh >> backups/backup.log 2>&1
```

> `rag-index.json` 无需备份，可随时通过「重建索引」从原始文件重新生成。

## 🔐 安全建议

1. **使用 Nginx**：配置反向代理和 HTTPS
2. **防火墙规则**：限制 3000 端口只对内网开放
3. **定期备份**：配置自动备份
4. **查看日志**：定期检查操作日志
5. **保护 .env**：确保 `.env` 不被公开访问

## 🛠️ 常用命令

```bash
# 开发环境
./start-backend.sh           # 启动后端（自动加载 .env）
./start-frontend.sh          # 启动前端

# 打包部署
./pack-for-deploy.sh         # 生成部署包

# 数据管理
./backup.sh                  # 备份数据
./restore.sh                 # 恢复数据

# 查看日志
tail -f backend.log          # 后端日志
tail -f server/operation.log # 操作日志

# RAG 管理
curl http://localhost:3000/api/rag/status           # 查看索引状态
curl -X POST http://localhost:3000/api/rag/reindex  # 重建索引

# PM2 管理（生产环境）
pm2 start server/server.js --name schedule-backend
pm2 status
pm2 logs
pm2 restart all
```

## 🔍 故障排查

### 端口被占用

```bash
lsof -i :3000
lsof -i :8000
kill -9 <PID>
```

### 无法访问

1. 检查服务是否运行：`ps aux | grep node`
2. 检查防火墙：`sudo ufw allow 3000`
3. 查看日志：`tail -f backend.log`

### RAG 显示"未配置"

1. 确认 `server/.env` 已创建，且 `RAG_LLM_BASE_URL` / `RAG_EMBEDDING_BASE_URL` 已填写
2. 重启后端服务（配置变更需重启生效）
3. 访问 `GET /api/rag/status` 确认 `configured: true`

### RAG 回答旧内容 / 找不到新文件

```bash
# 手动重建全量索引
curl -X POST http://localhost:3000/api/rag/reindex
```

### 数据丢失

```bash
./restore.sh   # 交互式恢复最近备份
```

## 📈 更新日志

### v2.0.0（当前版本）

- ✅ **文档问答 RAG**：基于内网 LLM + Embedding，支持多轮对话、来源引用预览
- ✅ **向量索引**：上传自动增量索引，删除/同名覆盖自动清理旧索引
- ✅ **来源跳转**：答案引用标签点击直接预览原文档
- ✅ **ReRank 支持**：可接入内网 rerank 服务二次排序
- ✅ **策略层设计**：BaseRetriever 接口，便于后续接入混合检索、图谱检索
- ✅ **.env 自动加载**：启动脚本和服务端双重兜底加载配置

### v1.1.0

- ✅ 分享文档库（分页、搜索、批量下载）
- ✅ 文件内联预览（Markdown / PDF / 文本）
- ✅ Markdown 渲染（marked.js + DOMPurify）

### v1.0.0

- ✅ 基础排班管理
- ✅ 文件上传/下载（按日期分类）
- ✅ 上传进度条
- ✅ 自动过期任务勾选
- ✅ 操作日志
- ✅ 自动备份
- ✅ 留言板与统计分析

## 📚 文档说明

| 文档 | 说明 |
|------|------|
| **README.md** | 项目总体说明（本文档） |
| **BACKUP.md** | 数据备份与恢复完整指南 |
| **LOGS.md** | 操作日志使用说明 |
| **DEPLOY.md** | 服务器部署详细步骤（打包后生成） |
| **server/.env.example** | RAG 配置模板 |
| **crontab.example** | 定时任务配置示例 |

## 📄 许可证

MIT License

---

**快速链接：**
[备份说明](BACKUP.md) · [日志说明](LOGS.md) · [定时任务示例](crontab.example) · [RAG 配置模板](server/.env.example)
