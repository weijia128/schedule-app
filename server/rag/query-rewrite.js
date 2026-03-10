'use strict';

const { requestJsonWithRetry } = require('./fetch-compat');

const LLM_BASE_URL = process.env.RAG_LLM_BASE_URL || '';
const LLM_MODEL = process.env.RAG_LLM_MODEL || 'qwen2.5-7b';
const REWRITE_HISTORY_TURNS = Math.max(parseInt(process.env.RAG_REWRITE_HISTORY_TURNS || '2', 10), 0);

function sanitizeHistory(history = [], maxMessages = REWRITE_HISTORY_TURNS * 2) {
  if (!Array.isArray(history) || history.length === 0 || maxMessages === 0) {
    return [];
  }

  return history
    .filter(message => (
      message &&
      typeof message.content === 'string' &&
      ['user', 'assistant'].includes(message.role)
    ))
    .slice(-maxMessages);
}

async function rewriteQuery(query, history = []) {
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  const sanitizedHistory = sanitizeHistory(history);

  if (!trimmedQuery || sanitizedHistory.length === 0 || !LLM_BASE_URL) {
    return { retrievalQuery: trimmedQuery, rewritten: false };
  }

  const messages = [
    {
      role: 'system',
      content:
        '你是一个文档检索改写器。' +
        '你的任务是把用户最后一句问题改写成适合知识库检索的完整问题。' +
        '保留专有名词、缩写、文件名、时间范围和限制条件。' +
        '不要回答问题，不要编造新信息，只输出改写后的单句问题。' +
        '如果原问题已经完整，直接原样返回。'
    },
    ...sanitizedHistory,
    {
      role: 'user',
      content:
        '请结合上面的对话历史，把下面这句用户问题改写成一个可以独立检索的完整问题。' +
        '只输出改写后的问题，不要解释。\n\n' +
        `当前问题：${trimmedQuery}`
    }
  ];

  try {
    const data = await requestJsonWithRetry(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0
      })
    }, {
      serviceName: 'Query rewrite request'
    });

    const rewrittenQuery = (data.choices?.[0]?.message?.content || '')
      .trim()
      .replace(/^["“”]|["“”]$/g, '');

    if (!rewrittenQuery) {
      return { retrievalQuery: trimmedQuery, rewritten: false };
    }

    return {
      retrievalQuery: rewrittenQuery,
      rewritten: rewrittenQuery !== trimmedQuery
    };
  } catch (err) {
    console.warn('[RAG] Query rewrite failed, using original query:', err.message);
    return { retrievalQuery: trimmedQuery, rewritten: false };
  }
}

module.exports = { rewriteQuery, sanitizeHistory };
