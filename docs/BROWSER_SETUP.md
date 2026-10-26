# Browser edition: install, pair, tune and verify

This fork keeps Remote Play in a browser. The streaming core is Chiaki C compiled
to WebAssembly; a Rust sidecar handles native TCP/UDP. Node serves the UI,
authentication, account storage and WebSocket transport. It is not a full Rust
rewrite. See [relay architecture](../wasm/relay-rust/README.md).

## Windows quick start

Install Git, Node.js 24+, stable Rust (MSVC target), Visual Studio C++ Build Tools,
CMake, Ninja, Python 3 and Emscripten. The tested local Emscripten SDK is 6.0.13.
Rust and Emscripten are build tools, not browser extensions.

```powershell
git clone --recurse-submodules https://github.com/SKIZZOO/Chiaki-NG-Web.git
cd Chiaki-NG-Web
# If Emscripten is not already installed:
git clone https://github.com/emscripten-core/emsdk.git .tools/emsdk
.\.tools\emsdk\emsdk install 6.0.13
.\.tools\emsdk\emsdk activate 6.0.13
.\scripts\build-wasm.ps1
.\scripts\run-web.ps1 -Port 8090
```

The build script creates an isolated Python environment with protobuf 4.25.3 and
downloads protoc 3.9.1. The launcher builds the Rust relay. Open
`http://127.0.0.1:8090/` in a Chromium browser supporting WebCodecs H.265. Future
launches can use `.\scripts\run-web.ps1 -NoBuild -Port 8090`.

Use the Node process on the console's local network. The browser URL being
localhost does not remove the PS5-to-PC network hop. Wire the PS5 and PC where
possible. Do not expose a local unauthenticated server publicly. For remote/LAN
browser access, configure HTTPS and authentication using
[server documentation](../wasm/README.md); keep COOP/COEP headers intact.

Configuration is optional for local use. `.env.example` documents the available
options; copying it enables authentication. Set `CHIAKI_SESSION_SECRET` to your
own random secret, clear the example cloud/public origin values for a local
installation, and select `CHIAKI_RELAY_BACKEND=rust`. Keep `.env` and databases
private. `CHIAKI_WASM_WWW` overrides UI files; `CHIAKI_WASM_ROOT` overrides the
compiled `build-wasm/wasm` directory.

Linux/macOS use `scripts/build-wasm.sh` and `scripts/run-web.sh` after loading the
Emscripten environment; see [build instructions](../wasm/Build_WASM.md).

## Pair the console

1. Enable Remote Play on PS5 and leave **Pair Device / Link Device** open.
2. Use **+** to choose a discovered console or enter its local IPv4 address.
3. Enter the account ID for the active console user and the fresh 8-digit PIN.
   Username lookup is automatic after a typing pause when the external provider
   is available. PSNTools is a manual fallback because its API requires browser
   verification. The app does not bypass that verification.
4. Pair, then select the saved console to stream. Existing registration keys can
   be imported under the advanced option.

A jailbroken console still needs working Remote Play for its active user.
Account activation and firmware support depend on the console; this fork does
not activate accounts or jailbreak a console. Pairing data stays in the browser
or configured authenticated account store. Never post pairing/registration keys
to an issue or a repository.

## Picture quality and fog noise

**Settings → Stream** offers two presets:

| Preset | Requested stream | GPU processing |
|---|---|---|
| High quality LAN | 1080p60, H.265, 50 Mbps | 35% edge-gated sharpening, no noise reduction |
| Clean fog / dark scenes | 1080p60, H.265, 80 Mbps | 10% edge-gated sharpening, 45% spatial noise reduction |

