#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/kunalgupta/Desktop/knlgpt/Instapaper_Delivery"
cd "$repo_root"

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export RESEND_FROM="${RESEND_FROM:?RESEND_FROM must be set by the service environment}"
export RESEND_TO="${RESEND_TO:?RESEND_TO must be set by the service environment}"
delivery_name="${INSTAPAPER_DELIVERY_NAME:-Snap Read}"
delivery_folder="${INSTAPAPER_DELIVERY_FOLDER_NAME:-${INSTAPAPER_SNAP_FOLDER:-Snap Reads}}"
delivery_folder_id="${INSTAPAPER_DELIVERY_FOLDER_ID:-5255437}"

prompt="$(cat <<PROMPT
Use the instapaper-delivery skill in daily automation mode.

Run the Instapaper Delivery '$delivery_name' send end to end in the America/Los_Angeles timezone.

Hard requirements:
- Do not ask for approval, confirmation, or follow-up.
- Send exactly one Instapaper delivery email.
- Select the oldest item in the Instapaper '$delivery_folder' folder, using folder id '$delivery_folder_id'.
- Build and render the email using the tracked Instapaper Delivery skill rules.
- Use '.transient-snap-read.json' only as a short-lived payload for 'src/resend_snap_read.mjs'.
- Send through Resend using 'RESEND_FROM', 'RESEND_TO', and the available Resend API key source.
- On this Linux/Raspbian host, the Instapaper credential is expected from the systemd credential mounted at '\$CREDENTIALS_DIRECTORY/instapaper_delivery_credentials'.
- On this Linux/Raspbian host, the Resend key is expected from the systemd credential mounted at '\$CREDENTIALS_DIRECTORY/resend_api_key'.
- After sending or deciding not to send, remove any '.transient-*' payloads and generated email artifacts.
- Do not archive, delete, star, unstar, or otherwise mutate Instapaper bookmarks during this automation run.
- Do not commit, push, or modify tracked repo files during this automation run.

Implementation preference:
- Prefer the existing deterministic sender: 'node ./src/send_daily_snap_read.mjs'.

Finish with a concise status including whether an email was sent, the selected delivery name, selected folder, selected item title or URL, and any guardrail reason if no email was sent.
PROMPT
)"

exec /usr/local/bin/codex exec \
  --model gpt-5.5 \
  --dangerously-bypass-approvals-and-sandbox \
  --cd "$repo_root" \
  -c 'shell_environment_policy.inherit="all"' \
  "$prompt"
