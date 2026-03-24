# RAGFlow 集成方案（可实施版）

## 目标

把当前已禁用的本地 RAG 替换为可控的 RAGFlow 集成，同时满足下面 4 个约束：

1. 前端现有文档问答 UI 尽量少改
2. 上传/删除/定时扫描 `server/uploads/` 的现有链路不能断
3. 来源引用仍然能回到本项目文件预览
4. 切换期间允许保留旧 `server/rag/` 代码，避免一次性硬切

结论：采用“两阶段上线 + 一层后端兼容接口”的方案。

---

## 核心决策

### 1. 前端接口不改路径，只改后端 provider

保留现有前端调用的 3 个接口：

- `GET /api/rag/status`
- `POST /api/rag/reindex`
- `POST /api/rag/query`

不要让前端改成 `/api/ragflow/*`。

原因：

- 现有前端已经绑定这 3 个接口，[js/api.js](/Users/weijia/Library/Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/js/api.js)
- 现有聊天 UI 已经依赖固定返回格式，[js/rag-chat.js](/Users/weijia/Library/Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/js/rag-chat.js)
- 把切换成本收敛在后端，后续想从 RAGFlow 再切别的 provider 也更容易

### 2. 模式开关放后端，不放前端常量

把当前前端硬编码的 `RAG_ENABLED = false` 改成后端配置驱动：

- `disabled`
- `iframe`
- `ragflow`
- `local`（保留旧本地 RAG，便于回退）

新增：

- `GET /api/rag/config`

返回示例：

```json
{
  "mode": "iframe",
  "iframeUrl": "http://10.8.3.99/next-chats/share?...",
  "provider": "ragflow"
}
```

### 3. 文档同步必须接管现有全链路

不能只改“上传时索引”和“删除时移除”两处。

当前服务里还有一条已有链路会持续扫描 `server/uploads/` 并自动对账：

- 启动时执行一次
- 之后按定时器持续执行

见：

