#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [ "${EUID}" -ne 0 ]; then echo 'Run sudo bash start.sh.' >&2; exit 1; fi
command -v docker >/dev/null || { echo 'Install Docker Engine and the Compose plugin first. See docs/ONLINE_PLAY.md.' >&2; exit 1; }
command -v curl >/dev/null || { echo 'Install curl first.' >&2; exit 1; }
docker compose version >/dev/null
if [ ! -f .env ]; then bash setup.sh; fi
docker compose up -d --build
domain=$(sed -n 's/^PLAY_DOMAIN=//p' .env)
if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,250})[a-zA-Z0-9]$ ]] || [[ "$domain" != *.* ]] || [[ "$domain" == *..* ]]; then echo 'Invalid configured domain.' >&2; exit 1; fi
echo 'Waiting for HTTPS. DNS must point to this VPS and its firewall must allow the documented ports.'
for attempt in {1..60}; do
  if [ "$(curl --fail --silent --max-time 3 "https://$domain/health" || true)" = 'ok' ]; then
    echo 'Invitation server is ready. On your gaming PC: Settings > Online play > paste this code.'
    bash connect-code.sh
    exit 0
  fi
  sleep 3
done
echo 'HTTPS is not ready yet. Check DNS, VPS firewall ports and docker compose logs. Retry sudo bash start.sh; existing keys are preserved.' >&2
exit 1
