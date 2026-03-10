'use strict';

/**
 * Retriever factory.
 * New strategies (HybridRetriever, GraphRetriever …) should be added here
 * without touching router.js or any other caller.
 */

const { VectorRetriever } = require('./strategies/vector');
const { Bm25Retriever } = require('./strategies/bm25');
const { HybridRetriever } = require('./strategies/hybrid');
const { normalizeRetrievalStrategy } = require('./runtime');

const DEFAULT_STRATEGY = normalizeRetrievalStrategy();

/**
 * @param {'vector'|'bm25'|'hybrid'} [strategy]
 * @returns {import('./strategies/base').BaseRetriever}
 */
function createRetriever(strategy = DEFAULT_STRATEGY) {
  strategy = normalizeRetrievalStrategy(strategy);
  if (strategy === 'vector') return new VectorRetriever();
  if (strategy === 'bm25') return new Bm25Retriever();
  if (strategy === 'hybrid') return new HybridRetriever();
  throw new Error(`Unknown retrieval strategy: ${strategy}`);
}

module.exports = { createRetriever };
