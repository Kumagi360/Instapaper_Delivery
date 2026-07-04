import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(os.tmpdir(), "instapaper-delivery");
const OUT_PATH = path.join(GENERATED_DIR, "snap_read_email.html");
const TRANSIENT_SNAP_PATH = path.join(PROJECT_ROOT, ".transient-snap-read.json");
const TRANSIENT_KEY_PATH = path.join(PROJECT_ROOT, ".transient-resend-api-key");
const SYSTEMD_CREDENTIAL_NAME = "resend_api_key";
const LINUX_KEY_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "instapaper-delivery",
  "resend_api_key",
);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value = "") {
  return String(value).replace(/\r\n/g, "\n").trim();
}

function paragraphize(text) {
  return normalizeText(text)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 15px 0;">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function renderLinkedText(text = "") {
  const parts = [];
  const pattern = /(https?:\/\/[^\s<>"']+)/g;
  let lastIndex = 0;
  for (const match of String(text).matchAll(pattern)) {
    parts.push(escapeHtml(String(text).slice(lastIndex, match.index)));
    const url = match[0];
    parts.push(
      `<a href="${escapeHtml(url)}" style="color:#0f5b4f;font-weight:800;text-decoration-color:#7ea99f;text-underline-offset:3px;">${escapeHtml(url)}</a>`,
    );
    lastIndex = match.index + url.length;
  }
  parts.push(escapeHtml(String(text).slice(lastIndex)));
  return parts.join("").replaceAll("\n", "<br>");
}

function renderImages(images = [], fallbackAlt = "") {
  return images
    .filter((image) => image.url)
    .map((image) => `
      <div style="margin:14px 0 0 0;">
        <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || fallbackAlt)}" width="100%" style="display:block;width:100%;max-width:100%;height:auto;border-radius:12px;border:1px solid #ddd4c6;">
      </div>
    `)
    .join("");
}

function buildActionUrl(item, action) {
  return item.actions?.[`${action}Url`] || "";
}

function renderActionButtons(item) {
  const archiveUrl = buildActionUrl(item, "archive");
  const deleteUrl = buildActionUrl(item, "delete");

  if (!archiveUrl && !deleteUrl) {
    return "";
  }

  const button = (label, url, style) => url
    ? `<a href="${escapeHtml(url)}" style="${style}">${escapeHtml(label)}</a>`
    : "";

  return `
    <tr>
      <td class="section-pad" style="padding:0 46px 34px 46px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;">
              ${button("archive", archiveUrl, "display:inline-block;background:#0f5b4f;color:#fffdf8;text-decoration:none;font-size:14px;font-weight:800;letter-spacing:.3px;padding:11px 15px;border-radius:999px;")}
            </td>
            <td>
              ${button("delete", deleteUrl, "display:inline-block;background:#fffdf8;color:#8b2d20;text-decoration:none;font-size:14px;font-weight:800;letter-spacing:.3px;padding:10px 14px;border-radius:999px;border:1px solid #d8b5ad;")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderXItem(item, { label }) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5d9c5;border-left:3px solid #b78a56;border-radius:16px;background:#fffdfa;">
      <tr>
        <td style="padding:18px 18px 16px 18px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#8b6a3f;margin-bottom:10px;">${escapeHtml(label)}</div>
          <div style="background:#f8f2e8;border-left:4px solid #0f5b4f;border-radius:12px;padding:14px 15px;font-size:15px;line-height:1.66;color:#3b3935;margin:0;">
            ${renderLinkedText(item.visibleText || "")}
            ${renderImages(item.images, item.title)}
          </div>
        </td>
      </tr>
    </table>
  `;
}

function renderSummary(item) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5d9c5;border-left:3px solid #b78a56;border-radius:16px;background:#fffdfa;">
      <tr>
        <td style="padding:20px 20px 18px 20px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#8b6a3f;margin-bottom:10px;">Article Summary</div>
          ${renderImages((item.images || []).slice(0, 1), item.title)}
          <div style="font-size:16px;line-height:1.72;color:#2a2824;margin:0;">${paragraphize(item.summary)}</div>
        </td>
      </tr>
    </table>
  `;
}

function renderSnapHtml(snap) {
  const preheader = snap.preheader || "One saved Instapaper item, prepared for reading.";
  const item = snap.item;
  const headline = snap.headline || item.headline || item.title;
  const body = item.kind === "x-thread"
    ? renderXItem(item, { label: "X thread" })
    : item.kind === "x-post"
      ? renderXItem(item, { label: "X post" })
      : renderSummary(item);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(snap.subject)}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .page-wrap { padding: 8px 0 !important; }
        .page-pad { padding: 0 8px !important; }
        .shell { border-radius: 18px !important; }
        .hero { padding: 28px 18px 18px 18px !important; }
        .hero-title { font-size: 34px !important; line-height: 1.06 !important; letter-spacing: 0 !important; }
        .section-pad { padding-left: 18px !important; padding-right: 18px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3efe7;">
    <div style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;mso-hide:all;">
      ${escapeHtml(preheader)}
    </div>
    <table class="page-wrap" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe7;margin:0;padding:22px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:820px;margin:0 auto;">
            <tr>
              <td class="page-pad" style="padding:0 18px;">
                <table class="shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf8;border:1px solid rgba(144,124,91,0.18);border-radius:28px;">
                  <tr>
                    <td class="hero" style="padding:42px 46px 24px 46px;background:linear-gradient(180deg,#fffdf8 0%,#fbf6ee 100%);border-bottom:1px solid #ddd4c6;">
                      <div style="font-size:12px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:#0f5b4f;margin-bottom:12px;">Instapaper Delivery</div>
                      <div class="hero-title" style="font-family:Georgia,'Times New Roman',serif;font-size:46px;line-height:1.04;font-weight:700;letter-spacing:0;color:#1d1d1b;">
                        <a href="${escapeHtml(item.url)}" style="color:#1d1d1b;text-decoration-color:#7ea99f;text-decoration-thickness:1.5px;text-underline-offset:5px;">${escapeHtml(headline)}</a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="section-pad" style="padding:30px 46px 18px 46px;">
                      ${body}
                    </td>
                  </tr>
                  ${renderActionButtons(item)}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderPlainText(snap) {
  const item = snap.item;
  const lines = [
    snap.subject,
    "",
    item.title,
    item.url,
    "",
  ];

  if (item.kind === "x-thread" || item.kind === "x-post") {
    lines.push(item.kind === "x-thread" ? "X thread" : "X post", "");
    if (item.visibleText) {
      lines.push(normalizeText(item.visibleText), "");
    }
    if (item.images?.length) {
      lines.push("Images:");
      for (const image of item.images) {
        lines.push(image.url);
      }
    }
  } else {
    lines.push("Article Summary", normalizeText(item.summary), "", item.url);
  }

  const archiveUrl = buildActionUrl(item, "archive");
  const deleteUrl = buildActionUrl(item, "delete");
  if (archiveUrl || deleteUrl) {
    lines.push("", "Actions:");
    if (archiveUrl) lines.push(`Archive: ${archiveUrl}`);
    if (deleteUrl) lines.push(`Delete: ${deleteUrl}`);
  }

  return lines.join("\n");
}

async function sendViaResend({ from, to, subject, html, text, apiKey }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend send failed (${response.status}): ${body}`);
  }
  return JSON.parse(body);
}

