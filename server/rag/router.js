'use strict';

const express = require('express');
const { requestJsonWithRetry } = require('./fetch-compat');
const { reindexAll, getIndexStatus } = require('./indexer');
const { createRetriever } = require('./searcher');
const { rerank } = require('./reranker');
const { rewriteQuery, sanitizeHistory } = require('./query-rewrite');
const { getNoEvidenceAnswer, getRagConfigStatus } = require('./runtime');

const router = express.Router();

const LLM_BASE_URL = process.env.RAG_LLM_BASE_URL || '';
const LLM_MODEL = process.env.RAG_LLM_MODEL || 'qwen2.5-7b';
const TOP_K = parseInt(process.env.RAG_TOP_K || '5', 10);
const TOP_N = parseInt(process.env.RAG_TOP_N || '3', 10);
const MIN_RERANK_SCORE_VALUE = Number.parseFloat(process.env.RAG_MIN_RERANK_SCORE || '0.08');
const MIN_RERANK_SCORE = Number.isFinite(MIN_RERANK_SCORE_VALUE) ? MIN_RERANK_SCORE_VALUE : 0.08;

function normalizeRagMode(mode) {
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';

  if (normalized === 'iframe' || normalized === 'local' || normalized === 'disabled') {
    return normalized;
  }

  if (normalized === 'ragflow') {
    return 'iframe';
  }

  return process.env.RAGFLOW_IFRAME_URL ? 'iframe' : 'disabled';
}

function isConfiguredIframeUrl(iframeUrl) {
  if (!iframeUrl) {
    return false;
  }

  if (iframeUrl.includes('...')) {
    return false;
  }

  return iframeUrl.startsWith('http://') || iframeUrl.startsWith('https://');
}

function getRagUiConfig() {
  const requestedMode = normalizeRagMode(process.env.RAG_MODE);
  const iframeUrl = (process.env.RAGFLOW_IFRAME_URL || '').trim() || null;
  const iframeConfigured = isConfiguredIframeUrl(iframeUrl);
  const localConfig = getRagConfigStatus();
  const provider = requestedMode === 'iframe' ? 'ragflow' : 'local';

  if (requestedMode === 'iframe') {
    return {
      mode: iframeConfigured ? 'iframe' : 'disabled',
      provider,
      iframeUrl,
      configured: iframeConfigured,
      missingConfigMessage: iframeConfigured ? null : 'RAGFLOW_IFRAME_URL 未配置或仍为占位符'
    };
  }

  if (requestedMode === 'local') {
    return {
      mode: 'local',
      provider,
      iframeUrl: null,
      configured: localConfig.configured,
      missingConfigMessage: localConfig.missingConfigMessage || null
    };
  }

  return {
    mode: 'disabled',
    provider,
    iframeUrl: null,
    configured: false,
    missingConfigMessage: null
  };
}

function formatSourceMeta(metadata) {
  const weekLabel = metadata.week != null ? ` 第${metadata.week}周` : '';
  return `${metadata.filename}（${metadata.date}${weekLabel}）`;
}

