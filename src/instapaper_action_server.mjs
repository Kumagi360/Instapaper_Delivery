#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API_ROOT = "https://www.instapaper.com";
const SYSTEMD_CREDENTIAL_NAME = "instapaper_delivery_credentials";
const LINUX_KEY_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "instapaper-delivery",
  "credentials.json",
);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function percentEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function oauthHeader({ method, url, bodyParams = {}, credentials }) {
  const oauthParams = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: makeNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };

  if (credentials.token) {
    oauthParams.oauth_token = credentials.token;
  }

  const signatureParams = { ...bodyParams, ...oauthParams };
  const paramString = Object.entries(signatureParams)
    .map(([key, value]) => [percentEncode(key), percentEncode(String(value))])
    .sort(([aKey, aVal], [bKey, bVal]) => (aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey)))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.tokenSecret || "")}`;
  oauthParams.oauth_signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  return `OAuth ${Object.entries(oauthParams)
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

async function loadCredentials() {
  if (process.env.INSTAPAPER_CREDENTIALS_JSON) {
    return JSON.parse(process.env.INSTAPAPER_CREDENTIALS_JSON);
  }

  if (process.env.CREDENTIALS_DIRECTORY) {
    try {
      const raw = await readFile(
        path.join(process.env.CREDENTIALS_DIRECTORY, SYSTEMD_CREDENTIAL_NAME),
        "utf8",
      );
      return JSON.parse(raw);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  try {
    const raw = await readFile(LINUX_KEY_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  throw new Error("Missing Instapaper credentials.");
}

async function signedPost(endpoint, bodyParams, credentials) {
  const url = `${API_ROOT}${endpoint}`;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(bodyParams)) {
    if (value !== undefined && value !== null) {
      body.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader({
        method: "POST",
        url,
        bodyParams: Object.fromEntries(body.entries()),
        credentials,
      }),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Instapaper API failed (${response.status}): ${text}`);
  }
}

function verifyActionToken({ action, bookmarkId, expires, token }) {
  const secret = process.env.INSTAPAPER_ACTION_SECRET;
  if (!secret) {
    throw new Error("Missing INSTAPAPER_ACTION_SECRET.");
  }
  if (!bookmarkId || !expires || !token) {
    return false;
  }
  const expiresAt = Number.parseInt(expires, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${action}:${bookmarkId}:${expires}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

function respondHtml(response, statusCode, title, body) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
  <body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3efe7;color:#1d1d1b;margin:0;padding:32px;">
    <main style="max-width:620px;margin:0 auto;background:#fffdf8;border:1px solid #ddd4c6;border-radius:18px;padding:24px;">
      <h1 style="font-family:Georgia,'Times New Roman',serif;margin:0 0 12px 0;">${escapeHtml(title)}</h1>
      <p style="font-size:16px;line-height:1.6;">${escapeHtml(body)}</p>
    </main>
  </body>
</html>`);
}

async function handleRequest(request, response, credentials) {
  if (request.method !== "GET") {
    respondHtml(response, 405, "Unsupported method", "This action endpoint only accepts signed GET links from delivery emails.");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const match = url.pathname.match(/^\/instapaper\/(archive|delete)$/);
  if (!match) {
    respondHtml(response, 404, "Not found", "Unknown Instapaper action.");
    return;
  }

  const action = match[1];
  const bookmarkId = url.searchParams.get("bookmark_id") || "";
  const expires = url.searchParams.get("expires") || "";
  const token = url.searchParams.get("token") || "";

  if (!verifyActionToken({ action, bookmarkId, expires, token })) {
    respondHtml(response, 403, "Action link expired", "This Instapaper action link is invalid or expired.");
    return;
  }

  await signedPost(`/api/1/bookmarks/${action}`, { bookmark_id: bookmarkId }, credentials);
  respondHtml(response, 200, `Instapaper ${action} complete`, `Bookmark ${bookmarkId} was ${action === "archive" ? "archived" : "deleted"}.`);
}

async function main() {
  const credentials = await loadCredentials();
  const host = process.env.INSTAPAPER_ACTION_HOST || "0.0.0.0";
  const port = Number.parseInt(process.env.INSTAPAPER_ACTION_PORT || "8765", 10);

  const server = http.createServer((request, response) => {
    handleRequest(request, response, credentials).catch((error) => {
      console.error(error);
      respondHtml(response, 500, "Instapaper action failed", error.message);
    });
  });

  server.listen(port, host, () => {
    console.log(`Instapaper action server listening on ${host}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