async function loadSnap() {
  try {
    const raw = await readFile(TRANSIENT_SNAP_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Missing snap payload: ${TRANSIENT_SNAP_PATH}`);
    }
    throw error;
  }
}

async function loadResendApiKey() {
  if (process.env.RESEND_API_KEY) {
    return process.env.RESEND_API_KEY;
  }

  if (process.env.CREDENTIALS_DIRECTORY) {
    try {
      const key = (
        await readFile(path.join(process.env.CREDENTIALS_DIRECTORY, SYSTEMD_CREDENTIAL_NAME), "utf8")
      ).trim();
      if (key) {
        return key;
      }
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  try {
    const key = (await readFile(LINUX_KEY_PATH, "utf8")).trim();
    if (key) {
      await chmod(LINUX_KEY_PATH, 0o600);
      return key;
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    const key = (await readFile(TRANSIENT_KEY_PATH, "utf8")).trim();
    if (key) {
      return key;
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  return "";
}

async function cleanup() {
  await rm(TRANSIENT_SNAP_PATH, { force: true });
  await rm(OUT_PATH, { force: true });
}

async function main() {
  const mode = process.argv[2] || "write";
  const snap = await loadSnap();
  const html = renderSnapHtml(snap);

  if (mode === "write") {
    await mkdir(GENERATED_DIR, { recursive: true });
    await writeFile(OUT_PATH, html, "utf8");
    console.log(`Wrote ${OUT_PATH}`);
    return;
  }

  if (mode !== "send") {
    throw new Error("Usage: node resend_snap_read.mjs [write|send]");
  }

  const apiKey = await loadResendApiKey();
  const from = process.env.RESEND_FROM;
  const to = process.env.RESEND_TO;

  if (!apiKey || !from || !to) {
    throw new Error("Missing RESEND_API_KEY, RESEND_FROM, or RESEND_TO");
  }

  try {
    const payload = await sendViaResend({
      apiKey,
      from,
      to,
      subject: snap.subject,
      html,
      text: renderPlainText(snap),
    });

    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
