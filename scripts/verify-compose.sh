#!/usr/bin/env bash
set -euo pipefail
docker compose config >/tmp/sammlerraum-compose.yml
grep -q "sammlerraum-db:" /tmp/sammlerraum-compose.yml
grep -q "sammlerraum-uploads:" /tmp/sammlerraum-compose.yml
grep -q "worker:" /tmp/sammlerraum-compose.yml
grep -q "web:" /tmp/sammlerraum-compose.yml
