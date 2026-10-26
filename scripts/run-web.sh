#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
cargo build --release --locked --manifest-path wasm/relay-rust/Cargo.toml
export CHIAKI_RELAY_BACKEND=rust
export CHIAKI_RELAY_BIN="${CHIAKI_RELAY_BIN:-$(pwd)/wasm/relay-rust/target/release/chiaki-relay}"
if [ ! -f "${CHIAKI_WASM_ROOT:-build-wasm/wasm}/chiaki.wasm" ]; then
    echo "Streaming core missing: run scripts/build-wasm.sh before starting Remote Play." >&2
fi
exec node wasm/proxy/server.mjs
