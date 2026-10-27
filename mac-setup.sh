#!/usr/bin/env bash
# One-time setup for Chiaki-NG Web on macOS: installs build tools with Homebrew,
# builds the WebAssembly streaming core, and builds the Rust network relay.
set -euo pipefail
cd "$(dirname "$0")"
# Prefer Homebrew's tools over older copies (e.g. nvm's node) earlier on PATH.
for p in /opt/homebrew/bin /usr/local/bin; do
  if [ -x "$p/brew" ]; then export PATH="$p:$PATH"; break; fi
done

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh, then run this script again." >&2
  exit 1
fi

echo "==> Installing build tools (emscripten, cmake, ninja, node, rust)..."
brew install emscripten cmake ninja node rust

echo "Using node at $(command -v node)"
NODE_OK=$(node -e 'const v=process.versions.node.split(".").map(Number);console.log(v[0]>26||(v[0]===26&&(v[1]>12||(v[1]===12&&v[2]>=1)))?1:0)')
if [ "$NODE_OK" != "1" ]; then
  echo "Node $(node -v) is too old (need 26.12.1+). Run: brew upgrade node" >&2
  exit 1
fi

echo "==> Building the WebAssembly streaming core (a few minutes)..."
./scripts/build-wasm.sh

echo "==> Building the Rust network relay..."
cargo build --release --locked --manifest-path wasm/relay-rust/Cargo.toml

echo
echo "Done. Double-click 'Start Chiaki-NG Web.command' to play."