function buildSnippet(content, maxLength = 140) {
  const normalized = typeof content === 'string' ? content.replace(/\s+/g, ' ').trim() : '';
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function buildNoEvidenceResponse(extra = {}, hasFilters = false) {
  return {
    success: true,
    answer: getNoEvidenceAnswer(hasFilters),
    sources: [],
    ...extra
  };
}

router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      ...getRagUiConfig()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Health / status ───────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  try {
    const status = getIndexStatus();
    const configStatus = getRagConfigStatus();
    const uiConfig = getRagUiConfig();
    const effectiveConfigStatus = uiConfig.mode === 'local'
      ? configStatus
      : {
          configured: uiConfig.configured,
          missingConfigMessage: uiConfig.missingConfigMessage
        };

    res.json({
      success: true,
      mode: uiConfig.mode,
      provider: uiConfig.provider,
      ...status,
      ...effectiveConfigStatus,
      llmModel: LLM_MODEL,
      embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'bge-m3',
      rerankEnabled: Boolean(process.env.RAG_RERANK_BASE_URL)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Re-index ──────────────────────────────────────────────────────────────────

router.post('/reindex', async (req, res) => {
  try {
    // Get schedules from db for metadata enrichment
    const db = req.app.get('ragDb');
    const schedules = db ? db.get('schedule').value() : [];

    const stats = await reindexAll(schedules);
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error('[RAG] reindex error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Query ─────────────────────────────────────────────────────────────────────

router.post('/query', async (req, res) => {
  const { query, history = [], filters: rawFilters } = req.body;

  // Validate and sanitize filters
  const filters = {};
  if (rawFilters && typeof rawFilters === 'object') {
    if (rawFilters.dateFrom && typeof rawFilters.dateFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawFilters.dateFrom)) {
      filters.dateFrom = rawFilters.dateFrom;
    }
    if (rawFilters.dateTo && typeof rawFilters.dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawFilters.dateTo)) {
      filters.dateTo = rawFilters.dateTo;
    }
    if (rawFilters.week != null) {
      const w = parseInt(rawFilters.week, 10);
      if (Number.isFinite(w) && w > 0) filters.week = w;
    }
  }
  const hasFilters = Object.keys(filters).length > 0;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ success: false, error: '请提供问题内容' });
  }

  if (query.length > 2000) {
    return res.status(400).json({ success: false, error: '问题长度不能超过 2000 字符' });
  }

  const configStatus = getRagConfigStatus();

  if (!configStatus.configured) {
    const error = configStatus.missingConfig === 'llm'
      ? 'RAG_LLM_BASE_URL 未配置，请在环境变量中设置内网 LLM 地址'
      : 'RAG_EMBEDDING_BASE_URL 未配置，请在环境变量中设置 Embedding 服务地址';
    return res.status(503).json({
      success: false,
      error
    });
  }

  try {
    const userHistory = sanitizeHistory(history, 6);
    const { retrievalQuery, rewritten } = await rewriteQuery(query, userHistory);

    // 1. Retrieve top-K chunks via configured strategy (default: hybrid)
    const retriever = createRetriever();
    const candidates = await retriever.retrieve(retrievalQuery, TOP_K, { filters: hasFilters ? filters : undefined });

    if (candidates.length === 0) {
      console.log(`[RAG] query="${query.trim()}" retrieval="${retrievalQuery}" rewritten=${rewritten} candidates=0`);
      return res.json(buildNoEvidenceResponse({ retrievalQuery, rewritten }, hasFilters));
    }

    // 2. Rerank to top-N
    const rerankedChunks = await rerank(retrievalQuery, candidates, TOP_N);
    const topChunks = rerankedChunks
      .filter(chunk => chunk.rerankScore == null || chunk.rerankScore >= MIN_RERANK_SCORE)
      .slice(0, TOP_N);

    if (topChunks.length === 0) {
      console.log(`[RAG] query="${query.trim()}" retrieval="${retrievalQuery}" rewritten=${rewritten} candidates=${candidates.length} reranked=0`);
      return res.json(buildNoEvidenceResponse({ retrievalQuery, rewritten }));
    }

    // 3. Build context
    const context = topChunks
      .map((c, i) => `[片段${i + 1}] 来源：${formatSourceMeta(c.metadata)}\n${c.content}`)
      .join('\n\n---\n\n');

    // 4. Build messages (with optional conversation history)
    const systemPrompt =
      '你是一个专业的知识问答助手，基于提供的文档片段回答问题。' +
      '请优先使用文档内容作答，并在回答末尾注明引用的来源文件名。' +
      '如果文档片段不足以回答问题，请如实说明。';

    const userMessage = `以下是相关文档片段：\n\n${context}\n\n用户问题：${query}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...userHistory.slice(-6), // keep last 3 rounds of conversation
      { role: 'user', content: userMessage }
    ];

    // 5. Call internal LLM
    const llmData = await requestJsonWithRetry(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.3 })
    }, {
      serviceName: 'LLM request'
    });
    const answer = llmData.choices?.[0]?.message?.content || '（模型未返回内容）';
    const bestScore = topChunks[0]?.rerankScore ?? topChunks[0]?.score ?? 0;
    console.log(
      `[RAG] query="${query.trim()}" retrieval="${retrievalQuery}" rewritten=${rewritten} candidates=${candidates.length} topChunks=${topChunks.length} bestScore=${bestScore.toFixed(4)}`
    );

    // 6. Build deduplicated source list with live download links
    const db = req.app.get('ragDb');
    const schedules = db ? db.get('schedule').value() : [];

    const seenKeys = new Set();
    const sources = topChunks
      .filter(c => {
        if (seenKeys.has(c.fileKey)) return false;
        seenKeys.add(c.fileKey);
        return true;
      })
      .map(c => {
        // Look up current fileIndex from db (may shift after deletions)
        let fileIndex = null;
        let downloadUrl = null;
        if (c.metadata.scheduleId != null) {
          const sched = schedules.find(s => s.id === c.metadata.scheduleId);
          if (sched && sched.files) {
            const idx = sched.files.findIndex(f => f.name === c.metadata.filename);
            if (idx >= 0) {
              fileIndex = idx;
              downloadUrl = `/schedule/${c.metadata.scheduleId}/files/${idx}`;
            }
          }
        }
        return {
          filename: c.metadata.filename,
          date: c.metadata.date,
          week: c.metadata.week,
          scheduleId: c.metadata.scheduleId,
          fileIndex,
          downloadUrl,
          chunkIndex: c.chunkIndex ?? null,
          snippet: buildSnippet(c.content),
          score: Number((c.rerankScore ?? c.score).toFixed(4))
        };
      });

    res.json({ success: true, answer, sources, retrievalQuery, rewritten, filters: hasFilters ? filters : undefined });
  } catch (err) {
    console.error('[RAG] query error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
