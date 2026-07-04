#!/usr/bin/env bash
set -euo pipefail

instapaper_credential_name="instapaper_delivery_credentials"
resend_credential_name="resend_api_key"
instapaper_credential_path="/etc/credstore.encrypted/$instapaper_credential_name"
resend_credential_path="/etc/credstore.encrypted/$resend_credential_name"
run_user="$(id -un)"
workdir="$(pwd)"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

if ! sudo -n test -f "$instapaper_credential_path" 2>/dev/null; then
  echo "Missing encrypted systemd credential: $instapaper_credential_path" >&2
  exit 1
fi

if ! sudo -n test -f "$resend_credential_path" 2>/dev/null; then
  echo "Missing encrypted systemd credential: $resend_credential_path" >&2
  exit 1
fi

setenv_args=()
for env_name in RESEND_FROM RESEND_TO NODE_ENV INSTAPAPER_ACTION_BASE_URL INSTAPAPER_ACTION_SECRET INSTAPAPER_ACTION_TOKEN_TTL_DAYS INSTAPAPER_DELIVERY_NAME INSTAPAPER_DELIVERY_FOLDER_ID INSTAPAPER_DELIVERY_FOLDER_NAME INSTAPAPER_DELIVERY_SUMMARY_LABEL; do
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
  -p "LoadCredentialEncrypted=$instapaper_credential_name" \
  -p "LoadCredentialEncrypted=$resend_credential_name" \
  "${setenv_args[@]}" \
  "$command_path" \
  "$@"
