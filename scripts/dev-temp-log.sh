#!/usr/bin/env bash

set -euo pipefail

LOG_FILE="$(mktemp /tmp/canvas029-localtest.XXXXXX)"
LOG_POINTER="/tmp/canvas029-localtest.current"

cleanup() {
  rm -f "$LOG_POINTER"
  rm -f "$LOG_FILE"
}

trap cleanup EXIT INT TERM

echo "$LOG_FILE" > "$LOG_POINTER"
echo "[local-test-log] writing to: $LOG_FILE"
echo "[local-test-log] pointer: $LOG_POINTER"
echo "[local-test-log] file will be deleted when this dev process exits"

npm run dev -- "$@" 2>&1 | tee "$LOG_FILE"
