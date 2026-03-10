'use strict';

/**
 * Paragraph-aware chunker for plain text and PDF-extracted text.
 *
 * Strategy:
 *  1. Split on blank lines (\n\n or more).
 *  2. Accumulate paragraphs into a chunk until MAX_CHARS is approached.
 *  3. Carry OVERLAP text from the end of each flushed chunk into the next,
 *     snapping to a word boundary so the overlap is always readable.
 *  4. Single paragraphs exceeding MAX_CHARS fall back to word-boundary
 *     character splits.
 */

const MIN_CHUNK_CHARS = 30;

/**
 * @param {string} text
 * @param {object} opts
 * @param {number} opts.maxChars   Target max chars per chunk (default 600)
 * @param {number} opts.overlap    Overlap chars between consecutive chunks (default 80)
 * @returns {string[]}
 */
function chunkParagraphs(text, { maxChars = 600, overlap = 80 } = {}) {
  const rawParagraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length >= MIN_CHUNK_CHARS);

  if (rawParagraphs.length === 0) return [];

  const chunks = [];
  let buffer = '';

  for (const para of rawParagraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;

    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      if (buffer.trim().length >= MIN_CHUNK_CHARS) {
        chunks.push(buffer.trim());
      }

      if (para.length > maxChars) {
        const sub = charSplitWithOverlap(para, maxChars, overlap);
        chunks.push(...sub);
        buffer = (sub[sub.length - 1] || '').slice(-overlap).trimStart();
      } else {
        const prevOverlap = snapToWord(buffer.slice(-overlap));
        buffer = prevOverlap ? `${prevOverlap}\n\n${para}` : para;
      }
    }
  }

  if (buffer.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push(buffer.trim());
  }

  return chunks.filter(c => c.trim().length >= MIN_CHUNK_CHARS);
}

function snapToWord(text) {
  const t = text.trimStart();
  // Find first space to avoid starting mid-word
  const firstSpace = t.indexOf(' ');
  return firstSpace > 0 ? t.slice(firstSpace + 1) : t;
}

function charSplitWithOverlap(text, maxChars, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > start) end = boundary;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_CHARS) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

module.exports = { chunkParagraphs };