Restart the stream after changing bitrate, resolution or codec. Filters apply
to newly decoded frames immediately. Manual bitrate accepts 2–100 Mbps. This is
a request to the console encoder, not a promise of constant bitrate. Press
backtick (`) to see received encoded video Mbps, decoded fps, display resolution,
and unrecovered frame loss. Statistics exclude transport overhead and are not
the console's reported encoder target. Static scenes can use much less bitrate.

The noise filter averages similar neighboring colors and protects stronger
edges. It stores no preceding frame, so there is no temporal blending or extra
frame queue. Stronger settings can erase fine texture; start with the fog preset
and compare the same scene with noise reduction at 0. Sharpening deliberately
avoids very low-contrast grain. WebGL output dithering is disabled to avoid
adding another dithering stage. Browsers without WebGL use 2D rendering without
these filters, with an unavailable indicator beside the sliders.

If fog still crawls at a healthy received bitrate, disable film grain and motion
blur in the game where available. Game-rendered dithering, 8-bit SDR gradients
and encoder quantization cannot be fully undone by the client. Source detail is
limited by the 1080p Remote Play stream; a 4K monitor does not produce a native
4K stream. This build does not offer 10-bit HDR decoding or a console-side
encoder-quality override. More bandwidth alone cannot remove every artifact.

## Mouse and keyboard

Enable **Settings → Keys → PC keyboard + mouse controls**. Click the video to
capture raw mouse input where supported; F8 releases the cursor. WASD moves,
mouse looks, left/right click fire/aim, Space jumps, Shift sprints, Ctrl/C crouch,
R reloads, E interacts, P opens Options, **B opens PS**, **N opens Share** and
Tab activates the touchpad. Game button layouts still determine actual actions.
Backtick toggles the sidebar showing current bindings.

Mouse sampling uses a 16 ms velocity window, radial normalization and a 24 ms
idle cutoff. Dead-zone compensation defaults to 12%; match the game's right-stick
dead zone. Lower it if small movements jump, raise it if they do nothing. Reduce
in-game aim acceleration if possible. The console receives a controller stick,
so game turn-speed limits prevent true native-PC mouse behavior. Disabling the
preset restores your custom key bindings.

## Lossless Scaling

The external-mode checkbox keeps new streams windowed and offers a Steam launch
link. Activate LSFG in your installed Lossless Scaling app, starting with Fixed
×2 for a 60 fps stream and a 120 Hz display. The browser does not embed, start or
verify the proprietary engine. Frame generation adds displayed frames, not
source detail or input updates. Disable its sharpening when comparing this
client's filters. Lossless Scaling is neither bundled nor required.

## Verification and troubleshooting

```powershell
node --test wasm/proxy/runtime-checks.test.mjs wasm/proxy/console-setup.test.mjs wasm/proxy/client-features.test.mjs wasm/proxy/rust-relay.test.mjs
cargo test --locked --manifest-path wasm/relay-rust/Cargo.toml
node scripts/check-renderer.mjs
```

The renderer check prints two local URLs. Open both; each should report PASS
(real GPU path and forced 2D fallback). Tests cover colors, orientation, exact
cropping of padded frames, edge contrast, reduced fog-noise variance and edge
preservation. Stop this diagnostic server with Ctrl+C. Native relay tests require
the release Rust executable to have been built. CI validates the Rust and Node
paths on Windows and Linux; the GPU pixel check is a manual browser check.

For the WASM crypto regression fixture, after a WASM build:

```powershell
cmake --build build-wasm --target chiaki-wasm-crypto-test
node build-wasm/wasm/rpcrypt-test.cjs
```

- Runtime preflight identifies missing secure context, isolation or WebCodecs.
- Pairing timeout: reopen the console pairing screen with a fresh PIN. Check
  TCP/UDP connectivity from the proxy PC, not just the browser.
- Connection fails while another Remote Play client is open: disconnect it and
  retry. A saved registration does not guarantee a second simultaneous session.
- Low received Mbps during motion: confirm the stream was restarted and the
  desired profile is active. Requested and received bitrate are different.
- Dropped frames or choppy audio: lower bitrate and check the console-PC link;
  a fast internet plan does not measure LAN packet loss.
- Stale UI: hard refresh the browser after updating. Keep your saved registration;
  there is no need to re-pair just to change quality.

## Publishing and privacy

The repository contains source, locked Rust dependencies, build/launch scripts,
tests, CI and this documentation. Build outputs, `.tools`, downloaded SDKs,
private `.env`, account databases and console keys are excluded. GitHub Pages
cannot host the native relay or run Remote Play directly; run the server on a
machine that can reach the console. Preserve the upstream AGPL license and
attribution when distributing modified builds. See [COPYING](../COPYING).
