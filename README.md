# Instapaper Delivery

A local Codex skill and command-line utility for delivering Instapaper saved articles into Codex workflows.

The goal is to make your saved articles available to Codex workflows without pasting credentials into chat or committing secrets to disk. The tracked repo contains the skill, scripts, client code, and documentation. Account credentials live outside the repo, preferably as encrypted systemd credentials.

## What It Does

- Verifies Instapaper account access.
- Lists unread, starred, archived, or folder-specific bookmarks.
- Saves URLs to Instapaper.
- Reads bookmark highlights.
- Archives, unarchives, stars, unstars, or deletes specific bookmarks.
- Stores OAuth credentials through encrypted systemd credentials on Linux.

## Architecture

```text
Instapaper Full API
        |
        v
src/instapaper.mjs
        |
        v
Codex skill / local shell workflow
        |
        v
Article triage, summaries, digests, and saved-link management
```

The Node client is dependency-free and signs OAuth 1.0a requests directly. The setup script exchanges your Instapaper login plus an Instapaper API consumer key/secret for an OAuth access token/secret, then encrypts that credential bundle with `systemd-creds`.

## Repository Layout

- `skills/instapaper-delivery/`: canonical tracked Codex skill.
- `src/instapaper.mjs`: Instapaper Full API client.
- `scripts/setup_systemd_instapaper_credential.sh`: interactive credential setup.
- `scripts/run_with_instapaper_credential.sh`: runs commands with the encrypted credential mounted at runtime.
- `scripts/install_skill.sh`: symlinks the tracked skill into `~/.codex/skills/instapaper-delivery`.
- `docs/instapaper-delivery-skill.md`: exported reference copy of the skill instructions.

## Instapaper API Prerequisite

Full account access requires Instapaper API application credentials:

- OAuth consumer key
- OAuth consumer secret

Instapaper says Full API token requests are human-reviewed. Request credentials from:

```text
https://www.instapaper.com/developers/v1/full-api
```

The Simple API can save URLs with basic authentication, but it cannot list or manage saved articles. This project targets the Full API because article triage needs account read access.

## Setup

Install the tracked skill into the local Codex skill directory:

```bash
./scripts/install_skill.sh
```

The script symlinks:

```text
skills/instapaper-delivery -> ~/.codex/skills/instapaper-delivery
```

If a non-symlink skill already exists at that target, it is backed up first.

## Secret Storage

Preferred Linux storage:

```text
/etc/credstore.encrypted/instapaper_delivery_credentials
```

Create it with:

```bash
./scripts/setup_systemd_instapaper_credential.sh
```

The setup script prompts for:

- Instapaper OAuth consumer key
- Instapaper OAuth consumer secret
- Instapaper email or username
- Instapaper password, if the account has one

It stores only the resulting OAuth credential bundle, encrypted by systemd. Do not commit credential JSON or paste it into chat.

The client reads credentials in this order:

1. `INSTAPAPER_CREDENTIALS_JSON`
2. systemd credential named `instapaper_delivery_credentials`, when `CREDENTIALS_DIRECTORY` is present
3. lower-assurance fallback file: `${XDG_CONFIG_HOME:-~/.config}/instapaper/credentials.json`

## Usage

Run commands through the credential wrapper:

```bash
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs verify
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs list --folder unread --limit 25
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs folders
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs highlights <bookmark_id>
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs add https://example.com/article --title "Article title"
./scripts/run_with_instapaper_credential.sh node ./src/instapaper.mjs archive <bookmark_id>
```

Use `--json` for machine-readable output where supported.

## Other Machines

This skill is not automatically available to Codex on other machines. To use it elsewhere:

1. Clone this repo.
2. Run `./scripts/install_skill.sh`.
3. Run `./scripts/setup_systemd_instapaper_credential.sh` on that machine.

Credentials are intentionally machine-local. The repo should sync code and instructions, not account secrets.
