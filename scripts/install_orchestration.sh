#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${XDG_DATA_HOME:-$HOME/.local/share}/instapaper-delivery"
config_root="${XDG_CONFIG_HOME:-$HOME/.config}/knlgpt-orchestration"

mkdir -p "$runtime_root/systemd" "$config_root"

install -m 0755 "$repo_root/scripts/run_daily_instapaper_delivery.sh" \
  "$runtime_root/run_daily_instapaper_delivery.sh"
install -m 0644 "$repo_root/systemd/instapaper-delivery-snap-read.service" \
  "$runtime_root/systemd/instapaper-delivery-snap-read.service"
install -m 0644 "$repo_root/systemd/instapaper-delivery-snap-read.timer" \
  "$runtime_root/systemd/instapaper-delivery-snap-read.timer"

env_path="$config_root/instapaper-delivery.env"
if [[ ! -f "$env_path" ]]; then
  umask 077
  cat > "$env_path" <<'ENV'
RESEND_FROM=Codex Digest <onboarding@resend.dev>
RESEND_TO=kunalinks@gmail.com
INSTAPAPER_SNAP_FOLDER=Snap Reads
ENV
fi

echo "Installed Instapaper Delivery orchestration files:"
echo "- $runtime_root/run_daily_instapaper_delivery.sh"
echo "- $runtime_root/systemd/instapaper-delivery-snap-read.service"
echo "- $runtime_root/systemd/instapaper-delivery-snap-read.timer"
echo "- $env_path"
echo
echo "To install the systemd units:"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-snap-read.service /etc/systemd/system/instapaper-delivery-snap-read.service"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-snap-read.timer /etc/systemd/system/instapaper-delivery-snap-read.timer"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable --now instapaper-delivery-snap-read.timer"
