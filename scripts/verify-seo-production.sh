#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/verify-seo-production.py --base-url "${BASE_URL:-https://sammlerraum.de}" "$@"
