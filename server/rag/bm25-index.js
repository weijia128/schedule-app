'use strict';

const fs = require('fs');
const path = require('path');
const createBm25 = require('wink-bm25-text-search');

const BM25_INDEX_PATH = path.join(__dirname, '..', 'bm25-index.json');
const MIN_DOCS_FOR_BM25 = 3; // wink-bm25 requires >= 3 documents

let bm25Cache = null;
let bm25CacheMtimeMs = null;

// ── CJK-aware tokenizer ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'to',
  'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into', 'about',
  'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than', 'that',
  'this', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'he',
  'his', 'she', 'her', 'you', 'your', '的', '了', '在', '是', '我',
  '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
  '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己',
  '这'
]);

/**
 * Tokenize text for BM25 indexing / searching.
 * Handles both English words and Chinese text (character bigrams).
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];

  const lower = text.toLowerCase();
  const tokens = [];

  // Extract English/alphanumeric words
  const wordMatches = lower.match(/[a-z0-9][a-z0-9_./-]*/g);
  if (wordMatches) {
    for (const w of wordMatches) {
      if (w.length > 1 && !STOP_WORDS.has(w)) {
        tokens.push(w);
      }
    }
  }

  // Extract CJK character bigrams
  // CJK Unified Ideographs: \u4e00-\u9fff
  const cjkChars = lower.match(/[\u4e00-\u9fff]/g);
  if (cjkChars && cjkChars.length >= 2) {
    const cjkStr = cjkChars.join('');
    for (let i = 0; i < cjkStr.length - 1; i++) {
      const bigram = cjkStr.slice(i, i + 2);
      if (!STOP_WORDS.has(bigram)) {
        tokens.push(bigram);
      }
    }
  }
  // Single CJK characters (for short terms)
  if (cjkChars && cjkChars.length === 1 && !STOP_WORDS.has(cjkChars[0])) {
    tokens.push(cjkChars[0]);
  }

  return tokens;
}

// Prep task pipeline for wink-bm25 (receives the text string, returns token array)
function prepTask(text) {
  return tokenize(text);
}

function createEngine(entries) {
  if (!Array.isArray(entries) || entries.length < MIN_DOCS_FOR_BM25) {
    return null;
  }

  const engine = createBm25();
  engine.defineConfig({ fldWeights: { body: 1 } });
  engine.definePrepTasks([prepTask]);

  for (let i = 0; i < entries.length; i++) {
    engine.addDoc({ body: entries[i].content || '' }, String(i));
  }

  engine.consolidate();
  return engine;
}

function mapSearchResults(engine, query, topK) {
  const results = engine.search(query, topK);
  return results.map(([docId, score]) => ({
    entryIndex: parseInt(docId, 10),
    score
  }));
}

function fallbackSearchEntries(query, entries, topK) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const scored = entries.map((entry, index) => {
    const tokenCounts = new Map();
    for (const token of tokenize(entry.content || '')) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }

    const score = queryTokens.reduce((sum, token) => sum + (tokenCounts.get(token) || 0), 0);
    return { entryIndex: index, score };
  });

  return scored
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Build & Persist ─────────────────────────────────────────────────────────

/**
 * Build BM25 index from the same entries array used by the vector index.
 * Each entry is identified by its array index (position in the entries list).
 * Persists the serialized BM25 engine to bm25-index.json.
 */
function buildBm25Index(entries) {
  const engine = createEngine(entries);
  if (!engine) {
    // wink-bm25 needs >= 3 docs; remove stale index if it exists
    if (fs.existsSync(BM25_INDEX_PATH)) {
      fs.unlinkSync(BM25_INDEX_PATH);
    }
    bm25Cache = null;
    bm25CacheMtimeMs = null;
    return;
  }

  const serialized = engine.exportJSON();
  fs.writeFileSync(BM25_INDEX_PATH, serialized, 'utf8');

  try {
    const stats = fs.statSync(BM25_INDEX_PATH);
    bm25CacheMtimeMs = stats.mtimeMs;
  } catch {
    bm25CacheMtimeMs = null;
  }
  bm25Cache = engine;
}

// ── Load (with mtime cache) ─────────────────────────────────────────────────

function loadBm25Engine() {
  if (!fs.existsSync(BM25_INDEX_PATH)) return null;

  try {
    const stats = fs.statSync(BM25_INDEX_PATH);
    if (bm25Cache && bm25CacheMtimeMs === stats.mtimeMs) {
      return bm25Cache;
    }

    const serialized = fs.readFileSync(BM25_INDEX_PATH, 'utf8');
    const engine = createBm25();
    engine.importJSON(serialized);
    // Re-register custom tokenizer (not persisted by exportJSON)
    engine.definePrepTasks([prepTask]);

    bm25Cache = engine;
    bm25CacheMtimeMs = stats.mtimeMs;
    return engine;
  } catch (err) {
    console.error('[RAG] Failed to load BM25 index:', err.message);
    bm25Cache = null;
    bm25CacheMtimeMs = null;
    return null;
  }
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Search the BM25 index.
 * @param {string} query - User's search query
 * @param {number} topK - Max results to return
 * @returns {Array<{ entryIndex: number, score: number }>}
 */
function searchBm25(query, topK = 10) {
  const engine = loadBm25Engine();
  if (!engine) return [];

  try {
    return mapSearchResults(engine, query, topK);
  } catch (err) {
    console.error('[RAG] BM25 search error:', err.message);
    return [];
  }
}

function searchBm25InEntries(query, entries, topK = 10) {
  const engine = createEngine(entries);
  if (!engine) {
    return fallbackSearchEntries(query, entries, topK);
  }

  try {
    return mapSearchResults(engine, query, topK);
  } catch (err) {
    console.error('[RAG] BM25 search error:', err.message);
    return fallbackSearchEntries(query, entries, topK);
  }
}

module.exports = {
  buildBm25Index,
  loadBm25Engine,
  searchBm25,
  searchBm25InEntries,
  tokenize,
  BM25_INDEX_PATH
};
