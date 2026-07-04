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

function makeHeadline(text = "", fallback = "Saved article") {
  const words = String(text || fallback)
    .replace(/^https?:\/\/\S+$/i, fallback)
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  return words.join(" ") || fallback;
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
  const title = stripThreadMarker(firstNonEmptyLine(text)) || cleanTitle(bookmark);
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
      headline: makeHeadline(title, "Saved X thread"),
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
    headline: makeHeadline(title, "Saved X post"),
    url: bookmark.url,
    bookmarkId: String(bookmark.bookmark_id || ""),
    actions: buildActionUrls(bookmark),
    label: DELIVERY_CARD_LABEL || "X post",
    summary: "",
    visibleText: DELIVERY_FORMAT === "video" ? "" : text,
    images,
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
    headline: makeHeadline(resolvedTitle, "Saved article"),
    url: bookmark.url,
    bookmarkId: String(bookmark.bookmark_id || ""),
    actions: buildActionUrls(bookmark),
    summary,
    summaryLabel: DELIVERY_SUMMARY_LABEL,
    images: metadata.image ? [{ url: metadata.image, alt: resolvedTitle }] : [],
  };
}

async function buildSnap(bookmark) {
  const item = isXUrl(bookmark.url) ? await buildXItem(bookmark) : await buildSummaryItem(bookmark);
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
