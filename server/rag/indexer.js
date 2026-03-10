'use strict';

const fs = require('fs');
const path = require('path');
const { requestJsonWithRetry } = require('./fetch-compat');

const { chunkMarkdown } = require('./chunkers/markdown');
const { chunkParagraphs } = require('./chunkers/paragraph');
const { buildBm25Index } = require('./bm25-index');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const INDEX_PATH = path.join(__dirname, '..', 'rag-index.json');
const CHUNK_MAX_CHARS = parseInt(process.env.RAG_CHUNK_SIZE || '600', 10);
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || '80', 10);
// Max inputs per embedding batch request (conservative limit for most APIs)
const EMBED_BATCH_SIZE = parseInt(process.env.RAG_EMBED_BATCH_SIZE || '32', 10);
const EMBEDDING_DECIMALS = Math.max(parseInt(process.env.RAG_EMBEDDING_DECIMALS || '6', 10), 2);

let indexCache = null;
let indexCacheMtimeMs = null;

// ── Text extraction ──────────────────────────────────────────────────────────

async function extractText(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf' || mimetype === 'application/pdf') {
    return extractPdfText(filePath);
  }

  if (['.md', '.txt', '.text'].includes(ext)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  return null; // unsupported type – skip
}

async function extractPdfText(filePath) {
  try {
    // pdf-parse may not be installed yet; require lazily so the server still starts
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn('[RAG] pdf-parse not installed – PDF skipped:', filePath);
    } else {
      console.error('[RAG] PDF parse error:', err.message);
    }
    return null;
  }
}

// ── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Select the appropriate chunker based on file extension and chunk the text.
 * - .md  → Markdown-aware (heading sections → paragraphs → char fallback)
 * - rest → Paragraph-aware (blank-line splits → char fallback)
 */
function chunkText(text, filename = '') {
  const ext = path.extname(filename).toLowerCase();
  const opts = { maxChars: CHUNK_MAX_CHARS, overlap: CHUNK_OVERLAP };
  return ext === '.md' ? chunkMarkdown(text, opts) : chunkParagraphs(text, opts);
}

function compressEmbedding(embedding) {
  if (!Array.isArray(embedding)) {
    return embedding;
  }

  const factor = 10 ** EMBEDDING_DECIMALS;
  return embedding.map(value => Math.round(Number(value) * factor) / factor);
}

// ── Embedding ─────────────────────────────────────────────────────────────────

const EMBEDDING_BASE_URL = process.env.RAG_EMBEDDING_BASE_URL || '';
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'bge-m3';

/**
 * Embed a batch of texts in one API call.
 * Returns an array of embedding vectors in the same order as the input.
 */
async function getBatchEmbeddings(texts) {
  if (!EMBEDDING_BASE_URL) {
    throw new Error('RAG_EMBEDDING_BASE_URL is not configured');
  }
  if (texts.length === 0) return [];

  const url = `${EMBEDDING_BASE_URL}/embeddings`;
  const data = await requestJsonWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  }, { serviceName: 'Batch embedding request' });

  // API returns data[] sorted by index field; sort defensively
  const sorted = (data.data || []).sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

/** Convenience wrapper for a single text (used by VectorRetriever). */
async function getEmbedding(text) {
  const [vec] = await getBatchEmbeddings([text]);
  return vec;
}

// ── Index I/O ─────────────────────────────────────────────────────────────────

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return [];
  try {
    const stats = fs.statSync(INDEX_PATH);
    if (indexCache && indexCacheMtimeMs === stats.mtimeMs) {
      return indexCache;
    }

    const entries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    indexCache = entries;
    indexCacheMtimeMs = stats.mtimeMs;
    return entries;
  } catch {
    indexCache = [];
    indexCacheMtimeMs = null;
    return [];
  }
}

function saveIndex(entries) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(entries), 'utf8');
  try {
    const stats = fs.statSync(INDEX_PATH);
    indexCache = entries;
    indexCacheMtimeMs = stats.mtimeMs;
  } catch {
    indexCache = entries;
    indexCacheMtimeMs = null;
  }
}

function resolveStoredFilePath(file, schedule) {
  if (file?.relativePath) {
    return path.join(__dirname, '..', file.relativePath);
  }

  if (file?.path) {
    return path.isAbsolute(file.path) ? file.path : path.join(__dirname, '..', file.path);
  }

  const filename = file?.filename || file?.name;
  if (!filename || !schedule?.date) {
    return null;
  }

  return path.join(UPLOADS_DIR, schedule.date, filename);
}

// ── Core indexing ─────────────────────────────────────────────────────────────

/**
 * Build a unique key for a file so we can detect if it's already indexed.
 */
function fileKey(date, filename) {
  return `${date}::${filename}`;
}

/**
 * Index a single file.  Appends new chunks to existingEntries (mutates).
 * Returns number of chunks added.
 */
