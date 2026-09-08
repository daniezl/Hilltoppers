/**
 * Turns school documents (HTML pages, Constant Contact newsletters, PDF text)
 * into the flat list of chunks in public/corpus.json that the Worker's
 * /api/ask endpoint searches.
 *
 * Everything here is pure: fetch_corpus.mjs does the network and file I/O.
 *
 * A chunk is a short passage (a few paragraphs, ≲ CHUNK_TARGET_CHARS) that
 * knows which document and section it came from and when that document was
 * published. The date matters more than it looks: bulletins say "tomorrow" and
 * "Friday night", and the model can only resolve that if it is told the date
 * the text was written.
 */

import { createHash } from "node:crypto";

export const CHUNK_TARGET_CHARS = 900;
export const CHUNK_MAX_CHARS = 1400;

const BLOCK_TAGS = new Set([
  "p", "div", "li", "ul", "ol", "td", "th", "tr", "table", "tbody", "thead",
  "section", "article", "main", "header", "footer", "nav", "aside", "center",
  "blockquote", "pre", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6",
  "body", "html", "form", "fieldset", "address", "dl", "dt", "dd"
]);
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "head", "iframe"]);

export function normalizeWhitespace(text) {
  return String(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// HTML → blocks
//
// A block is { kind: "heading" | "para", text }. Walking the tree and emitting
// at the deepest block-level element gives one paragraph per visual paragraph
// for normal pages and for Constant Contact's nested-table emails alike.
// ---------------------------------------------------------------------------

function styleOf($el) {
  return String($el.attr("style") ?? "").toLowerCase();
}

/** Constant Contact has no <h*>; its headings are bold spans at ≥ 16px. */
function looksLikeStyledHeading($, el, text) {
  if (text.length > 120) return false;
  const $el = $(el);
  const candidates = [$el, ...$el.find("span, strong, b, font").toArray().map((n) => $(n))];
  let bold = false;
  let big = false;
  for (const $c of candidates) {
    const ownText = normalizeWhitespace($c.text());
    if (ownText !== text) continue;
    const style = styleOf($c);
    if (/font-weight:\s*(bold|[6-9]00)/.test(style) || $c.is("strong, b")) bold = true;
    const size = style.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
    if (size && Number(size[1]) >= 16) big = true;
  }
  return bold && big;
}

export function htmlToBlocks($, root) {
  const blocks = [];
  let inlineBuffer = [];

  const flushInline = () => {
    const text = normalizeWhitespace(inlineBuffer.join(" "));
    inlineBuffer = [];
    if (text) blocks.push({ kind: "para", text });
  };

  const visit = (node) => {
    if (node.type === "text") {
      inlineBuffer.push(node.data);
      return;
    }
    if (node.type !== "tag") return;
    const tag = node.tagName?.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === "br") {
      inlineBuffer.push("\n");
      return;
    }

    if (!BLOCK_TAGS.has(tag)) {
      // Inline element: its text belongs to the surrounding paragraph.
      for (const child of node.children ?? []) visit(child);
      return;
    }

    flushInline();
    const $node = $(node);

    if (HEADING_TAGS.has(tag)) {
      const text = normalizeWhitespace($node.text());
      if (text) blocks.push({ kind: "heading", text });
      return;
    }

    const hasBlockChild = (node.children ?? []).some(
      (c) => c.type === "tag" && BLOCK_TAGS.has(c.tagName?.toLowerCase())
    );
    if (hasBlockChild) {
      for (const child of node.children ?? []) visit(child);
      flushInline();
      return;
    }

    // Leaf block. <br> inside it separates lines, which for bulletins and
    // emails are usually separate announcements.
    const raw = $node
      .contents()
      .toArray()
      .map((c) => (c.type === "tag" && c.tagName?.toLowerCase() === "br" ? "\n" : $(c).text()))
      .join("");
    for (const line of raw.split("\n")) {
      const text = normalizeWhitespace(line);
      if (!text) continue;
      const kind = looksLikeStyledHeading($, node, text) ? "heading" : "para";
      blocks.push({ kind, text });
    }
  };

  const rootEl = typeof root === "string" ? $(root).first() : root;
  const nodes = rootEl.toArray ? rootEl.toArray() : [rootEl];
  for (const n of nodes) visit(n);
  flushInline();
  return dedupeAdjacent(blocks);
}

function dedupeAdjacent(blocks) {
  const out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.text === b.text) continue;
    out.push(b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PDF text → blocks
//
// pdf text arrives as hard-wrapped lines with no markup. The handbook writes
// its section titles in capitals on their own line, which is the only
// structure there is to recover.
// ---------------------------------------------------------------------------

function isAllCapsHeading(line) {
  const t = line.trim();
  if (t.length < 4 || t.length > 80) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  if (letters !== letters.toUpperCase()) return false;
  // Table-of-contents rows and page furniture ("PAGE 12", "...........") are not headings.
  if (/\.{3,}|\d+\s*$/.test(t) && !/^[A-Z][A-Z\s&/'-]+$/.test(t)) return false;
  return true;
}

export function pdfPagesToBlocks(pages) {
  const blocks = [];
  let para = [];
  const flush = () => {
    const text = normalizeWhitespace(para.join(" "));
    para = [];
    if (text) blocks.push({ kind: "para", text });
  };

  for (const page of pages) {
    for (const rawLine of String(page).split(/\r?\n/)) {
      const line = rawLine.replace(/\u00a0/g, " ").trim();
      if (!line) {
        flush();
        continue;
      }
      // Bare page numbers.
      if (/^\d{1,3}$/.test(line)) continue;
      if (isAllCapsHeading(line)) {
        flush();
        blocks.push({ kind: "heading", text: normalizeWhitespace(line) });
        continue;
      }
      // Bullets start a new paragraph so a list does not merge into one blob.
      if (/^[•·▪◦\-–]\s/.test(line) || /^\d+[.)]\s/.test(line)) {
        flush();
      }
      para.push(line);
    }
    flush();
  }
  return dedupeAdjacent(blocks);
}

// ---------------------------------------------------------------------------
// Blocks → chunks
// ---------------------------------------------------------------------------

/**
 * Groups paragraphs under the heading that precedes them, then packs each
 * group into passages of roughly CHUNK_TARGET_CHARS. A paragraph longer than
 * CHUNK_MAX_CHARS is split on sentence boundaries rather than dropped.
 *
 * `doc` supplies everything that is the same for every chunk of a document:
 *   { source, title, url, date }
 * source is one of "bulletin" | "newsletter" | "handbook" | "page".
 */
export function blocksToChunks(blocks, doc) {
  const sections = [];
  let current = { heading: null, paras: [] };
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (current.paras.length) sections.push(current);
      current = { heading: b.text, paras: [] };
    } else {
      current.paras.push(...splitLongParagraph(b.text));
    }
  }
  if (current.paras.length) sections.push(current);

  // Heading with no body: keep the heading as context for the next section
  // instead of losing it (Constant Contact puts a big title over an image).
  const chunks = [];
  for (const section of sections) {
    let buf = [];
    let len = 0;
    const emit = () => {
      if (!buf.length) return;
      chunks.push(makeChunk(doc, section.heading, buf.join("\n")));
      buf = [];
      len = 0;
    };
    for (const p of section.paras) {
      if (len > 0 && len + p.length + 1 > CHUNK_TARGET_CHARS) emit();
      buf.push(p);
      len += p.length + 1;
    }
    emit();
  }
  return chunks;
}

function splitLongParagraph(text) {
  if (text.length <= CHUNK_MAX_CHARS) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const out = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + s.length > CHUNK_TARGET_CHARS) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function makeChunk(doc, section, text) {
  const id = createHash("sha1")
    .update(`${doc.source}|${doc.url}|${doc.date ?? ""}|${section ?? ""}|${text}`)
    .digest("hex")
    .slice(0, 16);
  return {
    id,
    source: doc.source,
    title: doc.title,
    url: doc.url,
    date: doc.date ?? null,
    section: section ?? null,
    text
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/** "September 3, 2026" / "Sept. 3, 2026" / "SJA News - January 28, 2026" → "2026-09-03" */
export function extractLongDate(text) {
  const m = String(text).match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const prefix = m[1].toLowerCase().slice(0, 3);
  const month = MONTHS.findIndex((name) => name.startsWith(prefix));
  if (month < 0) return null;
  const day = Number(m[2]);
  if (day < 1 || day > 31) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Constant Contact archive slugs: "SJA-News---January-28--2026.html" → "2026-01-28" */
export function dateFromNewsletterUrl(url) {
  const m = String(url).match(/SJA-News---([A-Za-z]+)-(\d{1,2})--(\d{4})/i);
  if (!m) return null;
  return extractLongDate(`${m[1]} ${m[2]}, ${m[3]}`);
}
