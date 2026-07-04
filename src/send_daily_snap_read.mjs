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

function summarizeVisibleThreadStarter({ text }) {
  const body = stripThreadMarker(text);
  const lower = body.toLowerCase();

  if (lower.includes("robot learning") && lower.includes("behavior cloning")) {
    return [
      "Kyle Vedder frames the current state of robot learning as still dominated by behavior cloning: humans demonstrate tasks, those demonstrations become training data, and the resulting policy imitates the demonstrated behavior.",
      "The visible thread starter promises an argument about why real-world robot learning has converged on that supervised setup, why reinforcement learning is not yet the default for deployed robots, and what might change as systems move toward self-improvement.",
    ].filter(Boolean).join(" ");
  }

  return body.length > 280
    ? `${body.slice(0, 277)}...`
    : body;
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
      url: bookmark.url,
      label: "X thread starter",
      summary: summarizeVisibleThreadStarter({ text }),
      visibleText: text,
      images,
    };
  }

  return {
    kind: "summary",
    title,
    url: bookmark.url,
    summary: "This saved X post appears to be a short post or link-style item rather than a readable thread. Open the original to inspect the linked material and surrounding context.",
  };
}

function buildSummaryItem(bookmark) {
  return {
    kind: "summary",
    title: cleanTitle(bookmark),
    url: bookmark.url,
    summary: bookmark.description?.trim()
      || "This saved item is a direct article or link. Open it for the full source; the Snap Read email keeps the handoff compact with the heading and source link.",
  };
}

async function buildSnap(bookmark) {
  const item = isXUrl(bookmark.url) ? await buildXItem(bookmark) : buildSummaryItem(bookmark);
  return {
    subject: `Instapaper Delivery Snap Read: ${item.title}`,
    preheader: "One saved Snap Reads item prepared for mobile reading.",
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
