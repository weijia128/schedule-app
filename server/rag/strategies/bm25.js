'use strict';

const { BaseRetriever } = require('./base');
const { loadIndex } = require('../indexer');
const { searchBm25, searchBm25InEntries } = require('../bm25-index');
const { filterEntries } = require('../filters');

/**
 * BM25 sparse keyword retriever.
 * Searches the BM25 inverted index for keyword matches,
 * then maps results back to full chunk entries.
 */
class Bm25Retriever extends BaseRetriever {
  async retrieve(query, topK, options = {}) {
    const allEntries = loadIndex();
    if (allEntries.length === 0) return [];

    // Pre-filter by date/week if specified
    const filteredEntries = filterEntries(allEntries, options.filters);
    if (filteredEntries.length === 0) return [];

    const searchEntries = filteredEntries.length === allEntries.length ? allEntries : filteredEntries;
    const usePersistedIndex = searchEntries === allEntries && allEntries.length >= 3;
    const bm25Results = usePersistedIndex
      ? searchBm25(query, topK)
      : searchBm25InEntries(query, searchEntries, topK);
    if (bm25Results.length === 0) return [];

    const results = [];
    for (const { entryIndex, score } of bm25Results) {
      if (results.length >= topK) break;

      const entry = searchEntries[entryIndex];
      if (!entry) continue;

      results.push({
        content: entry.content,
        metadata: entry.metadata,
        fileKey: entry.fileKey,
        chunkIndex: entry.chunkIndex,
        score
      });
    }

    return results;
  }
}

module.exports = { Bm25Retriever };
