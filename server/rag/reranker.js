'use strict';

const { requestJsonWithRetry } = require('./fetch-compat');

const RERANK_BASE_URL = process.env.RAG_RERANK_BASE_URL || '';
const RERANK_MODEL = process.env.RAG_RERANK_MODEL || 'bge-reranker-v2-m3';

/**
 * Rerank retrieved chunks using an internal rerank API.
 * If the API is unavailable or not configured, returns passages unchanged (pass-through).
 *
 * @param {string} query
 * @param {Array<{content, metadata, score}>} passages  Top-K from retriever
 * @param {number} topN  How many to keep after reranking
 * @returns {Array<{content, metadata, score}>}  Top-N, reranked
 */
async function rerank(query, passages, topN) {
  if (!RERANK_BASE_URL || passages.length === 0) {
    return passages.slice(0, topN);
  }

  try {
    const data = await requestJsonWithRetry(`${RERANK_BASE_URL}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: passages.map(p => p.content),
        top_n: topN,
        return_documents: false
      })
    }, {
      serviceName: 'Rerank request'
    });
    // Standard rerank response: { results: [{index, relevance_score}] }
    const results = data.results || [];

    return results
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, topN)
      .map(r => ({
        ...passages[r.index],
        rerankScore: r.relevance_score
      }));
  } catch (err) {
    console.warn('[RAG] Rerank failed, using original order:', err.message);
    return passages.slice(0, topN);
  }
}

module.exports = { rerank };
