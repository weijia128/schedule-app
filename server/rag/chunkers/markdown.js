'use strict';

/**
 * Markdown-aware chunker.
 *
 * Strategy:
 *  1. Split the document into sections at each heading (##, ###, ####, …).
 *     The heading line is included at the start of its section so that each
 *     chunk carries its own context label.
 *  2. If a section fits within MAX_CHARS, emit it as-is.
 *  3. If a section is too long, split further on blank-line paragraph
 *     boundaries, accumulating paragraphs into chunks until the limit is
 *     reached (with OVERLAP carried from the previous chunk).
 *  4. Code fences (``` … ```) are always kept intact as atomic units.
 */

const MIN_CHUNK_CHARS = 30;

/**
 * @param {string} text
 * @param {object} opts
 * @param {number} opts.maxChars    Target max chars per chunk (default 600)
 * @param {number} opts.overlap     Overlap chars between consecutive chunks (default 80)
 * @returns {string[]}
 */
function chunkMarkdown(text, { maxChars = 600, overlap = 80 } = {}) {
  // ── Step 1: split into heading sections ──────────────────────────────────
  const sections = splitIntoSections(text);

  const chunks = [];
  for (const section of sections) {
    if (section.length <= maxChars) {
      if (section.trim().length >= MIN_CHUNK_CHARS) chunks.push(section.trim());
    } else {
      // Section is too long – split by paragraphs
      const sub = splitByParagraphs(section, maxChars, overlap);
      chunks.push(...sub);
    }
  }

  return chunks.filter(c => c.trim().length >= MIN_CHUNK_CHARS);
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Split markdown text at heading lines (## / ### / ####…).
 * Each returned section starts with the heading that introduces it.
 * Content before the first heading is returned as a leading section.
 */
function splitIntoSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    // ATX heading at level 2 or deeper triggers a new section
    if (/^#{2,}\s/.test(line) && current.length > 0) {
      const section = current.join('\n').trim();
      if (section) sections.push(section);
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const section = current.join('\n').trim();
    if (section) sections.push(section);
  }

  return sections;
}

/**
 * Split a long text block by blank-line paragraph boundaries.
 * Code fences are preserved as atomic paragraphs.
 */
function splitByParagraphs(text, maxChars, overlap) {
  const paragraphs = extractParagraphs(text);
  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;

    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      // Flush current buffer
      if (buffer.trim().length >= MIN_CHUNK_CHARS) {
        chunks.push(buffer.trim());
      }

      // If the paragraph itself is still too long, fall back to char split
      if (para.length > maxChars) {
        const sub = charSplitWithOverlap(para, maxChars, overlap);
        chunks.push(...sub);
        // Carry overlap from last sub-chunk
        const last = sub[sub.length - 1] || '';
        buffer = last.slice(-overlap);
      } else {
        // Start new buffer with overlap from previous
        const prevOverlap = buffer.slice(-overlap);
        buffer = prevOverlap ? `${prevOverlap}\n\n${para}` : para;
      }
    }
  }

  if (buffer.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

/**
 * Extract logical paragraphs: code fences are atomic, regular text is
 * split on blank lines.
 */
function extractParagraphs(text) {
  const paragraphs = [];
  let inFence = false;
  let fenceLang = '';
  let fenceBuffer = [];
  let textBuffer = [];

  const flushText = () => {
    const block = textBuffer.join('\n').trim();
    if (block) {
      // Further split on blank lines inside the text block
      block.split(/\n{2,}/).forEach(p => {
        const t = p.trim();
        if (t) paragraphs.push(t);
      });
    }
    textBuffer = [];
  };

  for (const line of text.split('\n')) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
    if (fenceMatch && !inFence) {
      flushText();
      inFence = true;
      fenceLang = fenceMatch[2].trim();
      fenceBuffer = [line];
    } else if (inFence && /^(`{3,}|~{3,})/.test(line)) {
      fenceBuffer.push(line);
      paragraphs.push(fenceBuffer.join('\n'));
      fenceBuffer = [];
      inFence = false;
      fenceLang = '';
    } else if (inFence) {
      fenceBuffer.push(line);
    } else {
      textBuffer.push(line);
    }
  }

  // Unclosed fence – treat as regular text
  if (fenceBuffer.length > 0) {
    textBuffer.push(...fenceBuffer);
  }
  flushText();

  return paragraphs;
}

/**
 * Last-resort character split with overlap, snapping to nearest space.
 */
function charSplitWithOverlap(text, maxChars, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // Snap backward to a word boundary
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

module.exports = { chunkMarkdown };
