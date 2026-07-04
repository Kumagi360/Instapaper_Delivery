#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_path="$repo_root/skills/instapaper-delivery"
target_parent="$HOME/.codex/skills"
target_path="$target_parent/instapaper-delivery"

if [[ ! -d "$source_path" ]]; then
  echo "Missing skill source: $source_path" >&2
  exit 1
fi

mkdir -p "$target_parent"

if [[ -L "$target_path" ]]; then
  current_target="$(readlink "$target_path")"
  if [[ "$current_target" == "$source_path" ]]; then
    echo "Skill already installed:"
    echo "$target_path -> $source_path"
    exit 0
  fi
  rm "$target_path"
elif [[ -e "$target_path" ]]; then
  backup_path="$target_path.backup.$(date +%Y%m%d%H%M%S)"
  mv "$target_path" "$backup_path"
  echo "Backed up existing skill to:"
  echo "$backup_path"
fi

ln -s "$source_path" "$target_path"

echo "Installed Instapaper Delivery skill:"
echo "$target_path -> $source_path"
