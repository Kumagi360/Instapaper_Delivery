#!/usr/bin/env bash
set -euo pipefail

credential_name="instapaper_credentials"
credential_dir="/etc/credstore.encrypted"
credential_path="$credential_dir/$credential_name"

if ! command -v systemd-creds >/dev/null 2>&1; then
  echo "systemd-creds is required but was not found." >&2
  exit 1
fi

read_secret() {
  local prompt="$1"
  local value
  printf "%s" "$prompt" >&2
  stty -echo
  IFS= read -r value
  stty echo
  printf "\n" >&2
  printf "%s" "$value"
}

read_plain() {
  local prompt="$1"
  local value
  printf "%s" "$prompt" >&2
  IFS= read -r value
  printf "%s" "$value"
}

consumer_key="$(read_plain "Instapaper OAuth consumer key: ")"
consumer_secret="$(read_secret "Instapaper OAuth consumer secret: ")"
username="$(read_plain "Instapaper email or username: ")"
password="$(read_secret "Instapaper password, if you have one: ")"

if [[ -z "$consumer_key" || -z "$consumer_secret" || -z "$username" ]]; then
  echo "Consumer key, consumer secret, and username are required." >&2
  exit 1
fi

tmp_plain="$(mktemp)"
cleanup() {
  rm -f "$tmp_plain"
}
trap cleanup EXIT

INSTAPAPER_CONSUMER_KEY="$consumer_key" \
INSTAPAPER_CONSUMER_SECRET="$consumer_secret" \
INSTAPAPER_USERNAME="$username" \
INSTAPAPER_PASSWORD="$password" \
node ./scripts/instapaper.mjs xauth > "$tmp_plain"

chmod 600 "$tmp_plain"
sudo install -d -m 0755 "$credential_dir"
sudo systemd-creds encrypt \
  --name="$credential_name" \
  "$tmp_plain" \
  "$credential_path"
sudo chmod 600 "$credential_path"

unset consumer_key consumer_secret username password

echo "Stored encrypted Instapaper credential:"
echo "- $credential_path"
echo
echo "Test it with:"
echo "./scripts/run_with_instapaper_credential.sh node ./scripts/instapaper.mjs verify"
