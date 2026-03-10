'use strict';

const { BaseRetriever } = require('./base');
const { loadIndex } = require('../indexer');
const { requestJsonWithRetry } = require('../fetch-compat');
const { filterEntries } = require('../filters');

const EMBEDDING_BASE_URL = process.env.RAG_EMBEDDING_BASE_URL || '';
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'bge-m3';
const MIN_VECTOR_SCORE_VALUE = Number.parseFloat(process.env.RAG_MIN_VECTOR_SCORE || '0.28');
const MIN_VECTOR_SCORE = Number.isFinite(MIN_VECTOR_SCORE_VALUE) ? MIN_VECTOR_SCORE_VALUE : 0.28;

async function getEmbedding(text) {
  if (!EMBEDDING_BASE_URL) throw new Error('RAG_EMBEDDING_BASE_URL not configured');
  const data = await requestJsonWithRetry(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
  }, {
    serviceName: 'Query embedding request'
  });
  return data.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Phase 1 retriever: dense vector search using cosine similarity.
 * Pure JS, zero external dependencies beyond the embedding API.
 */
class VectorRetriever extends BaseRetriever {
  async retrieve(query, topK, options = {}) {
    const queryVec = await getEmbedding(query);
    const allEntries = loadIndex();
    if (allEntries.length === 0) return [];

    const entries = filterEntries(allEntries, options.filters)
      .filter(entry => Array.isArray(entry.embedding) && entry.embedding.length > 0);
    if (entries.length === 0) return [];

    const scored = entries.map(entry => ({
      content: entry.content,
      metadata: entry.metadata,
      fileKey: entry.fileKey,
      chunkIndex: entry.chunkIndex,
      score: cosineSimilarity(queryVec, entry.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter(entry => Number.isFinite(entry.score) && entry.score >= MIN_VECTOR_SCORE)
      .slice(0, topK);
  }
}

module.exports = { VectorRetriever };
