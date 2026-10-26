# Native relay for the browser edition

The UI still runs in a normal browser. The existing Chiaki C core still runs as
WebAssembly, with WebCodecs video decoding and AudioWorklet audio. This first
migration stage replaces the **direct TCP/UDP relay** with a Rust executable.

```text
Browser: UI + Chiaki WASM
    | HTTPS / WebSocket (unchanged 28-byte Chiaki protocol)
Node: login, cookies, SQLite, files, WebSocket transport, sharing
    | authenticated, length-prefixed TCP on loopback
Rust: native TCP/UDP sockets
    | Remote Play protocol
PS4 / PS5
```

Approved home proxy agents retain their existing route through Node. Electron
continues to use the original backend unless explicitly configured for Rust.
No protocol, console registration key, or account database migration is needed.

## Run

Requirements: Node.js 26.12.1+, stable Rust, and the existing WASM build dependencies
listed in [`../Build_WASM.md`](../Build_WASM.md). On Windows, Rust's MSVC target
also needs the Visual Studio C++ build tools.

From the repository root, first build the streaming core:

```powershell
.\scripts\build-wasm.ps1
```

Then start the browser edition with the Rust relay:

```powershell
.\scripts\run-web.ps1
# Subsequent launches without rebuilding Rust:
.\scripts\run-web.ps1 -NoBuild
# Use a specific port if another application already uses the default:
.\scripts\run-web.ps1 -NoBuild -Port 8090
```

Linux/macOS:

```sh
sh scripts/build-wasm.sh
sh scripts/run-web.sh
```

Open the localhost URL printed by the server. Away from localhost, keep the
existing HTTPS setup and COOP/COEP headers. The browser now gives separate
diagnostics for insecure origins, missing isolation headers, missing WebAssembly,
and missing WebCodecs before attempting to start a stream.

To configure manually:

```sh
cargo build --release --locked --manifest-path wasm/relay-rust/Cargo.toml
# Set in .env, or in the process environment:
# CHIAKI_RELAY_BACKEND=rust
node wasm/proxy/server.mjs
```

`CHIAKI_RELAY_BIN` overrides the executable path. Set it to an absolute path when
running a copied build directory or packaged app. Otherwise the server looks for
`wasm/relay-rust/target/release/chiaki-relay[.exe]` relative to its source module.
The launcher sets this path automatically. `CHIAKI_RELAY_ALLOW_WAN` is passed to
the native process with the same meaning as the original server setting.

Without a backend setting the original Node backend remains available. The new
launchers and `.env.example` select Rust. Set `CHIAKI_RELAY_BACKEND=node` to run
the legacy backend. Selecting Rust with a missing or broken executable stops
startup with an error; it does not silently switch backends.

## Resource handling

- The Rust listener binds only to `127.0.0.1` on a random port. Node generates a
  fresh 256-bit process token; it is not sent to the browser. The existing Node
  session and origin checks run before the direct Rust route is selected.
- Maximum 32 simultaneous relay sessions, 64 console sockets per session,
  256 KiB per protocol packet, and 32 queued outgoing packets per session.
- Native socket reads use at most 64 KiB per packet. Node pauses reads when a
  transport backs up, with an additional 4 MiB pending-write cap. WebSocket
  masking, lengths, fragmentation, and control frames are checked on this route.
- Native connect, DNS, send, and shutdown operations time out after 3 seconds;
  a stalled native output connection closes after 5 seconds. These are bounds,
  not reconnection guarantees.
- Disconnecting a browser releases its native sockets and aborts their readers.
  Stopping Node also stops its child relay; a liveness pipe handles parent crashes.
  A relay crash closes active direct
  sessions; restart the server to recover. Automatic session recovery is not
  implemented.
- LAN destinations and discovery retain the upstream behavior. WAN destinations
  are limited to the existing Remote Play port list. Loopback, link-local,
  unspecified, and reserved unicast destinations are rejected by Rust. This
  policy is not a per-console ownership restriction.
- UDP binds use an ephemeral local port, matching the existing web backend so
  browser sessions do not contend for console port numbers. Unused socket
  options are acknowledged as in the original proxy; this is a Chiaki protocol
  adapter, not a general POSIX implementation.

## Verify

```sh
cargo fmt --manifest-path wasm/relay-rust/Cargo.toml --check
cargo clippy --locked --manifest-path wasm/relay-rust/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path wasm/relay-rust/Cargo.toml
cargo build --release --locked --manifest-path wasm/relay-rust/Cargo.toml
node --test wasm/proxy/runtime-checks.test.mjs wasm/proxy/rust-relay.test.mjs
```

Tests cover the C wire layout, malformed packets, destination policy, socket
limits, UDP receive/cleanup, masked and fragmented WebSocket transport, process
authentication, session isolation, TCP/UDP echo, native shutdown, and the actual
web server's login checks, HTTP assets, and isolation headers. Native integration
tests require the built executable; TCP/UDP echo requires a private IPv4
interface and is skipped if none is available.

## Remaining validation and work

The browser crypto backend has an additional AddressSanitizer regression test.
After configuring/building the WASM core, run with the Emscripten environment loaded:

```sh
cmake --build build-wasm --target chiaki-wasm-crypto-test
node build-wasm/wasm/rpcrypt-test.cjs
```

It checks the upstream PS5 registration IV and encryption vectors and detects an
undersized SHA-256 result buffer in the Mbed TLS path. The test target is excluded
from the shipping browser bundle.

Real PS4/PS5 pairing, sustained video/audio, controller input, sharing with a
viewer, home-agent streaming, and Electron packaging need device or environment
testing. No lower-latency claim is made: compare frame latency, CPU, memory, and
packet loss against the Node backend with the same console and network first.

Local PS5 firmware 13.60 pairing and live H.265 video were verified after fixing
the Mbed TLS SHA-256 output buffer overflow. Longer sessions, controller features,
and the other environments listed above still need validation.

The account/API server and WebSocket transport remain in JavaScript. Future
migration can move those into Rust after compatibility tests cover their public
interfaces. The existing WASM build, IPv4 requirement, and absence of PSN
holepunch support are unchanged. This code retains the project's AGPL license.
