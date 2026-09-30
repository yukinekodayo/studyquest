#!/usr/bin/env bash
# Web版を本番ビルドして配信する(E2E用)。 .env の EXPO_PUBLIC_* がビルドに埋め込まれる
set -euo pipefail
cd "$(dirname "$0")/../.."
npx expo export -p web --output-dir dist --clear
exec node scripts/e2e/serve.mjs "${1:-8081}"
