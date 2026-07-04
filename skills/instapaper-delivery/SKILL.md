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

## Boundaries

- Confirm before destructive or bulk account changes.
- Archiving is usually acceptable after the user explicitly asks for it for specific items.
- Do not delete bookmarks unless the user explicitly asks.
- Treat saved article contents and highlights as private user data.
- If the credential is missing, explain that setup is needed and point to `scripts/setup_systemd_instapaper_credential.sh`.
