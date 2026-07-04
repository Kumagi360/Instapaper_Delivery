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
install -m 0644 "$repo_root/systemd/instapaper-delivery-actionable.service" \
  "$runtime_root/systemd/instapaper-delivery-actionable.service"
install -m 0644 "$repo_root/systemd/instapaper-delivery-actionable.timer" \
  "$runtime_root/systemd/instapaper-delivery-actionable.timer"
install -m 0644 "$repo_root/systemd/instapaper-delivery-rich-read.service" \
  "$runtime_root/systemd/instapaper-delivery-rich-read.service"
install -m 0644 "$repo_root/systemd/instapaper-delivery-rich-read.timer" \
  "$runtime_root/systemd/instapaper-delivery-rich-read.timer"
install -m 0644 "$repo_root/systemd/instapaper-delivery-watch.service" \
  "$runtime_root/systemd/instapaper-delivery-watch.service"
install -m 0644 "$repo_root/systemd/instapaper-delivery-watch.timer" \
  "$runtime_root/systemd/instapaper-delivery-watch.timer"
install -m 0644 "$repo_root/systemd/instapaper-delivery-action.service" \
  "$runtime_root/systemd/instapaper-delivery-action.service"

env_path="$config_root/instapaper-delivery.env"
if [[ ! -f "$env_path" ]]; then
  umask 077
  cat > "$env_path" <<'ENV'
RESEND_FROM=Codex Digest <onboarding@resend.dev>
RESEND_TO=kunalinks@gmail.com
INSTAPAPER_SNAP_FOLDER=Snap Reads
# Optional: enable archive/delete buttons in delivery emails.
# The action server must be reachable from the email-reading device.
# INSTAPAPER_ACTION_BASE_URL=http://rpi-4b.local:8765
# INSTAPAPER_ACTION_SECRET=replace-with-a-long-random-secret
# INSTAPAPER_ACTION_TOKEN_TTL_DAYS=14
ENV
fi

echo "Installed Instapaper Delivery orchestration files:"
echo "- $runtime_root/run_daily_instapaper_delivery.sh"
echo "- $runtime_root/systemd/instapaper-delivery-snap-read.service"
echo "- $runtime_root/systemd/instapaper-delivery-snap-read.timer"
echo "- $runtime_root/systemd/instapaper-delivery-actionable.service"
echo "- $runtime_root/systemd/instapaper-delivery-actionable.timer"
echo "- $runtime_root/systemd/instapaper-delivery-rich-read.service"
echo "- $runtime_root/systemd/instapaper-delivery-rich-read.timer"
echo "- $runtime_root/systemd/instapaper-delivery-watch.service"
echo "- $runtime_root/systemd/instapaper-delivery-watch.timer"
echo "- $runtime_root/systemd/instapaper-delivery-action.service"
echo "- $env_path"
echo
echo "To install the systemd units:"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-snap-read.service /etc/systemd/system/instapaper-delivery-snap-read.service"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-snap-read.timer /etc/systemd/system/instapaper-delivery-snap-read.timer"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-actionable.service /etc/systemd/system/instapaper-delivery-actionable.service"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-actionable.timer /etc/systemd/system/instapaper-delivery-actionable.timer"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-rich-read.service /etc/systemd/system/instapaper-delivery-rich-read.service"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-rich-read.timer /etc/systemd/system/instapaper-delivery-rich-read.timer"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-watch.service /etc/systemd/system/instapaper-delivery-watch.service"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-watch.timer /etc/systemd/system/instapaper-delivery-watch.timer"
echo "sudo install -m 0644 $runtime_root/systemd/instapaper-delivery-action.service /etc/systemd/system/instapaper-delivery-action.service"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable --now instapaper-delivery-snap-read.timer"
echo "sudo systemctl enable --now instapaper-delivery-actionable.timer"
echo "sudo systemctl enable --now instapaper-delivery-rich-read.timer"
echo "sudo systemctl enable --now instapaper-delivery-watch.timer"
echo "sudo systemctl enable --now instapaper-delivery-action.service"
