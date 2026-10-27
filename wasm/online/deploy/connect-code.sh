#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
env_file=${1:-.env}
if [ ! -r "$env_file" ]; then echo 'No readable server configuration. Run sudo bash start.sh first.' >&2; exit 1; fi
domain=$(sed -n 's/^PLAY_DOMAIN=//p' "$env_file")
key=$(sed -n 's/^HOST_KEY=//p' "$env_file")
if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,250})[a-zA-Z0-9]$ ]] || [[ "$domain" != *.* ]] || [[ "$domain" == *..* ]] || [[ ! "$key" =~ ^[a-f0-9]{64}$ ]]; then
  echo 'Invalid server configuration. Do not share this file; check PLAY_DOMAIN and HOST_KEY.' >&2; exit 1
fi
printf '%s\n' 'PRIVATE HOST SETUP CODE - paste into Chiaki on your gaming PC. Never send this code to a guest.'
printf 'chiaki-host-v1:'
printf '{"server":"https://%s","key":"%s"}' "$domain" "$key" | openssl base64 -A | tr '+/' '-_' | tr -d '='
printf '\n'
