#!/usr/bin/env bash
set -euo pipefail

credential_name="resend_api_key"
credential_path="/etc/credstore.encrypted/$credential_name"
run_user="$(id -un)"
workdir="$(pwd)"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

if ! sudo -n test -f "$credential_path" 2>/dev/null; then
  echo "Missing encrypted systemd credential: $credential_path" >&2
  echo "Use the existing Resend credential setup first." >&2
  exit 1
fi

setenv_args=()
for env_name in RESEND_FROM RESEND_TO NODE_ENV; do
  if [[ -n "${!env_name:-}" ]]; then
    setenv_args+=(--setenv="${env_name}=${!env_name}")
  fi
done

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
  "${setenv_args[@]}" \
  "$command_path" \
  "$@"
