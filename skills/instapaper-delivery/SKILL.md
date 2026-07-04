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

## Snap Read Email Delivery

Use Snap Read delivery when the user asks for a saved item from the `Snap Reads` Instapaper folder to be sent by email.

- Prefer the oldest item in `Snap Reads` for the daily run unless the user asks for a different selection rule.
- Send through Resend using the existing encrypted systemd credential named `resend_api_key`.
- Use `scripts/run_with_resend_credential.sh` for manual sends.
- Use `scripts/run_with_delivery_credentials.sh` when one command needs both Instapaper and Resend credentials.
- Use `src/resend_snap_read.mjs` to render and send a prepared `.transient-snap-read.json` payload.
- Use `src/send_daily_snap_read.mjs` for unattended daily sends.
- Do not ask the user to paste Resend or Instapaper credentials into chat.

Content rules:

- For X/Twitter items that are readable threads, send the actual visible thread text and images in a polished, mobile-friendly HTML email.
- If X only exposes the thread starter through public embeds, say so plainly in the email and link to the original.
- For X posts that are mainly links, send a heading, one compact paragraph, and the original link.
- For direct non-X articles or links, send a heading, one compact paragraph, and the original link.
- Preserve an editorial, cream-background email style with dark serif headings, muted green accents, rounded cards, and generous single-column spacing.
- Do not mention other skills or internal implementation sources in the delivered email.

Daily timing:

- The intended schedule is 6:30 AM local time with a systemd timer.
- Service and timer templates live in `systemd/instapaper-delivery-snap-read.service` and `systemd/instapaper-delivery-snap-read.timer`.

## Boundaries

- Confirm before destructive or bulk account changes.
- Archiving is usually acceptable after the user explicitly asks for it for specific items.
- Do not delete bookmarks unless the user explicitly asks.
- Treat saved article contents and highlights as private user data.
- If the credential is missing, explain that setup is needed and point to `scripts/setup_systemd_instapaper_credential.sh`.
