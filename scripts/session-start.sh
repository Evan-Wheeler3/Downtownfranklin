#!/usr/bin/env bash
# SessionStart hook: make a fresh (cloud) checkout ready to build, test and run the pipeline.
# Idempotent and quiet when everything is already installed.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1
  echo "session-start: installed npm dependencies"
fi
if [ ! -x .venv/bin/python ] && command -v python3 >/dev/null; then
  python3 -m venv .venv && .venv/bin/pip install -q -r pipeline/requirements.txt >/dev/null 2>&1 \
    && echo "session-start: created .venv with pipeline requirements" || echo "session-start: venv setup failed (pipeline only)"
fi
echo "session-start: read docs/STATUS.md for current project state"