async function indexFile(filePath, meta, existingEntries) {
  const { date, week, scheduleId, filename, mimetype } = meta;
  const key = fileKey(date, filename);

  // Skip if already indexed (same key present)
  if (existingEntries.some(e => e.fileKey === key)) {
    return 0;
  }

  let text;
  try {
    text = await extractText(filePath, mimetype);
  } catch (err) {
    console.error('[RAG] extractText error:', err.message);
    return 0;
  }

  if (!text || text.trim().length === 0) return 0;

  const chunks = chunkText(text, filename);
  if (chunks.length === 0) return 0;

  const appendChunkEntry = (chunk, chunkIndex, embedding = null) => {
    existingEntries.push({
      fileKey: key,
      chunkIndex,
      content: chunk,
      embedding: Array.isArray(embedding) ? compressEmbedding(embedding) : null,
      metadata: { date, week, scheduleId, filename }
    });
  };

  // Embed all chunks in batches (1 API call per batch instead of N calls)
  let added = 0;
  if (!EMBEDDING_BASE_URL) {
    chunks.forEach((chunk, index) => {
      appendChunkEntry(chunk, index);
      added++;
    });
    return added;
  }

  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBED_BATCH_SIZE) {
    const batchChunks = chunks.slice(batchStart, batchStart + EMBED_BATCH_SIZE);
    try {
      const embeddings = await getBatchEmbeddings(batchChunks);
      batchChunks.forEach((chunk, j) => {
        appendChunkEntry(chunk, batchStart + j, embeddings[j]);
        added++;
      });
    } catch (err) {
      console.error(
        `[RAG] Batch embedding failed for ${filename} chunks ${batchStart}–${batchStart + batchChunks.length - 1}:`,
        err.message
      );
      batchChunks.forEach((chunk, j) => {
        appendChunkEntry(chunk, batchStart + j);
        added++;
      });
    }
  }

  return added;
}

/**
 * Full re-index: scans all uploads, rebuilds rag-index.json.
 * Returns stats { files, chunks }.
 */
async function reindexAll(dbSchedules) {
  const entries = [];
  let totalFiles = 0;
  let totalChunks = 0;
  const schedules = Array.isArray(dbSchedules) ? dbSchedules : [];

  for (const schedule of schedules) {
    const files = Array.isArray(schedule.files) ? schedule.files : [];
    for (const file of files) {
      const filename = file?.name || file?.filename;
      const filePath = resolveStoredFilePath(file, schedule);
      if (!filename || !filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        continue;
      }

      const mimetype = file?.mimetype || (path.extname(filename).toLowerCase() === '.pdf' ? 'application/pdf' : 'text/plain');
      const added = await indexFile(filePath, {
        date: schedule.date || `schedule_${schedule.id}`,
        week: schedule.week,
        scheduleId: schedule.id,
        filename,
        mimetype
      }, entries);

      if (added > 0) {
        totalFiles++;
        totalChunks += added;
      }
    }
  }

  saveIndex(entries);
  buildBm25Index(entries);
  return { files: totalFiles, chunks: totalChunks };
}

/**
 * Remove all index entries for a given file (used on delete or same-name re-upload).
 * Returns number of chunks removed.
 */
function removeFromIndex(date, filename) {
  const key = fileKey(date, filename);
  const entries = loadIndex();
  const before = entries.length;
  const kept = entries.filter(e => e.fileKey !== key);
  if (kept.length < before) {
    saveIndex(kept);
    buildBm25Index(kept);
    console.log(`[RAG] Removed ${before - kept.length} chunks for ${key}`);
  }
  return before - kept.length;
}

/**
 * Incremental index: adds a single newly-uploaded file.
 * If a file with the same date::filename already exists in the index,
 * its old entries are replaced so stale content doesn't persist.
 */
async function indexSingleFile(filePath, meta) {
  const { date, filename } = meta;
  const key = fileKey(date, filename);

  // Load once; remove stale entries for this key if present
  const entries = loadIndex();
  const hadEntries = entries.some(e => e.fileKey === key);
  const cleaned = hadEntries ? entries.filter(e => e.fileKey !== key) : entries;
  if (hadEntries) {
    console.log(`[RAG] Replacing stale index entries for ${key}`);
  }

  const added = await indexFile(filePath, meta, cleaned);
  if (added > 0 || hadEntries) {
    saveIndex(cleaned);
    buildBm25Index(cleaned);
  }
  return added;
}

function getIndexStatus() {
  const entries = loadIndex();
  const fileKeys = new Set(entries.map(e => e.fileKey));
  return {
    totalChunks: entries.length,
    totalFiles: fileKeys.size,
    indexPath: INDEX_PATH,
    indexExists: fs.existsSync(INDEX_PATH)
  };
}

module.exports = { reindexAll, indexSingleFile, removeFromIndex, loadIndex, getIndexStatus, chunkText };
