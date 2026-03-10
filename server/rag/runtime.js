'use strict';

const DEFAULT_RETRIEVAL_STRATEGY = 'hybrid';
const VALID_RETRIEVAL_STRATEGIES = new Set(['vector', 'bm25', 'hybrid']);

const NO_EVIDENCE_ANSWER = '文档库里没有足够证据回答这个问题。请尝试补充关键词、限定文档范围，或先上传相关资料。';
const FILTERED_NO_EVIDENCE_ANSWER = '指定范围内无匹配文档。请调整日期范围、周次，或放宽筛选条件。';

function normalizeRetrievalStrategy(strategy = process.env.RAG_RETRIEVAL_STRATEGY) {
  return VALID_RETRIEVAL_STRATEGIES.has(strategy) ? strategy : DEFAULT_RETRIEVAL_STRATEGY;
}

function retrievalRequiresEmbedding(strategy = normalizeRetrievalStrategy()) {
  return strategy !== 'bm25';
}

function getRagConfigStatus(env = process.env) {
  const retrievalStrategy = normalizeRetrievalStrategy(env.RAG_RETRIEVAL_STRATEGY);
  const llmConfigured = Boolean(env.RAG_LLM_BASE_URL);
  const embeddingConfigured = Boolean(env.RAG_EMBEDDING_BASE_URL);
  const requiresEmbedding = retrievalRequiresEmbedding(retrievalStrategy);

  let missingConfig = null;
  let missingConfigMessage = null;

  if (!llmConfigured) {
    missingConfig = 'llm';
    missingConfigMessage = '需配置 RAG_LLM_BASE_URL 环境变量';
  } else if (requiresEmbedding && !embeddingConfigured) {
    missingConfig = 'embedding';
    missingConfigMessage = `当前 ${retrievalStrategy} 检索需要配置 RAG_EMBEDDING_BASE_URL 环境变量`;
  }

  return {
    retrievalStrategy,
    llmConfigured,
    embeddingConfigured,
    requiresEmbedding,
    configured: missingConfig == null,
    missingConfig,
    missingConfigMessage
  };
}

function getNoEvidenceAnswer(hasFilters = false) {
  return hasFilters ? FILTERED_NO_EVIDENCE_ANSWER : NO_EVIDENCE_ANSWER;
}

module.exports = {
  DEFAULT_RETRIEVAL_STRATEGY,
  NO_EVIDENCE_ANSWER,
  FILTERED_NO_EVIDENCE_ANSWER,
  normalizeRetrievalStrategy,
  retrievalRequiresEmbedding,
  getRagConfigStatus,
  getNoEvidenceAnswer
};
