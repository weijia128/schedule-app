'use strict';

// Node.js 18+ 内置全局 fetch；更低版本用 node-fetch@2（CommonJS）兜底
const fetchFn = typeof globalThis.fetch === 'function'
  ? globalThis.fetch.bind(globalThis)
  : require('node-fetch');

const DEFAULT_TIMEOUT_MS = Math.max(parseInt(process.env.RAG_HTTP_TIMEOUT_MS || '30000', 10), 1000);
const DEFAULT_RETRIES = Math.max(parseInt(process.env.RAG_HTTP_RETRIES || '2', 10), 0);
const DEFAULT_RETRY_DELAY_MS = Math.max(parseInt(process.env.RAG_HTTP_RETRY_DELAY_MS || '800', 10), 100);
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  if (RETRYABLE_ERROR_CODES.has(err.code)) return true;
  if (err.cause && RETRYABLE_ERROR_CODES.has(err.cause.code)) return true;
  if (typeof err.message === 'string' && /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(err.message)) {
    return true;
  }
  return false;
}

function buildAttemptMessage(serviceName, attempt, maxAttempts, detail) {
  const label = serviceName || 'HTTP request';
  return `[RAG] ${label} attempt ${attempt}/${maxAttempts} failed: ${detail}`;
}

async function fetchWithRetry(url, options = {}, requestOptions = {}) {
  const {
    serviceName = 'HTTP request',
    retries = DEFAULT_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  } = requestOptions;

  const maxAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new Error(`${serviceName} timeout after ${timeoutMs}ms`)), timeoutMs)
      : null;

    try {
      const response = await fetchFn(url, {
        ...options,
        signal: controller ? controller.signal : options.signal
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts) {
        const responseText = await response.text().catch(() => '');
        console.warn(buildAttemptMessage(serviceName, attempt, maxAttempts, `HTTP ${response.status}${responseText ? ` ${responseText.slice(0, 200)}` : ''}`));
        await sleep(retryDelayMs * attempt);
        continue;
      }

      return response;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = err;

      if (!isRetryableError(err) || attempt >= maxAttempts) {
        break;
      }

      const errorCode = err.code || err.cause?.code || err.name;
      console.warn(buildAttemptMessage(serviceName, attempt, maxAttempts, `${errorCode || 'ERROR'} ${err.message}`));
      await sleep(retryDelayMs * attempt);
    }
  }

  const errorCode = lastError?.code || lastError?.cause?.code || lastError?.name || 'ERROR';
  const errorMessage = lastError?.message || 'unknown error';
  const wrapped = new Error(`${serviceName} failed after ${maxAttempts} attempt(s): ${errorCode} ${errorMessage}`);
  wrapped.code = errorCode;
  wrapped.cause = lastError;
  throw wrapped;
}

async function requestJsonWithRetry(url, options = {}, requestOptions = {}) {
  const serviceName = requestOptions.serviceName || 'HTTP JSON request';
  const response = await fetchWithRetry(url, options, requestOptions);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${serviceName} API error ${response.status}${body ? `: ${body}` : ''}`);
  }

  return response.json();
}

module.exports = fetchFn;
module.exports.fetchWithRetry = fetchWithRetry;
module.exports.requestJsonWithRetry = requestJsonWithRetry;
