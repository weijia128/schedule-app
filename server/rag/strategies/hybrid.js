'use strict';

const { BaseRetriever } = require('./base');
const { VectorRetriever } = require('./vector');
const { Bm25Retriever } = require('./bm25');

const RRF_K = parseInt(process.env.RAG_RRF_K || '60', 10);

/**
 * Hybrid retriever: dense vector + sparse BM25, merged via RRF.
 *
 * Reciprocal Rank Fusion (RRF):
 *   For each unique chunk across both result sets:
 *     rrf_score = sum( 1 / (k + rank_i) ) for each retriever i that returned it
 *
 * This is rank-based (not score-based), so it naturally handles different
 * score distributions between cosine similarity and BM25 without normalization.
 */
class HybridRetriever extends BaseRetriever {
  constructor() {
    super();
    this.vectorRetriever = new VectorRetriever();
    this.bm25Retriever = new Bm25Retriever();
  }

  async retrieve(query, topK, options = {}) {
    // Run both retrievers in parallel; request more candidates for better fusion
    const expandedK = Math.max(topK * 2, 10);

    const [vectorOutcome, bm25Outcome] = await Promise.allSettled([
      this.vectorRetriever.retrieve(query, expandedK, options),
      this.bm25Retriever.retrieve(query, expandedK, options)
    ]);

    const vectorResults = vectorOutcome.status === 'fulfilled' ? vectorOutcome.value : [];
    const bm25Results = bm25Outcome.status === 'fulfilled' ? bm25Outcome.value : [];

    // If only one path returned results, return them directly
    if (vectorResults.length === 0) return bm25Results.slice(0, topK);
    if (bm25Results.length === 0) return vectorResults.slice(0, topK);

    // RRF fusion
    // Key: chunkIdentifier (fileKey::chunkIndex) → { chunk, rrfScore, vectorScore, bm25Score }
    const merged = new Map();

    const chunkKey = (c) => `${c.fileKey}::${c.chunkIndex ?? ''}`;

    for (let rank = 0; rank < vectorResults.length; rank++) {
      const c = vectorResults[rank];
      const key = chunkKey(c);
      const existing = merged.get(key) || { chunk: c, rrfScore: 0, vectorScore: c.score, bm25Score: 0 };
      existing.rrfScore += 1 / (RRF_K + rank + 1); // rank is 0-based, RRF uses 1-based
      merged.set(key, existing);
    }

    for (let rank = 0; rank < bm25Results.length; rank++) {
      const c = bm25Results[rank];
      const key = chunkKey(c);
      const existing = merged.get(key) || { chunk: c, rrfScore: 0, vectorScore: 0, bm25Score: c.score };
      existing.rrfScore += 1 / (RRF_K + rank + 1);
      if (!existing.bm25Score) existing.bm25Score = c.score;
      merged.set(key, existing);
    }

    // Sort by RRF score descending
    const sorted = Array.from(merged.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK);

    return sorted.map(({ chunk, rrfScore }) => ({
      content: chunk.content,
      metadata: chunk.metadata,
      fileKey: chunk.fileKey,
      chunkIndex: chunk.chunkIndex,
      score: rrfScore
    }));
  }
}

module.exports = { HybridRetriever };
