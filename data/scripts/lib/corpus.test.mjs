import test from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import {
  blocksToChunks,
  dateFromNewsletterUrl,
  extractLongDate,
  htmlToBlocks,
  pdfPagesToBlocks,
  CHUNK_TARGET_CHARS
} from "./corpus.mjs";

test("htmlToBlocks: headings and paragraphs in document order, inline tags folded in", () => {
  const $ = load(`
    <main>
      <h1>SJA Dress Code</h1>
      <h4>Purpose</h4>
      <p>Clothing is an <strong>indicator</strong> of self-respect.</p>
      <div>Line one<br>Line two</div>
      <script>ignored()</script>
    </main>`);
  const blocks = htmlToBlocks($, $("main"));
  assert.deepEqual(blocks, [
    { kind: "heading", text: "SJA Dress Code" },
    { kind: "heading", text: "Purpose" },
    { kind: "para", text: "Clothing is an indicator of self-respect." },
    { kind: "para", text: "Line one" },
    { kind: "para", text: "Line two" }
  ]);
});

test("htmlToBlocks: Constant Contact bold ≥16px spans count as headings", () => {
  const $ = load(`
    <table><tr><td>
      <div><span style="font-weight: bold; font-size: 18px;">Senior Ads and Yearbook Sales</span></div>
      <div><span style="font-size: 14px;">Senior ads are now on sale.</span></div>
      <div><span style="font-weight: bold; font-size: 14px;">Small bold text is not a heading</span></div>
    </td></tr></table>`);
  const blocks = htmlToBlocks($, $("body"));
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "para", "para"]);
  assert.equal(blocks[0].text, "Senior Ads and Yearbook Sales");
});

test("pdfPagesToBlocks: all-caps lines become headings, wrapped lines rejoin, page numbers vanish", () => {
  const pages = [
    "STUDENT LIFE\nCHAPEL\nThe practice of daily Chapel is one of the\nAcademy traditions.\n12\n• First bullet\n• Second bullet",
    "ADVISOR PROGRAM\nEvery student has an advisor."
  ];
  const blocks = pdfPagesToBlocks(pages);
  assert.deepEqual(blocks, [
    { kind: "heading", text: "STUDENT LIFE" },
    { kind: "heading", text: "CHAPEL" },
    { kind: "para", text: "The practice of daily Chapel is one of the Academy traditions." },
    { kind: "para", text: "• First bullet" },
    { kind: "para", text: "• Second bullet" },
    { kind: "heading", text: "ADVISOR PROGRAM" },
    { kind: "para", text: "Every student has an advisor." }
  ]);
});

test("blocksToChunks: paragraphs pack under their heading and stay under the target size", () => {
  const para = "x".repeat(300);
  const blocks = [
    { kind: "heading", text: "Green Day" },
    ...Array.from({ length: 6 }, () => ({ kind: "para", text: para })),
    { kind: "heading", text: "Athletics" },
    { kind: "para", text: "BOYS GOLF @ JAY PEAK 4:00" }
  ];
  const doc = { source: "bulletin", title: "Daily Bulletin — 2026-09-03", url: "https://x", date: "2026-09-03" };
  const chunks = blocksToChunks(blocks, doc);

  // 6 × 300 chars pack two to a chunk under the 900 target, then one for Athletics.
  assert.equal(chunks.length, 4);
  assert.ok(chunks.slice(0, 3).every((c) => c.section === "Green Day"));
  assert.ok(chunks.every((c) => c.text.length <= CHUNK_TARGET_CHARS));
  assert.equal(chunks[3].section, "Athletics");
  assert.equal(chunks[3].date, "2026-09-03");
  assert.equal(chunks[3].source, "bulletin");
  assert.match(chunks[3].id, /^[0-9a-f]{16}$/);
});

test("blocksToChunks: ids are stable for identical input and differ by date", () => {
  const blocks = [{ kind: "para", text: "Chess Club meets today at 3:15." }];
  const a = blocksToChunks(blocks, { source: "bulletin", title: "t", url: "u", date: "2026-09-03" });
  const b = blocksToChunks(blocks, { source: "bulletin", title: "t", url: "u", date: "2026-09-03" });
  const c = blocksToChunks(blocks, { source: "bulletin", title: "t", url: "u", date: "2026-09-04" });
  assert.equal(a[0].id, b[0].id);
  assert.notEqual(a[0].id, c[0].id);
});

test("dates: long dates in titles and newsletter slugs", () => {
  assert.equal(extractLongDate("September 3, 2026"), "2026-09-03");
  assert.equal(extractLongDate("SJA News — January 28, 2026"), "2026-01-28");
  assert.equal(extractLongDate("Sept. 14, 2026"), "2026-09-14");
  assert.equal(extractLongDate("no date here"), null);
  assert.equal(
    dateFromNewsletterUrl("https://myemail.constantcontact.com/SJA-News---April-16--2025.html?soid=1&aid=2"),
    "2025-04-16"
  );
});
