#!/usr/bin/env bash
# One-time macOS setup: installs the build tools with Homebrew and builds the WebAssembly core.
set -euo pipefail
cd "$(dirname "$0")"
# Prefer Homebrew's tools over older copies (for example nvm's node) earlier on PATH.
for p in /opt/homebrew/bin /usr/local/bin; do
	if [ -x "$p/brew" ]; then export PATH="$p:$PATH"; break; fi
done
if ! command -v brew >/dev/null 2>&1; then
	echo "Homebrew is required. Install it from https://brew.sh, then run this script again." >&2
	exit 1
fi
if [ "$(uname -m)" = "arm64" ] && ! arch -x86_64 /usr/bin/true 2>/dev/null; then
	echo "The pinned protoc 3.9.1 build is x86_64 and needs Rosetta 2. Install it with:" >&2
	echo "  softwareupdate --install-rosetta --agree-to-license" >&2
	exit 1
fi

echo "==> Installing build tools (emscripten, cmake, ninja, node)..."
brew install emscripten cmake ninja node

echo "Using node $(node -v) at $(command -v node)"
if ! node -e 'require("node:sqlite")' 2>/dev/null; then
	echo "This Node has no built-in SQLite (node:sqlite). Run: brew upgrade node" >&2
	exit 1
fi

echo "==> Building the WebAssembly streaming core (a few minutes)..."
./scripts/build-wasm.sh

echo
echo "Done. Double-click 'Start Chiaki-NG Web.command' to play."
