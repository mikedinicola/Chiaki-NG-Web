#!/usr/bin/env bash
# Starts the local Chiaki-NG Web server and opens it in Chrome. Close this window to stop.
cd "$(dirname "$0")"
# Prefer Homebrew's tools over older copies (e.g. nvm's node) earlier on PATH.
for p in /opt/homebrew/bin /usr/local/bin; do
  if [ -x "$p/brew" ]; then export PATH="$p:$PATH"; break; fi
done
PORT=8090
( sleep 3; open -a "Google Chrome" "http://127.0.0.1:$PORT/" 2>/dev/null || open "http://127.0.0.1:$PORT/" ) &
CHIAKI_WASM_PORT=$PORT exec ./scripts/run-web.sh
