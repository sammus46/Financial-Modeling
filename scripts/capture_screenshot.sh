#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:5000}"
OUT="${2:-artifacts/ui-screenshot.png}"

mkdir -p "$(dirname "$OUT")"

echo "Capturing screenshot from $URL -> $OUT"
npx -y playwright screenshot --device="Desktop Chrome" "$URL" "$OUT"
echo "Saved screenshot to $OUT"
