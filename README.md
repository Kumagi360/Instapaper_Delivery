# Instapaper Plugin

A local Codex plugin and command-line utility for using Instapaper as a private read-later source.

The goal is to make your saved articles available to Codex workflows without pasting credentials into chat or committing secrets to disk. The tracked repo contains the plugin, scripts, skill instructions, and install metadata. Account credentials live outside the repo, preferably as encrypted systemd credentials.

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
plugins/instapaper/scripts/instapaper.mjs
        |
        v
Codex skill / local shell workflow
        |
        v
Article triage, summaries, digests, and saved-link management
```

The Node client is dependency-free and signs OAuth 1.0a requests directly. The setup script exchanges your Instapaper login plus an Instapaper API consumer key/secret for an OAuth access token/secret, then encrypts that credential bundle with `systemd-creds`.

## Repository Layout

- `plugins/instapaper/`: canonical tracked Codex plugin.
- `plugins/instapaper/scripts/instapaper.mjs`: Instapaper Full API client.
- `plugins/instapaper/scripts/setup_instapaper_credential.sh`: interactive credential setup.
- `plugins/instapaper/scripts/run_with_instapaper_credential.sh`: runs commands with the encrypted credential mounted at runtime.
- `plugins/instapaper/skills/instapaper/SKILL.md`: Codex skill instructions.
- `scripts/install_plugin.sh`: symlinks the tracked plugin into `~/plugins/instapaper`.
- `.agents/plugins/marketplace.json`: portable marketplace metadata for this repo.
- `docs/instapaper-skill.md`: exported reference copy of the skill instructions.

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

Install the tracked plugin into the local Codex plugin directory:

```bash
./scripts/install_plugin.sh
```

The script symlinks:

```text
plugins/instapaper -> ~/plugins/instapaper
```

If a non-symlink plugin already exists at that target, it is backed up first.

## Secret Storage

Preferred Linux storage:

```text
/etc/credstore.encrypted/instapaper_credentials
```

Create it with:

```bash
cd plugins/instapaper
./scripts/setup_instapaper_credential.sh
```

The setup script prompts for:

- Instapaper OAuth consumer key
- Instapaper OAuth consumer secret
- Instapaper email or username
- Instapaper password, if the account has one

It stores only the resulting OAuth credential bundle, encrypted by systemd. Do not commit credential JSON or paste it into chat.

The client reads credentials in this order:

1. `INSTAPAPER_CREDENTIALS_JSON`
2. systemd credential named `instapaper_credentials`, when `CREDENTIALS_DIRECTORY` is present
3. lower-assurance fallback file: `${XDG_CONFIG_HOME:-~/.config}/instapaper/credentials.json`

## Usage

Run commands through the credential wrapper:

```bash
cd plugins/instapaper
./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs verify
./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs list --folder unread --limit 25
./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs folders
./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs highlights <bookmark_id>
./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs add https://example.com/article --title "Article title"
./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs archive <bookmark_id>
```

Use `--json` for machine-readable output where supported.

## Other Machines

This plugin is not automatically available to Codex on other machines. To use it elsewhere:

1. Clone this repo.
2. Run `./scripts/install_plugin.sh`.
3. Add or install the repo marketplace metadata if needed by that Codex surface.
4. Run `plugins/instapaper/scripts/setup_instapaper_credential.sh` on that machine.

Credentials are intentionally machine-local. The repo should sync code and instructions, not account secrets.
