'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { searchBm25InEntries } = require('./bm25-index');
const {
  FILTERED_NO_EVIDENCE_ANSWER,
  NO_EVIDENCE_ANSWER,
  getNoEvidenceAnswer,
  getRagConfigStatus
} = require('./runtime');

test('bm25-only query config does not require embedding', () => {
  const status = getRagConfigStatus({
    RAG_LLM_BASE_URL: 'http://llm.local/v1',
    RAG_RETRIEVAL_STRATEGY: 'bm25'
  });

  assert.equal(status.configured, true);
  assert.equal(status.requiresEmbedding, false);
  assert.equal(status.missingConfig, null);
});

test('hybrid query config still requires embedding', () => {
  const status = getRagConfigStatus({
    RAG_LLM_BASE_URL: 'http://llm.local/v1',
    RAG_RETRIEVAL_STRATEGY: 'hybrid'
  });

  assert.equal(status.configured, false);
  assert.equal(status.requiresEmbedding, true);
  assert.equal(status.missingConfig, 'embedding');
});

test('filtered no-evidence answer uses dedicated prompt', () => {
  assert.equal(getNoEvidenceAnswer(false), NO_EVIDENCE_ANSWER);
  assert.equal(getNoEvidenceAnswer(true), FILTERED_NO_EVIDENCE_ANSWER);
});

test('filtered bm25 search still works when candidate set is smaller than wink minimum', () => {
  const filteredEntries = [
    { content: 'LangSmith observability tracing toolkit' }
  ];

  const results = searchBm25InEntries('LangSmith tracing', filteredEntries, 5);

  assert.equal(results.length, 1);
  assert.deepEqual(results[0], { entryIndex: 0, score: 2 });
});
