#!/usr/bin/env bash
# Starts the local Chiaki-NG Web server and opens it in Chrome. Close this window to stop.
cd "$(dirname "$0")"
# Prefer Homebrew's tools over older copies (e.g. nvm's node) earlier on PATH.
for p in /opt/homebrew/bin /usr/local/bin; do
  if [ -x "$p/brew" ]; then export PATH="$p:$PATH"; break; fi
done
exec node scripts/launch-mac.mjs
