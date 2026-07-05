import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DELIVERY_FOLDER_ID = process.env.INSTAPAPER_DELIVERY_FOLDER_ID || "5255437";
const DELIVERY_FOLDER_NAME = process.env.INSTAPAPER_DELIVERY_FOLDER_NAME || process.env.INSTAPAPER_SNAP_FOLDER || "Snap Reads";
const DELIVERY_SUMMARY_LABEL = process.env.INSTAPAPER_DELIVERY_SUMMARY_LABEL || "Article Summary";
const DELIVERY_CARD_LABEL = process.env.INSTAPAPER_DELIVERY_CARD_LABEL || "";
const DELIVERY_FORMAT = process.env.INSTAPAPER_DELIVERY_FORMAT || "standard";
const TRANSIENT_SNAP_PATH = path.join(PROJECT_ROOT, ".transient-snap-read.json");

function isXUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com") || host.endsWith(".x.com");
  } catch {
    return false;
  }
}

function isLinkedInUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

function getTweetParts(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex((part) => part === "status");
    if (statusIndex <= 0 || !parts[statusIndex + 1]) {
      return null;
    }
    return {
      screenName: parts[statusIndex - 1],
      tweetId: parts[statusIndex + 1],
    };
  } catch {
    return null;
  }
}

function cleanTitle(bookmark) {
  return bookmark.title?.trim() || bookmark.url;
}

function firstNonEmptyLine(text = "") {
  return String(text).split("\n").map((line) => line.trim()).find(Boolean) || "";
}

function stripThreadMarker(text = "") {
  return text.replace(/\s*\(\s*1\s*\/\s*(?:n|\d+)\s*\)\s*$/i, "").trim();
}

function sourceNameFromUrl(url) {
  try {
    const host = new URL(url).hostname
      .replace(/^www\./, "")
      .replace(/^m\./, "");
    const [name] = host.split(".");
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Saved item";
  } catch {
    return "Saved item";
  }
}

