import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SNAP_READ_FOLDER_ID = "5255437";
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

async function listSnapReads() {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(PROJECT_ROOT, "src", "instapaper.mjs"),
    "list",
    "--folder",
    SNAP_READ_FOLDER_ID,
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
    .filter((media) => media.type === "image" && media.url)
    .map((media) => ({ url: media.url, alt: media.altText || title }));

  if (threadLike) {
    return {
      kind: "x-thread",
      title,
      headline: makeHeadline(title, "Saved X thread"),
      url: bookmark.url,
      label: "X thread",
      summary: "",
      visibleText: text,
      images,
    };
  }

  return {
    kind: "x-post",
    title,
    headline: makeHeadline(title, "Saved X post"),
    url: bookmark.url,
    summary: "",
    visibleText: text,
    images,
  };
}

function buildSummaryItem(bookmark) {
  return {
    kind: "summary",
    title: cleanTitle(bookmark),
    headline: makeHeadline(cleanTitle(bookmark), "Saved article"),
    url: bookmark.url,
    summary: bookmark.description?.trim()
      || "Summary unavailable from the saved metadata. Use the linked headline to open the full source.",
  };
}

async function buildSnap(bookmark) {
  const item = isXUrl(bookmark.url) ? await buildXItem(bookmark) : buildSummaryItem(bookmark);
  return {
    subject: `Instapaper Delivery: ${item.headline || item.title}`,
    headline: item.headline || item.title,
    preheader: "One saved Instapaper item prepared for mobile reading.",
    item,
  };
}

async function main() {
  const bookmarks = await listSnapReads();
  if (bookmarks.length === 0) {
    throw new Error("No Snap Reads bookmarks found.");
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
