#!/usr/bin/env node
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API_ROOT = "https://www.instapaper.com";
const SYSTEMD_CREDENTIAL_NAME = "instapaper_credentials";
const LINUX_KEY_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "instapaper",
  "credentials.json",
);

function usage() {
  console.error(`Usage:
  instapaper.mjs xauth
  instapaper.mjs verify [--json]
  instapaper.mjs list [--folder unread|starred|archive|<folder_id>] [--limit 25] [--json]
  instapaper.mjs folders [--json]
  instapaper.mjs highlights <bookmark_id> [--json]
  instapaper.mjs add <url> [--title "..."] [--description "..."] [--json]
  instapaper.mjs archive <bookmark_id> [--json]
  instapaper.mjs unarchive <bookmark_id> [--json]
  instapaper.mjs star <bookmark_id> [--json]
  instapaper.mjs unstar <bookmark_id> [--json]
  instapaper.mjs delete <bookmark_id> [--json]`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "json") {
      args.json = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function percentEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function parseFormEncoded(text) {
  const params = new URLSearchParams(text.trim());
  return Object.fromEntries(params.entries());
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
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((item) => [key, item]);
      }
      return [[key, value]];
    })
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

async function signedPost(endpoint, bodyParams, credentials, { raw = false } = {}) {
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
    throw new Error(`Instapaper API failed (${response.status}) for ${endpoint}: ${text}`);
  }

  if (raw) {
    return text;
  }

  if (!text.trim()) {
    return null;
  }

  return JSON.parse(text);
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

  throw new Error("Missing Instapaper credentials. Run ./scripts/setup_instapaper_credential.sh first.");
}

async function xauth() {
  const consumerKey = process.env.INSTAPAPER_CONSUMER_KEY;
  const consumerSecret = process.env.INSTAPAPER_CONSUMER_SECRET;
  const username = process.env.INSTAPAPER_USERNAME;
  const password = process.env.INSTAPAPER_PASSWORD || "";

  if (!consumerKey || !consumerSecret || !username) {
    throw new Error("xauth requires INSTAPAPER_CONSUMER_KEY, INSTAPAPER_CONSUMER_SECRET, and INSTAPAPER_USERNAME.");
  }

  const credentials = { consumerKey, consumerSecret };
  const raw = await signedPost(
    "/api/1/oauth/access_token",
    {
      x_auth_username: username,
      x_auth_password: password,
      x_auth_mode: "client_auth",
    },
    credentials,
    { raw: true },
  );
  const parsed = parseFormEncoded(raw);
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Unexpected xAuth response: ${raw}`);
  }

  process.stdout.write(`${JSON.stringify({
    consumerKey,
    consumerSecret,
    token: parsed.oauth_token,
    tokenSecret: parsed.oauth_token_secret,
  }, null, 2)}\n`);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printBookmarks(payload) {
  const bookmarks = payload.bookmarks || [];
  if (bookmarks.length === 0) {
    console.log("No bookmarks found.");
    return;
  }
  for (const item of bookmarks) {
    const progress = typeof item.progress === "number" ? ` ${(item.progress * 100).toFixed(0)}%` : "";
    console.log(`${item.bookmark_id}${progress}  ${item.title || "(untitled)"}`);
    console.log(`  ${item.url}`);
    if (item.description) {
      console.log(`  ${item.description}`);
    }
  }
}

function printArray(items) {
  if (!items || items.length === 0) {
    console.log("No items found.");
    return;
  }
  for (const item of items) {
    console.log(JSON.stringify(item));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "help") {
    usage();
    process.exit(command ? 0 : 1);
  }

  if (command === "xauth") {
    await xauth();
    return;
  }

  const credentials = await loadCredentials();
  let result;

  if (command === "verify") {
    result = await signedPost("/api/1/account/verify_credentials", {}, credentials);
  } else if (command === "list") {
    result = await signedPost(
      "/api/1/bookmarks/list",
      {
        folder_id: args.folder || "unread",
        limit: args.limit || "25",
      },
      credentials,
    );
  } else if (command === "folders") {
    result = await signedPost("/api/1.1/folders/list", {}, credentials);
  } else if (command === "highlights") {
    const bookmarkId = args._[1];
    if (!bookmarkId) throw new Error("highlights requires a bookmark_id.");
    result = await signedPost(`/api/1.1/bookmarks/${bookmarkId}/highlights`, {}, credentials);
  } else if (command === "add") {
    const url = args._[1];
    if (!url) throw new Error("add requires a URL.");
    result = await signedPost(
      "/api/1/bookmarks/add",
      {
        url,
        title: args.title,
        description: args.description,
      },
      credentials,
    );
  } else if (["archive", "unarchive", "star", "unstar", "delete"].includes(command)) {
    const bookmarkId = args._[1];
    if (!bookmarkId) throw new Error(`${command} requires a bookmark_id.`);
    result = await signedPost(`/api/1/bookmarks/${command}`, { bookmark_id: bookmarkId }, credentials);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  if (args.json || command === "verify") {
    printJson(result);
  } else if (command === "list") {
    printBookmarks(result);
  } else {
    printArray(Array.isArray(result) ? result : [result]);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