function cleanHeadlineSource(text = "") {
  return decodeHtmlEntities(text)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s*\(\s*1\s*\/\s*(?:n|\d+)\s*\)\s*/gi, " ")
    .replace(/[#@][\w-]+/g, " ")
    .replace(/[|•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headlineWords(text = "") {
  return cleanHeadlineSource(text)
    .replace(/[^\w\s'%-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function truncateHeadline(text = "", fallback = "Saved item") {
  const words = headlineWords(text).slice(0, 7);
  return words.join(" ") || fallback;
}

function extractLinkedInAuthor(text = "") {
  const parts = decodeHtmlEntities(text).split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const author = parts[parts.length - 2].replace(/\s+\d+\s+comments?$/i, "").trim();
    if (author) {
      return author;
    }
  }
  return "";
}

function firstWords(text = "", count = 7) {
  return headlineWords(firstNonEmptyLine(text)).slice(0, count).join(" ").toLowerCase();
}

function headlineIsClear(candidate, sourceText = "") {
  const words = headlineWords(candidate);
  const generic = new Set(["saved", "post", "article", "thread", "item", "read", "summary", "link", "linkedin", "x"]);
  const meaningful = words.filter((word) => !generic.has(word.toLowerCase()));
  if (words.length === 0 || words.length > 7 || meaningful.length < 2) {
    return false;
  }
  if (firstWords(sourceText, words.length) === words.join(" ").toLowerCase()) {
    return false;
  }
  return true;
}

function makeHeadlineSummary({ title = "", description = "", text = "", url = "", author = "", publisher = "", fallback = "Saved item" } = {}) {
  const source = cleanHeadlineSource(description || title || text || fallback);
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it", "its",
    "of", "on", "or", "our", "that", "the", "their", "this", "to", "we", "with", "you", "your",
  ]);
  const words = source
    .replace(/^https?:\/\/\S+$/i, fallback)
    .replace(/[^\w\s'%-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !stopWords.has(word.toLowerCase()))
    .slice(0, 7);
  const candidate = words.join(" ");
  const titleHeadline = truncateHeadline(title, "");
  const titleWords = headlineWords(titleHeadline);
  const titleRepeatsOpening = titleWords.length > 0
    && firstWords(text, titleWords.length) === titleWords.join(" ").toLowerCase();
  const fallbackHeadline = titleHeadline && !titleRepeatsOpening
    ? titleHeadline
    : truncateHeadline(author || publisher || sourceNameFromUrl(url), fallback);
  return headlineIsClear(candidate, text || title) ? candidate : fallbackHeadline;
}

function buildActionUrls(bookmark) {
  const baseUrl = process.env.INSTAPAPER_ACTION_BASE_URL;
  const secret = process.env.INSTAPAPER_ACTION_SECRET;
  if (!baseUrl || !secret || !bookmark.bookmark_id) {
    return {};
  }

  try {
    const ttlDays = Number.parseInt(process.env.INSTAPAPER_ACTION_TOKEN_TTL_DAYS || "14", 10);
    const expires = Math.floor(Date.now() / 1000) + Math.max(ttlDays, 1) * 24 * 60 * 60;
    const sign = (action) => crypto
      .createHmac("sha256", secret)
      .update(`${action}:${bookmark.bookmark_id}:${expires}`)
      .digest("hex");

    const archiveUrl = new URL("/instapaper/archive", baseUrl);
    archiveUrl.searchParams.set("bookmark_id", bookmark.bookmark_id);
    archiveUrl.searchParams.set("expires", expires.toString());
    archiveUrl.searchParams.set("token", sign("archive"));
    const deleteUrl = new URL("/instapaper/delete", baseUrl);
    deleteUrl.searchParams.set("bookmark_id", bookmark.bookmark_id);
    deleteUrl.searchParams.set("expires", expires.toString());
    deleteUrl.searchParams.set("token", sign("delete"));
    return {
      archiveUrl: archiveUrl.toString(),
      deleteUrl: deleteUrl.toString(),
    };
  } catch {
    return {};
  }
}

async function listDeliveryBookmarks() {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(PROJECT_ROOT, "src", "instapaper.mjs"),
    "list",
    "--folder",
    DELIVERY_FOLDER_ID,
    "--limit",
    "500",
    "--json",
  ], {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  const payload = JSON.parse(stdout);
  return payload.filter((item) => item.type === "bookmark");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function absolutizeUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function readMeta(html, names) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const name of names) {
    for (const tag of tags) {
      const keyPattern = new RegExp(`(?:property|name)=["']${name}["']`, "i");
      if (!keyPattern.test(tag)) {
        continue;
      }
      const content = tag.match(/\bcontent=["']([^"']+)["']/i);
      if (content?.[1]) {
        return decodeHtmlEntities(content[1]);
      }
    }
  }
  return "";
}

async function fetchArticleMetadata(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return {};
    }
    const html = await response.text();
    const image = readMeta(html, ["og:image", "twitter:image"]);
    const title = readMeta(html, ["og:title", "twitter:title"]);
    const description = readMeta(html, ["og:description", "twitter:description", "description"]);
    return {
      title,
      description,
      siteName: readMeta(html, ["og:site_name", "application-name"]),
      image: image ? absolutizeUrl(image, response.url || url) : "",
    };
  } catch {
    return {};
  }
}

async function buildXItem(bookmark) {
  const tweet = getTweetParts(bookmark.url);
  if (!tweet) {
    return buildSummaryItem(bookmark);
  }

  let payload = null;
  try {
    payload = await fetchJson(`https://api.vxtwitter.com/${tweet.screenName}/status/${tweet.tweetId}`);
  } catch {
    payload = null;
  }

  const text = payload?.text || cleanTitle(bookmark);
  const article = payload?.article || {};
  const title = stripThreadMarker(firstNonEmptyLine(article.title || text)) || cleanTitle(bookmark);
  const headline = makeHeadlineSummary({
    title: article.title || title,
    description: article.preview_text || "",
    text,
    url: bookmark.url,
    author: payload?.user_name || payload?.user_screen_name || tweet.screenName,
    publisher: article.title ? "X Article" : "X",
    fallback: "Saved X post",
  });
  const threadLike = /\(\s*1\s*\/\s*(?:n|\d+)\s*\)/i.test(text);
  const images = (payload?.media_extended || [])
    .map((media) => ({
      url: media.type === "image" ? media.url : media.thumbnail_url || media.url,
      alt: media.altText || title,
    }))
    .filter((image) => image.url);

  if (threadLike) {
    return {
      kind: "x-thread",
      title,
      headline,
      url: bookmark.url,
      bookmarkId: String(bookmark.bookmark_id || ""),
      actions: buildActionUrls(bookmark),
      label: DELIVERY_CARD_LABEL || "X thread",
      summary: "",
      visibleText: DELIVERY_FORMAT === "video" ? "" : text,
      images,
    };
  }

  return {
    kind: "x-post",
    title,
    headline,
    url: bookmark.url,
    bookmarkId: String(bookmark.bookmark_id || ""),
    actions: buildActionUrls(bookmark),
    label: DELIVERY_CARD_LABEL || "X post",
    summary: "",
    visibleText: DELIVERY_FORMAT === "video" ? "" : text,
    images,
  };
}

async function buildLinkedInItem(bookmark) {
  const metadata = await fetchArticleMetadata(bookmark.url);
  const visibleText = decodeHtmlEntities(bookmark.title?.trim() || metadata.description || metadata.title || bookmark.url);
  const title = decodeHtmlEntities(metadata.title || cleanTitle(bookmark));
  const author = extractLinkedInAuthor(visibleText);

  return {
    kind: "x-post",
    title,
    headline: truncateHeadline(author || metadata.siteName || sourceNameFromUrl(bookmark.url), "LinkedIn post"),
    url: bookmark.url,
    bookmarkId: String(bookmark.bookmark_id || ""),
    actions: buildActionUrls(bookmark),
    label: DELIVERY_CARD_LABEL || "LinkedIn post",
    summary: "",
    visibleText,
    images: metadata.image ? [{ url: metadata.image, alt: title }] : [],
  };
}

async function buildSummaryItem(bookmark) {
  const metadata = await fetchArticleMetadata(bookmark.url);
  const title = cleanTitle(bookmark);
  const resolvedTitle = title === bookmark.url && metadata.title ? metadata.title : title;
  const summary = DELIVERY_FORMAT === "video"
    ? ""
    : bookmark.description?.trim()
      || metadata.description
      || "Summary unavailable from the saved metadata. Use the linked headline to open the full source.";

  return {
    kind: "summary",
    title: resolvedTitle,
    headline: makeHeadlineSummary({
      title: resolvedTitle,
      description: metadata.description || bookmark.description,
      url: bookmark.url,
      publisher: metadata.siteName || sourceNameFromUrl(bookmark.url),
      fallback: "Saved article",
    }),
    url: bookmark.url,
    bookmarkId: String(bookmark.bookmark_id || ""),
    actions: buildActionUrls(bookmark),
    summary,
    summaryLabel: DELIVERY_SUMMARY_LABEL,
    images: metadata.image ? [{ url: metadata.image, alt: resolvedTitle }] : [],
  };
}

async function buildSnap(bookmark) {
  const item = isXUrl(bookmark.url)
    ? await buildXItem(bookmark)
    : isLinkedInUrl(bookmark.url)
      ? await buildLinkedInItem(bookmark)
      : await buildSummaryItem(bookmark);
  return {
    subject: `Instapaper Delivery: ${item.headline || item.title}`,
    headline: item.headline || item.title,
    preheader: `One saved Instapaper item from ${DELIVERY_FOLDER_NAME} prepared for mobile reading.`,
    item,
  };
}

async function main() {
  const bookmarks = await listDeliveryBookmarks();
  if (bookmarks.length === 0) {
    throw new Error(`No ${DELIVERY_FOLDER_NAME} bookmarks found.`);
  }

  const oldest = bookmarks.reduce((winner, item) => (item.time < winner.time ? item : winner), bookmarks[0]);
  const snap = await buildSnap(oldest);
  await writeFile(TRANSIENT_SNAP_PATH, JSON.stringify(snap, null, 2), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(PROJECT_ROOT, "src", "resend_snap_read.mjs"),
    "send",
  ], {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });

  process.stdout.write(stdout);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
