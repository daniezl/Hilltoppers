/**
 * Builds public/corpus.json — every school document the Ask assistant can
 * quote from, cut into short passages. The Worker's /api/ask downloads this one
 * file and searches it; nothing else server-side knows about the documents.
 *
 * Sources, in the order they are gathered:
 *
 *   1. Daily Bulletin. The school page only ever shows today's bulletin, so
 *      each run copies it into corpus/bulletins.json keyed by date. That file
 *      is the archive — the site has none — and it is committed so the history
 *      survives between Action runs.
 *   2. SJA News (the weekly parent email). Sent through Constant Contact and
 *      also listed on the school's newsletter page as public web versions.
 *      Each issue is fetched once and cached in corpus/newsletters.json. The
 *      archive page lags the inbox by weeks; extra "View as Webpage" links can
 *      be added to corpus_sources.json to close the gap.
 *   3. Pages and PDFs named in corpus_sources.json (handbook, dress code...).
 *      Re-read every run; they are small and change without notice.
 *
 * Failure behaviour: a source that cannot be fetched is logged and skipped so
 * one broken page does not blank the whole corpus, except that if *nothing*
 * could be fetched the previous public/corpus.json is left untouched.
 */

import fs from "node:fs/promises";
import { load } from "cheerio";
import { extractText } from "unpdf";
import {
  blocksToChunks,
  dateFromNewsletterUrl,
  extractLongDate,
  htmlToBlocks,
  normalizeWhitespace,
  pdfPagesToBlocks
} from "./lib/corpus.mjs";

const BULLETIN_URL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/";
const NEWSLETTER_ARCHIVE_URL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/newsletter/";

const SOURCES_FILE = "corpus_sources.json";
const BULLETIN_CACHE = "corpus/bulletins.json";
const NEWSLETTER_CACHE = "corpus/newsletters.json";
const OUT = "public/corpus.json";

// Bulletins older than this drop out of the published file (the cache keeps
// them). Last year's "chess club meets Thursday" is noise, not an answer.
const BULLETIN_KEEP_DAYS = 400;
const NEWSLETTER_KEEP_DAYS = 800;

// Both the school's WAF and Constant Contact reject non-browser user agents.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Constant Contact answers 429 after a burst of requests; one pause and retry
// is enough in practice. Anything still failing is retried on the next run.
async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", attempt = 0) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow"
  });
  if (res.status === 429 && attempt < 2) {
    await sleep(4000 * (attempt + 1));
    return fetchText(url, accept, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) return fallback;
    throw err;
  }
}