- [server/server.js#L114](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/server/server.js#L114)
- [server/server.js#L972](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/server/server.js#L972)

因此，RAGFlow 同步实现必须挂到这条链路里，而不是只挂在上传/删除接口里。

### 4. 查询能力按“先探测、再选实现”落地

RAGFlow 不同版本的 API 返回结构、流式行为、引用字段可能有差异。  
所以 `query` 实现不能先假设某个接口一定满足需求，而要先做一次能力探测。

查询实现按两个层次准备：

- 路径 A：RAGFlow 聊天接口可直接返回稳定的 `answer + references`
- 路径 B：如果聊天接口不稳定，则改为“RAGFlow 负责检索，服务端负责结果整形和必要的二次生成”

### 5. 当前版本不做周次/日期过滤

本轮集成明确移除：

- 日期范围过滤
- 周次过滤

原因：

- 当前阶段的目标是先稳定接入 RAGFlow、跑通来源回链和文档同步
- 如果检索阶段不能严格约束候选文档，过滤器会形成误导性的产品语义
- 与其保留一个“展示层看起来有过滤、答案实际未被严格约束”的能力，不如先删掉

后续如果要恢复过滤，前提是先确认 provider 能在检索或生成前严格约束文档范围。

### 6. 知识图谱是可选增强项，不进入主链路

RAGFlow 生成的知识图谱可以接入本项目，但当前只建议作为可选展示能力：

- 用于图谱查看
- 用于辅助浏览实体关系
- 用于后续扩展“从图谱节点跳回文档”

当前不建议把知识图谱纳入主问答链路，原因：

- 不同版本的 RAGFlow 图谱接口路径和可用性存在差异
- 图谱接口的返回结构是否稳定，需要先做能力探测
- 问答主链路当前优先目标仍然是文档同步、来源回链和查询稳定性

---

## 总体架构

### 前端

前端继续只认识一套 RAG UI：

- `js/api.js`
- `js/rag-chat.js`
- `js/schedule.js`
- `schedule.html`

其中：

- `disabled` 模式：隐藏整块 RAG UI
- `iframe` 模式：显示 iframe 容器，隐藏原聊天控件
- `ragflow` / `local` 模式：走原来的聊天 UI

### 后端

后端新增一层 provider 适配：

- `server/rag/router.js`
- `server/rag/config.js`
- `server/rag/provider.js`
- `server/rag/providers/local.js`
- `server/rag/providers/ragflow.js`
- `server/ragflow/client.js`
- `server/ragflow/sync.js`
- `server/ragflow/doc-map.json`

职责划分：

- `router.js`：对前端保持统一 API
- `config.js`：读取模式与环境变量
- `provider.js`：按模式选择 provider
- `providers/local.js`：适配现有本地 RAG
- `providers/ragflow.js`：适配 RAGFlow
- `ragflow/client.js`：封装 RAGFlow HTTP 调用
- `ragflow/sync.js`：处理文档同步和映射表

---

## Phase 0：能力探测与契约冻结

目标：不要在接口假设不稳的情况下直接写代码。

### 需要确认的事项

1. RAGFlow iframe 页面是否允许被当前页面嵌入
2. 聊天接口是否支持非流式 JSON 返回
3. 聊天接口或检索接口是否能拿到来源引用
4. 文档上传后如何查询解析状态
5. 文档列表接口是否能稳定返回 `document_id`
6. 删除文档接口是否支持按 ID 删除
7. 是否存在可用的知识图谱查询接口
8. 图谱接口返回是否包含稳定的 `graph` / `mind_map` 结构

### 输出物

形成一页兼容性结论，至少包含：

- 可用接口列表
- 每个接口的请求示例
- 返回字段示例
- 是否流式
- 是否含引用
- 是否支持知识图谱查询
- 当前部署版本下的推荐调用路径

### 决策门

只有在这一步确认完后，才进入 API 代理开发。

---

## Phase 1：Iframe 验证版

目标：最小改动验证 RAGFlow 的问答效果。

### 配置

`server/.env`

```env
RAG_MODE=iframe
RAG_PROVIDER=ragflow
RAGFLOW_IFRAME_URL=http://10.8.3.99/next-chats/share?shared_id=<ID>&from=chat&auth=<TOKEN>&theme=light
```

### 后端改动

#### `server/rag/config.js`

读取：

- `RAG_MODE`
- `RAG_PROVIDER`
- `RAGFLOW_IFRAME_URL`

#### `server/rag/router.js`

新增：

- `GET /api/rag/config`

返回：

```json
{
  "mode": "iframe",
  "provider": "ragflow",
  "iframeUrl": "..."
}
```

### 前端改动

#### `js/schedule.js`

不再硬编码 `RAG_ENABLED`，改为启动时读取 `/api/rag/config`：

- `mode === 'disabled'`：隐藏 `.rag-chat-section`
- `mode === 'iframe'`：显示 iframe 模式
- `mode === 'local' || mode === 'ragflow'`：初始化现有聊天 UI

#### `schedule.html`

在 `.rag-chat-section` 中增加一个 iframe 容器，例如：

```html
<div id="ragIframeContainer" class="rag-iframe-container" hidden></div>
```

iframe 模式下：

- 隐藏 `.rag-header` 中的状态和“重建索引”操作
- 隐藏输入框和消息列表
- 显示 iframe 容器

#### `js/rag-chat.js`

只做最小补充：

- 暴露一个 `mountRagIframe(url)` 辅助方法，负责挂载 iframe
- 不改现有聊天逻辑

#### `schedule.html` 和 `js/rag-chat.js` 的额外收敛

当前版本直接移除周次/日期过滤 UI 与逻辑：

- 删掉 `.rag-filters` 区域
- 删掉 `ragCollectFilters()`
- `query` 只发送 `query + history`

### 验收标准

1. 页面能正常显示 RAGFlow iframe
2. iframe 不被浏览器拒绝加载
3. 使用固定问题集完成至少 5 个并行对比测试
4. 对比结果至少覆盖：回答正确性、引用相关性、是否能定位到正确文件
5. 明确记录 iframe 方案的局限：
   - 无文件预览跳转
   - 新文件需手动同步

---

## Phase 2：后端兼容接口 + Provider 抽象

目标：在不打破前端接口的前提下，把 provider 切到 RAGFlow。

### 配置

`server/.env`

```env
RAG_MODE=ragflow
RAG_PROVIDER=ragflow
RAGFLOW_BASE_URL=http://10.8.3.99
RAGFLOW_API_KEY=<KEY>
RAGFLOW_DATASET_ID=<DATASET_ID>
RAGFLOW_CHAT_ID=<CHAT_ID>
```

### 文件改动

#### 新建 `server/rag/config.js`

统一输出：

- 当前模式
- 当前 provider
- 缺失配置项
- 是否可用

#### 新建 `server/rag/provider.js`

暴露统一接口：

```js
{
  getConfig(),
  getStatus(req),
  reindex(req),
  query(req, payload)
}
```

#### 新建 `server/rag/providers/local.js`

把当前 `server/rag/router.js` 内的本地实现逻辑搬进去，作为兼容 provider。

#### 新建 `server/rag/providers/ragflow.js`

封装 RAGFlow provider，实现和 `local.js` 一样的统一方法。

#### 改造 `server/rag/router.js`

`router.js` 不再直接写本地 RAG 逻辑，只做：

- 参数校验
- 调用 provider
- 返回统一格式

### 对前端保持不变的契约

#### `GET /api/rag/status`

至少保留下面字段：

```json
{
  "success": true,
  "configured": true,
  "provider": "ragflow",
  "mode": "ragflow",
  "totalFiles": 12,
  "totalChunks": 320,
  "parsing": 1
}
```

说明：

- `totalChunks` 在 RAGFlow 下可以是近似值或不可用值
- 如果 RAGFlow 拿不到 chunk 数，可返回 `null`
- 前端要允许 `totalChunks == null` 时展示“文档已同步”

#### `POST /api/rag/reindex`

仍然保留这个路径，但语义改为：

- 本地 RAG 模式：重建本地索引
- RAGFlow 模式：触发全量同步任务

返回示例：

```json
{
  "success": true,
  "provider": "ragflow",
  "started": true,
  "files": 12,
  "uploaded": 2,
  "deleted": 1,
  "parsing": 3
}
```

#### `POST /api/rag/query`

请求仍然接收：

```json
{
  "query": "...",
  "history": []
}
```

返回仍然保持：

```json
{
  "success": true,
  "answer": "...",
  "sources": [
    {
      "filename": "MinerU2.5.pdf",
      "date": "2025-12-05",
      "week": 2,
      "scheduleId": 2,
      "fileIndex": 0,
      "downloadUrl": "/schedule/2/files/0",
      "snippet": "..."
    }
  ]
}
```

---

## Phase 3：文档同步接管

目标：让 RAGFlow 的知识库和本项目文件状态保持一致。

### 映射表设计

新建：

- `server/ragflow/doc-map.json`

不要使用单纯的 `{date}::{filename}` 作为唯一键。  
更稳的主键应与当前服务的文件归属一致，建议使用：

```text
{scheduleId}::{relativePath}
```

映射表示例：

```json
{
  "2::uploads/2025-12-05/MinerU2.5.pdf": {
    "documentId": "ragflow-doc-xxx",
    "scheduleId": 2,
    "date": "2025-12-05",
    "week": 2,
    "filename": "MinerU2.5.pdf",
    "relativePath": "uploads/2025-12-05/MinerU2.5.pdf",
    "size": 123456,
    "mtimeMs": 1760000000000
  }
}
```

### 上传到 RAGFlow 的命名规则

建议命名为：

```text
{scheduleId}__{date}__{filename}
```

例如：

```text
2__2025-12-05__MinerU2.5.pdf
```

原因：

- 比 `{date}__{filename}` 更稳
- 查询引用时更容易兜底解析
- 同名文件跨日期或跨排班时不冲突

### 新建 `server/ragflow/sync.js`

提供：

- `syncAllDocuments({ schedules })`
- `syncSingleFile({ schedule, file })`
- `removeSyncedFile({ schedule, file })`
- `getSyncStatus()`

### 必须接入的 3 条链路

#### 1. 上传接口

在 [server/server.js#L383](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/server/server.js#L383) 上传成功后，异步触发 `syncSingleFile()`。

#### 2. 删除接口

在 [server/server.js#L500](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/server/server.js#L500) 删除成功后，异步触发 `removeSyncedFile()`。

#### 3. 定时 uploads 对账

在 [server/server.js#L114](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/server/server.js#L114) 的 `syncUploadsDirectoryOnce()` 内，不再直接写死 `indexSingleFile/removeFromIndex`，而是改成调用“当前 provider 的增量同步动作”。

这是本方案最关键的接线点。

### 同步策略

#### 新增文件

- 上传到 RAGFlow
- 记录 `documentId`
- 触发解析
- 更新 `doc-map.json`

#### 文件内容变化

- 先删旧 `documentId`
- 再重新上传
- 更新 `mtimeMs/size`

#### 文件删除

- 从 RAGFlow 删除 `documentId`
- 从映射表删除

#### 映射丢失

- 以 RAGFlow 文档列表 + 本地扫描结果做一次对账
- 对未知远端文档标记为孤儿文档，不直接删除
- 只在人工确认或全量同步模式下清理

---

## Phase 4：查询代理

目标：让现有聊天 UI 在 RAGFlow provider 下继续工作。

### 实现优先级

#### 路径 A：直连聊天接口

适用条件：

- RAGFlow 当前版本支持非流式返回
- 返回中能稳定拿到来源引用
- 返回中的引用能映射回 `documentId`

实现：

1. `query` 收到问题和历史
2. 调用 RAGFlow chat completion
3. 解析回答和引用
4. 通过 `doc-map.json` + `db.json` 反查 `scheduleId/fileIndex`
5. 返回前端兼容格式

#### 路径 B：检索优先模式

适用条件：

- 聊天接口返回结构不稳定
- 引用字段不全

实现：

1. 先调 RAGFlow retrieval 拿候选片段
2. 组织来源列表
3. 再决定：
   - 直接把片段摘要返回给前端，或
   - 用现有 LLM 生成最终回答

### 来源映射策略

前端现在依赖：

- `scheduleId`
- `fileIndex`

见：

- [js/rag-chat.js#L40](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/js/rag-chat.js#L40)
- [js/document-library.js#L620](/Users/weijia/Library%20Mobile%20Documents/com~apple~CloudDocs/code/ai/claude_demo/schedule-app/js/document-library.js#L620)

因此后端映射时仍然要实时从 `db.json` 查当前 `fileIndex`，不要把 `fileIndex` 固化在映射表里。

流程：

1. 先从引用拿到 `documentId` 或上传名
2. 通过 `doc-map.json` 找到 `scheduleId + filename + relativePath`
3. 再从当前 `db.json` 查 `fileIndex`
4. 生成 `downloadUrl`

---

## Phase 5：知识图谱可选集成

目标：把 RAGFlow 已生成的知识图谱作为独立能力接进项目，但不干扰主问答链路。

### 集成边界

当前只做两层能力：

#### 层 1：图谱查看

提供一个只读图谱视图，展示：

- 实体节点
- 关系边
- RAGFlow 返回的 `mind_map` 或等价结构

#### 层 2：图谱跳文档

只有在图谱节点或边能稳定关联到文档来源时，才继续做：

- 点击节点后回查相关文档
- 从节点跳到本项目文件预览

### 不纳入本阶段的能力

- 不把知识图谱作为主问答检索入口
- 不让图谱替代现有来源引用
- 不在 Phase 5 初版里做图谱编辑

### 推荐接口设计

后端保留统一风格，新增只读接口：

- `GET /api/rag/knowledge-graph/status`
- `GET /api/rag/knowledge-graph`

返回示例：

```json
{
  "success": true,
  "provider": "ragflow",
  "available": true,
  "graph": {
    "nodes": [],
    "edges": []
  },
  "mindMap": {}
}
```

### 建议文件

- `server/ragflow/knowledge-graph.js`
- `server/rag/providers/ragflow.js`
- `js/knowledge-graph.js`

### 实现顺序

1. Phase 0 中先确认图谱接口真实可用
2. 先做后端代理与只读接口
3. 再做前端图谱展示
4. 最后才评估是否支持“节点跳文档”

### 验收标准

1. 能稳定获取图谱数据而不是依赖页面抓取
2. 图谱接口异常不会影响主问答接口
3. 图谱页加载失败时有独立错误提示
4. 如实现跳文档，至少能完成一条从节点到文件预览的闭环

---

## 具体文件改动清单

### 必改

- `server/server.js`
- `server/rag/router.js`
- `js/schedule.js`
- `js/rag-chat.js`
- `schedule.html`

### 新建

- `server/rag/config.js`
- `server/rag/provider.js`
- `server/rag/providers/local.js`
- `server/rag/providers/ragflow.js`
- `server/ragflow/client.js`
- `server/ragflow/sync.js`
- `server/ragflow/doc-map.json`

### 可选新建

- `server/ragflow/knowledge-graph.js`
- `js/knowledge-graph.js`

### 暂不删除

- `server/rag/indexer.js`
- `server/rag/searcher.js`
- `server/rag/runtime.js`
- `server/rag/reranker.js`
- `server/rag-index.json`
- `server/bm25-index.json`

在 RAGFlow 稳定跑过一轮后，再考虑清理。

---

## 实施顺序

### Milestone 1：Iframe 验证

改动量最小，先确认问答质量值不值得继续。

### Milestone 2：统一配置与模式切换

先把 `/api/rag/config` 和 `RAG_MODE` 跑通，让前端不再依赖硬编码开关。

### Milestone 3：Provider 抽象

把本地 RAG 逻辑从 `router.js` 中拆出，形成 `local` 和 `ragflow` 两个 provider。

### Milestone 4：文档同步接管

优先接管定时 `uploads` 对账链路，再接上传/删除增量同步。

### Milestone 5：查询代理

完成基本问答与来源回链。

### Milestone 6：知识图谱可选接入

只有在图谱接口已在 Phase 0 被确认可用时，才进入这一阶段。

### Milestone 7：灰度切换

先在 `.env` 中切到：

```env
RAG_MODE=ragflow
```

确认稳定后再考虑停用本地 RAG。

---

## 验收标准

### 功能验收

1. `disabled / iframe / ragflow / local` 四种模式切换正常
2. iframe 模式可正常加载 RAGFlow 页面
3. ragflow 模式下现有聊天 UI 可正常提问
4. 来源引用可跳回本地文件预览
5. 上传新文件后可自动同步到 RAGFlow
6. 删除文件后可从 RAGFlow 移除
7. 启动同步和定时同步不会绕过 provider

### 可选功能验收

1. 知识图谱接口可独立访问
2. 图谱展示不会阻塞主页面加载
3. 图谱能力关闭时不影响主 RAG 功能

### 稳定性验收

1. RAGFlow 宕机时 `status` 能显示离线或异常
2. 查询失败时前端有明确错误提示
3. 同步失败不会阻塞文件上传和删除主流程
4. 映射表损坏时可以通过全量同步恢复

### 数据一致性验收

1. 本地文件数与 RAGFlow 文档数大体一致
2. 映射表中每个 `documentId` 都能回查到本地文件
3. 删除后不会残留错误引用

---

## 风险与处理

### 1. iframe 被拒绝嵌入

处理：

- 终止 iframe 路线
- 直接进入 API 代理路线

### 2. RAGFlow 聊天接口是 SSE 或字段不稳定

处理：

- 在 `client.js` 中单独实现聊天请求
- 不强行复用只支持 JSON 的封装
- 必要时走“检索优先模式”

### 3. 来源字段不够稳定

处理：

- 优先使用 `documentId`
- 其次解析上传名 `{scheduleId}__{date}__{filename}`
- 最后才按 `filename + date` 兜底匹配

### 4. 分享链接泄露权限

处理：

- 把 iframe share URL 视为可访问凭证
- 不在公开页面暴露
- 只用于受控内网环境

### 5. 知识图谱接口版本不稳定

处理：

- 只把图谱当可选能力
- 先做接口探测，不直接绑定某个路径
- 图谱接口不可用时，主链路继续只走文档问答

---

## 不建议现在做的事

- 不要一开始就删除旧 `server/rag/` 代码
- 不要先把前端路径全部改成 `/api/ragflow/*`
- 不要把 `fileIndex` 存进映射表作为长期主键

---

## 最终推荐执行方式

推荐按下面顺序实际开工：

1. 先完成 Phase 0，确认你当前 RAGFlow 部署版本的真实 API 能力
2. 做 Phase 1，把 iframe 验证跑通
3. 做 Phase 2，把 `/api/rag/*` 统一接口和 provider 层搭起来
4. 做 Phase 3，把上传/删除/定时扫描三条同步链路全部接进来
5. 做 Phase 4，把查询代理跑通并补上来源映射
6. 如果图谱接口可用，再做 Phase 5 的可选集成
7. 稳定后再决定是否下线本地 RAG

这版方案的关键不是“最快接上 RAGFlow”，而是“接上之后不会和现有文件流转链路打架”。
