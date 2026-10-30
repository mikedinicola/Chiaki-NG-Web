#!/usr/bin/env bash
# Starts the local server and opens it in Chrome once it is listening. Close this window to stop.
cd "$(dirname "$0")"
for p in /opt/homebrew/bin /usr/local/bin; do
	if [ -x "$p/brew" ]; then export PATH="$p:$PATH"; break; fi
done
if [ ! -f build-wasm/wasm/chiaki.wasm ]; then
	echo "Streaming core missing: run ./mac-setup.sh first." >&2
	exit 1
fi
export CHIAKI_WASM_PORT="${CHIAKI_WASM_PORT:-8090}"
opened=0
# The server prints its actual address (it may fall back to another port) once listening.
node wasm/proxy/server.mjs 2>&1 | while IFS= read -r line; do
	printf '%s\n' "$line"
	if [ "$opened" = 0 ] && [[ "$line" =~ ^chiaki-ng\ WASM\ \(local\):\ (http://127\.0\.0\.1:[0-9]+/)$ ]]; then
		opened=1
		open -a "Google Chrome" "${BASH_REMATCH[1]}" 2>/dev/null || open "${BASH_REMATCH[1]}"
	fi
done
