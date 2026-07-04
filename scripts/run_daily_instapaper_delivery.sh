#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/kunalgupta/Desktop/knlgpt/Instapaper_Delivery"
cd "$repo_root"

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export RESEND_FROM="${RESEND_FROM:?RESEND_FROM must be set by the service environment}"
export RESEND_TO="${RESEND_TO:?RESEND_TO must be set by the service environment}"
snap_folder="${INSTAPAPER_SNAP_FOLDER:-Snap Reads}"

case "$snap_folder" in
  "Snap Reads") ;;
  *)
    echo "Unsupported INSTAPAPER_SNAP_FOLDER: $snap_folder" >&2
    exit 64
    ;;
esac

prompt="$(cat <<PROMPT
Use the instapaper-delivery skill in daily automation mode.

Run the daily Instapaper Delivery snap read end to end in the America/Los_Angeles timezone.

Hard requirements:
- Do not ask for approval, confirmation, or follow-up.
- Send exactly one snap read email.
- Select the oldest item in the Instapaper '$snap_folder' folder.
- Render the email using the tracked Instapaper Delivery rules.
- Use a short, content-specific email headline under 8 words and link that headline to the saved article or post.
- Do not show a visible subheading under the email headline and do not include an 'Open original' button.
- Do not put a separate headline/title inside content cards.
- Do not include standalone action links such as 'Open X thread', 'Open X post', 'Read ...', or 'Read the saved article'. The linked email headline is the primary route to the saved item.
- For X posts that appear to be threads but whose full extent is not visible, do not synthesize a summary. Render one callout card labeled 'X thread' containing only the visible original post content.
- For X one-offs, render one callout card labeled 'X post' containing only the visible original post content.
- Keep URLs that appear in the original X post text inline and visibly emphasized inside the callout.
- Put any available X images inside the X callout itself, not after it, and do not describe or over-weight images unless the image contains essential readable content.
- For direct non-X articles or video links, render one card with a clearly labeled 'Article Summary' section. Do not add a standalone source link below the summary; use the linked email headline.
- Use '.transient-snap-read.json' only as a short-lived payload for 'src/resend_snap_read.mjs'.
- Send through Resend using 'RESEND_FROM', 'RESEND_TO', and the available Resend API key source.
- On this Linux/Raspbian host, the Instapaper credential is expected from the systemd credential mounted at '\$CREDENTIALS_DIRECTORY/instapaper_delivery_credentials'.
- On this Linux/Raspbian host, the Resend key is expected from the systemd credential mounted at '\$CREDENTIALS_DIRECTORY/resend_api_key'.
- After sending or deciding not to send, remove any '.transient-*' payloads and generated email artifacts.
- Do not archive, delete, star, unstar, or otherwise mutate Instapaper bookmarks during this automation run.
- Do not commit, push, or modify tracked repo files during this automation run.

Implementation preference:
- Prefer the existing deterministic sender: 'node ./src/send_daily_snap_read.mjs'.
- If that fails because a public source is unavailable, still send a compact email with the saved item title or URL, a useful fallback summary, and the original link.

Finish with a concise status including whether an email was sent, the selected folder, the selected item title or URL, and any guardrail reason if no email was sent.
PROMPT
)"

exec /usr/local/bin/codex exec \
  --model gpt-5.5 \
  --dangerously-bypass-approvals-and-sandbox \
  --cd "$repo_root" \
  -c 'shell_environment_policy.inherit="all"' \
  "$prompt"
