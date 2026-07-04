#!/usr/bin/env bash
set -euo pipefail

credential_name="instapaper_delivery_credentials"
credential_path="/etc/credstore.encrypted/$credential_name"
run_user="$(id -un)"
workdir="$(pwd)"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

if ! sudo -n test -f "$credential_path" 2>/dev/null; then
  echo "Missing encrypted systemd credential: $credential_path" >&2
  echo "Run ./scripts/setup_systemd_instapaper_credential.sh first." >&2
  exit 1
fi

command_path="$1"
if [[ "$command_path" != */* ]]; then
  command_path="$(command -v "$command_path")"
fi
shift

exec sudo systemd-run \
  --wait \
  --pipe \
  --collect \
  -p "User=$run_user" \
  -p "WorkingDirectory=$workdir" \
  -p "LoadCredentialEncrypted=$credential_name" \
  "$command_path" \
  "$@"
