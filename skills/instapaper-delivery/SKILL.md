---
name: instapaper-delivery
description: Use when the user asks to access, triage, summarize, save, archive, or inspect articles in their Instapaper account through Instapaper Delivery.
---

# Instapaper Delivery

Use this skill for the user's Instapaper saved-article workflow.

## Credential Model

The preferred credential is an encrypted systemd credential:

`/etc/credstore.encrypted/instapaper_delivery_credentials`

Do not ask the user to paste Instapaper passwords, OAuth tokens, consumer secrets, or credential JSON into chat. Use the setup script instead:

```bash
./scripts/setup_systemd_instapaper_credential.sh
```

For commands that need credentials, use the wrapper:

```bash
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs <command>
```

The runtime process reads the decrypted credential from `CREDENTIALS_DIRECTORY` and does not persist it.

## Available Commands

Run from the repository root.

```bash
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs verify
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs list --folder unread --limit 25
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs folders
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs highlights <bookmark_id>
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs add <url> [--title "..."] [--description "..."]
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs archive <bookmark_id>
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs star <bookmark_id>
```

Use `--json` for machine-readable output where supported.

## Instapaper Email Delivery

Use Instapaper delivery when the user asks for a saved item from an Instapaper folder to be sent by email.

- Always select the oldest saved bookmark in the configured Instapaper folder unless the user asks for a different selection rule.
- The scheduled deliveries are:
  - `Snap Read`: oldest item in `Snap Reads`, daily at 10:30 PM.
  - `Actionable`: oldest item in `Actionable`, Saturdays at 8:00 AM.
  - `Rich Read`: oldest item in `Rich Reads`, Sundays at 8:00 AM.
  - `Watch`: oldest item in `Watch`, Fridays at 5:00 PM.
- Send through Resend using the existing encrypted systemd credential named `resend_api_key`.
- Use `scripts/run_with_resend_credential.sh` for manual sends.
- Use `scripts/run_with_delivery_credentials.sh` when one command needs both Instapaper and Resend credentials.
- Use `src/resend_snap_read.mjs` to render and send a prepared `.transient-snap-read.json` payload.
- Use `src/send_daily_snap_read.mjs` for unattended daily sends.
- Do not ask the user to paste Resend or Instapaper credentials into chat.
- For scheduled delivery, use the Knlgpt orchestration launcher at `scripts/run_daily_instapaper_delivery.sh`, installed to `~/.local/share/instapaper-delivery/run_daily_instapaper_delivery.sh`.
- Every Instapaper delivery email must include bottom `archive` and `delete` buttons when `INSTAPAPER_ACTION_BASE_URL` and `INSTAPAPER_ACTION_SECRET` are configured. These buttons must use expiring signed URLs generated for the specific `bookmarkId`; never emit unsigned archive/delete links.

Content rules:

- Do not include an `Open original` button. Link the email's main headline to the saved article or post instead.
- When signed action URLs are available, include `archive` and `delete` buttons at the bottom of every delivery email, across X threads, X posts, and non-X articles. These buttons should act on the actual saved Instapaper bookmark, not merely the source URL.
- The email header should be a short, hooky content-summary headline under 8 words. Do not copy the first line or title verbatim when the source is a post, thread, or article; compress what the saved item is about.
- Before sending, self-critique the header: if it is too vague to understand the delivery context in under 8 words, or if it reads like a verbatim first line, use a recognizable article title, author/account name, or publisher/source name instead.
- Treat Substack links as ordinary article links.
- Do not put a separate headline/title inside content cards.
- Do not include standalone action links such as `Open X thread`, `Open X post`, `Read ...`, or `Read the saved article`. The linked email headline is the primary route to the saved item.
- For X/Twitter items that appear to be threads but whose full extent is not visible, do not synthesize a summary. Render one callout card labeled `X thread` containing only the visible original post content verbatim.
- For X/Twitter one-off posts, render one callout card labeled `X post` containing only the visible original post content verbatim.
- Treat LinkedIn posts like X/Twitter posts: render the visible original post text in a callout card rather than as an article summary.
- Keep URLs that appear in the original X post text inline and visibly emphasized inside the callout.
- Include X images inside the X callout itself when available, not after the callout. Do not over-index on images or write image descriptions unless the image itself contains essential readable content.
- For direct non-X articles, video links, or any saved item that is not an X post/thread, render one card with a clearly labeled summary section. Use `Article Summary` for Snap Reads, `Actionable Summary` for Actionable deliveries, and `Rich Read Summary` for Rich Read deliveries. Do not use callout styling for the summary prose. Do not add a standalone source link below the summary; use the linked email headline.
- For Watch deliveries, link the email headline to the saved X post or video URL, label the card `Video`, and include a thumbnail if available. Keep the body minimal; do not add a summary unless no title or thumbnail can be extracted.
- If an article image is available, include one relevant image inside the article card, not after it.
- If public X metadata, article metadata, or media extraction is unavailable, still send a compact fallback email using the saved item title or URL, the linked email headline, and the best available visible text or summary. Do not add process notes about the metadata failure.
- Preserve an editorial, cream-background email style with dark serif headings, muted green accents, rounded cards, and generous single-column spacing.
- Do not mention other skills or internal implementation sources in the delivered email.

Timing and orchestration:

- The intended schedules are 10:30 PM daily for Snap Reads, 8:00 AM Saturdays for Actionable, 8:00 AM Sundays for Rich Reads, and 5:00 PM Fridays for Watch.
- The systemd service should invoke the Knlgpt orchestration launcher, not call the Node sender directly.
- The launcher should run `codex exec` with this skill in daily automation mode, inheriting `CREDENTIALS_DIRECTORY`, `RESEND_FROM`, and `RESEND_TO`.
- Service and timer templates live in `systemd/`.

## Boundaries

- Confirm before destructive or bulk account changes.
- Archiving is usually acceptable after the user explicitly asks for it for specific items.
- Do not delete bookmarks unless the user explicitly asks.
- Treat saved article contents and highlights as private user data.
- If the credential is missing, explain that setup is needed and point to `scripts/setup_systemd_instapaper_credential.sh`.