async function writeJson(path, value) {
  await fs.mkdir(path.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function daysAgo(dateKey) {
  return Math.round((Date.parse(todayKey()) - Date.parse(dateKey)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// 1. Daily Bulletin
// ---------------------------------------------------------------------------

export function parseBulletinPage(html) {
  const $ = load(html);
  const article = $(".latest-article").first();
  if (!article.length) throw new Error("Bulletin: no .latest-article on the page — layout changed?");

  const date = extractLongDate(article.find(".date").first().text());
  if (!date) throw new Error("Bulletin: could not read the date");

  const heading = normalizeWhitespace(article.find("h2").first().text());
  const body = article.find(".peapod-stripper").first();
  const blocks = htmlToBlocks($, body.length ? body : article);
  return { date, heading, blocks };
}

async function updateBulletins() {
  const cache = await readJson(BULLETIN_CACHE, {});
  try {
    const bulletin = parseBulletinPage(await fetchText(BULLETIN_URL));
    const previous = cache[bulletin.date];
    cache[bulletin.date] = { heading: bulletin.heading, blocks: bulletin.blocks, fetchedAt: new Date().toISOString() };
    if (!previous) {
      console.log(`Bulletin: added ${bulletin.date} (${bulletin.blocks.length} blocks)`);
    } else if (JSON.stringify(previous.blocks) !== JSON.stringify(bulletin.blocks)) {
      console.log(`Bulletin: ${bulletin.date} changed since last run; updated`);
    }
    await writeJson(BULLETIN_CACHE, cache);
  } catch (err) {
    console.error(`Bulletin: ${err.message} — using cached bulletins only`);
  }

  const chunks = [];
  for (const [date, entry] of Object.entries(cache).sort()) {
    if (daysAgo(date) > BULLETIN_KEEP_DAYS) continue;
    chunks.push(
      ...blocksToChunks(entry.blocks, {
        source: "bulletin",
        title: `Daily Bulletin — ${date}`,
        url: BULLETIN_URL,
        date
      })
    );
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// 2. SJA News newsletters
// ---------------------------------------------------------------------------

export function parseNewsletterArchive(html) {
  const $ = load(html);
  const urls = new Set();
  $("a[href*='myemail.constantcontact.com']").each((_, a) => {
    const href = $(a).attr("href");
    if (href) urls.add(href.replace(/&amp;/g, "&"));
  });
  return [...urls];
}

export function parseNewsletter(html, url) {
  const $ = load(html);
  const title = normalizeWhitespace($("title").first().text()) || "SJA News";
  const date = extractLongDate(title) ?? dateFromNewsletterUrl(url);
  const blocks = htmlToBlocks($, $("body")).filter(
    // Constant Contact footer: address, unsubscribe, "sent by".
    (b) => !/unsubscribe|constant contact|update profile|sent by .*@|privacy policy/i.test(b.text)
  );
  return { title, date, blocks };
}

async function updateNewsletters(extraUrls) {
  const cache = await readJson(NEWSLETTER_CACHE, {});
  let urls = [...extraUrls];
  try {
    urls.push(...parseNewsletterArchive(await fetchText(NEWSLETTER_ARCHIVE_URL)));
  } catch (err) {
    console.error(`Newsletter archive: ${err.message} — using cached issues only`);
  }
  urls = [...new Set(urls)];

  let added = 0;
  for (const url of urls) {
    if (cache[url]) continue;
    try {
      if (added > 0) await sleep(400);
      const issue = parseNewsletter(await fetchText(url), url);
      if (!issue.date) {
        console.warn(`Newsletter: no date in ${url}; skipped`);
        continue;
      }
      cache[url] = { ...issue, fetchedAt: new Date().toISOString() };
      added += 1;
    } catch (err) {
      console.error(`Newsletter: ${err.message}`);
    }
  }
  if (added) {
    console.log(`Newsletters: added ${added} issue(s), ${Object.keys(cache).length} cached`);
    await writeJson(NEWSLETTER_CACHE, cache);
  }

  const chunks = [];
  for (const [url, issue] of Object.entries(cache).sort((a, b) => a[1].date.localeCompare(b[1].date))) {
    if (daysAgo(issue.date) > NEWSLETTER_KEEP_DAYS) continue;
    chunks.push(
      ...blocksToChunks(issue.blocks, {
        source: "newsletter",
        title: issue.title,
        url,
        date: issue.date
      })
    );
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// 3. Pages and PDFs
// ---------------------------------------------------------------------------

export function parseSchoolPage(html, page) {
  const $ = load(html);
  const main = $("main").first();
  const blocks = htmlToBlocks($, main.length ? main : $("body"));
  return blocksToChunks(blocks, { source: "page", title: page.title, url: page.url, date: page.date ?? null });
}

async function fetchPages(pages) {
  const chunks = [];
  for (const page of pages) {
    try {
      const pageChunks = parseSchoolPage(await fetchText(page.url), page);
      console.log(`Page: ${page.title} → ${pageChunks.length} chunks`);
      chunks.push(...pageChunks);
    } catch (err) {
      console.error(`Page: ${page.title}: ${err.message}`);
    }
  }
  return chunks;
}

async function fetchPdfs(pdfs) {
  const chunks = [];
  for (const pdf of pdfs) {
    try {
      const { text } = await extractText(await fetchBytes(pdf.url), { mergePages: false });
      const blocks = pdfPagesToBlocks(text);
      const pdfChunks = blocksToChunks(blocks, {
        source: "handbook",
        title: pdf.title,
        url: pdf.url,
        date: pdf.date ?? null
      });
      console.log(`PDF: ${pdf.title} → ${text.length} pages, ${pdfChunks.length} chunks`);
      chunks.push(...pdfChunks);
    } catch (err) {
      console.error(`PDF: ${pdf.title}: ${err.message}`);
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------

async function main() {
  const sources = await readJson(SOURCES_FILE);

  const bulletins = await updateBulletins();
  const newsletters = await updateNewsletters(sources.newsletters ?? []);
  const pages = await fetchPages(sources.pages ?? []);
  const pdfs = await fetchPdfs(sources.pdfs ?? []);

  const chunks = [...pages, ...pdfs, ...newsletters, ...bulletins];
  if (chunks.length === 0) {
    throw new Error("Nothing could be fetched or read from cache; leaving corpus.json alone");
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    counts: { pages: pages.length, pdfs: pdfs.length, newsletters: newsletters.length, bulletins: bulletins.length },
    chunks
  };

  const existing = await readJson(OUT, null);
  const strip = (o) => o && JSON.stringify({ ...o, updatedAt: undefined });
  if (existing && strip(existing) === strip(payload)) {
    console.log(`corpus.json unchanged (${chunks.length} chunks)`);
    return;
  }

  await writeJson(OUT, payload);
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  console.log(`corpus.json updated — ${chunks.length} chunks, ${(bytes / 1024).toFixed(0)} KB`, payload.counts);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
