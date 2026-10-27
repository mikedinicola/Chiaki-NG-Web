#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
node -e 'const v=process.versions.node.split(".").map(Number);if(v[0]<26||(v[0]===26&&(v[1]<12||(v[1]===12&&v[2]<1)))){console.error("Node 26.12.1 or newer is required; use .nvmrc/.node-version");process.exit(1)}'
if command -v cargo >/dev/null 2>&1; then
    cargo build --release --locked --manifest-path wasm/relay-rust/Cargo.toml
    export CHIAKI_RELAY_BACKEND=rust
    export CHIAKI_RELAY_BIN="${CHIAKI_RELAY_BIN:-$(pwd)/wasm/relay-rust/target/release/chiaki-relay}"
else
    echo "Rust (cargo) not found: using the built-in Node relay instead." >&2
    export CHIAKI_RELAY_BACKEND="${CHIAKI_RELAY_BACKEND:-node}"
fi
if [ ! -f "${CHIAKI_WASM_ROOT:-build-wasm/wasm}/chiaki.wasm" ]; then
    echo "Streaming core missing: run scripts/build-wasm.sh before starting Remote Play." >&2
fi
exec node wasm/proxy/server.mjs
