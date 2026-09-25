#!/usr/bin/env bash
# Idempotent dependency install for cloud agent sessions.
# Claude Code on the web runs it at session start (CLAUDE_CODE_REMOTE=true).
# Codex cloud: set the environment's setup script to `bash scripts/setup.sh --force`.
# On a local machine it does nothing unless called with --force.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${CLAUDE_CODE_REMOTE:-}" != "true" && "${1:-}" != "--force" ]]; then
  exit 0
fi

for dir in . web server; do
  if [[ -f "$dir/package-lock.json" ]]; then
    (cd "$dir" && npm ci --no-audit --no-fund)
  elif [[ -f "$dir/package.json" ]]; then
    (cd "$dir" && npm install --no-audit --no-fund)
  fi
done

if [[ -f server-py/requirements.txt ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r server-py/requirements.txt
fi
