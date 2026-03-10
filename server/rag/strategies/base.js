'use strict';

/**
 * Base retriever interface.
 * All concrete strategies must implement retrieve(query, topK).
 *
 * Return shape: Array<{ content, metadata, fileKey, score }>
 */
class BaseRetriever {
  /**
   * @param {string} query   User's question
   * @param {number} topK    How many chunks to return
   * @param {object} [options]  Optional retrieval options
   * @param {object} [options.filters]  { dateFrom?: string, dateTo?: string, week?: number }
   * @returns {Promise<Array<{content: string, metadata: object, fileKey: string, score: number}>>}
   */
  async retrieve(query, topK, options = {}) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name} must implement retrieve()`);
  }
}

module.exports = { BaseRetriever };
