# Chiaki-NG Web Edition

**Browser + Electron** port of Chiaki-NG: `chiaki-lib` runs as WebAssembly, POSIX networking (TCP/UDP to the PS4/PS5) goes through a **Node.js proxy**.

Start with the [beginner setup guide](../docs/GETTING_STARTED.md). This fork runs on your PC.

Build: see [`Build_WASM.md`](Build_WASM.md).

---

## Setup

### 1. WASM + Node.js (web client / server)

The browser has no POSIX sockets. The page loads the UI (`wasm/www/`) and the WASM binary.
Node serves the files (**COOP/COEP** headers required for pthreads) and relays `/posix-net` over WebSocket to TCP/UDP.

Local launch: `node wasm/proxy/server.mjs` → http://127.0.0.1:8090/ (or the port from `.env`).

### 2. Electron client (Windows / Linux / macOS)

Same stack (WASM + proxy + UI) in a Chromium window. An `.exe` / AppImage / `.dmg` starts the proxy locally and opens the UI: no browser or server required.

- Sources: `wasm/electron/`
- Output: `wasm/build/`
- Commands: `.\scripts\build-electron.ps1` / `./scripts/build-electron.sh`

The **web server mode is not removed**. Electron does **not** read the server `.env`: it uses a `.env` in the user profile.

### 3. Node proxy — role and ports

The proxy does three things:

1. Serve the UI and `.wasm` with COOP/COEP (`SharedArrayBuffer`).
2. Relay each POSIX packet from WASM to the console (`ws://…/posix-net`).
3. APIs (`/api/…`): accounts, consoles, port check, sharing, etc.

**On the machine that hosts Node** (server or PC):

| Port | Usage |
|---|---|
| `CHIAKI_WASM_PORT` (**8090**) TCP | HTTP(S) + WebSocket UI and posix-net |
| **443** TCP | Your own HTTPS deployment via nginx / reverse-proxy |

Outside `localhost`, WASM pthreads require **HTTPS**.

**Router / firewall / console** (Remote Play, IPv4):

| Port | Proto | Role |
|---|---|---|
| **9295** | TCP | Remote Play session — **tested** before adding a console |
| **9296** / **9297** | UDP | Video / audio stream (open on NAT if you play outside LAN) |
| **987** | UDP | PS4 discovery (LAN) |
| **9302** | UDP | PS5 discovery (LAN) |

Console setup now guides you through choosing a nearby console (or entering its IPv4), finding your PSN account ID, and entering the 8-digit pairing code. The connection test is optional; existing keys are under **Already paired? Import existing keys**. The console is saved after successful pairing or a valid key import. TCP **9295** is still required for a Remote Play session. First-time PIN pairing should use the console's LAN address.

Electron only exposes the proxy on `127.0.0.1` (port **18780** by default): no Internet-facing port to open for the exe itself. The console must still be reachable (LAN or 9295).

---

## Optimizations and additions

### Automatic account lookup and PC controls

In console pairing, a valid PSN username starts an account-ID lookup after a
one-second typing pause. Requests are spaced at least 3.1 seconds apart, obsolete
requests are cancelled, and successful results are cached for five minutes in
the page session. Manual account ID entry cancels automatic requests. PSNTools
remains an external manual fallback because its checker API requires browser
verification/authentication; the existing automatic lookup provider can also be
unavailable. A failed lookup does not block manual pairing.

**Settings → Keys → PC keyboard + mouse controls** temporarily overlays a PC
preset: WASD movement, mouse look, left/right click fire/aim, Space jump, Shift
sprint, Ctrl/C crouch, R reload, E interact, and P for Options/pause. Click the
video to capture input; F8 releases the cursor. **B** opens PS and **N** opens
Share, avoiding browser function-key conflicts. Raw mouse input is requested when
supported. Mouse motion now uses a 16 ms velocity window instead of accumulating
stick deflection, with a 24 ms idle cutoff and radial clamping. **Game dead-zone
compensation** defaults to 12%; match it to the game's right-stick dead zone and
reduce it if slow aiming jumps. Sensitivity remains adjustable. The game still
receives controller inputs, so its stick dead zones, turn limits, and button
layout apply. Disable the preset to recover existing custom bindings.

### Higher stream quality

**Settings → Stream → High quality LAN preset** selects 1080p, 60 fps, H.265,
hardware decoding, 50,000 kbps, and 35% sharpening. The old 15,000 kbps cap is removed;
manual bitrates are bounded to 2,000–100,000 kbps. The default remains 15,000 kbps.
Use Ethernet or strong 5/6 GHz Wi-Fi, and lower the bitrate if the network drops
frames. Settings apply to a new or restarted stream.

The WebGL renderer applies adjustable, local-range-clamped sharpening without
CPU pixel readback. Set sharpening to 0 to disable it; browsers without WebGL
fall back to the original 2D rendering path. Source frames stay at their decoded
resolution: sharpening cannot recover native 1440p/4K detail from 1080p. Avoid
stacking this with sharpening in Lossless Scaling. Renderer checks (orientation,
cropping, color and edge contrast) are in `wasm/tests/video-renderer.html`; serve
that file as `/` and `wasm/www/video-renderer.js` as `/video-renderer.js` locally.

For noisy fog, use **Clean fog / dark scenes**: 80 Mbps H.265, 10% sharpening,
45% edge-aware spatial noise reduction. Sharpening now gates out weak texture
contrast to avoid re-amplifying grain. Denoising stores no earlier frame; high
strengths soften fine detail. Press backtick during a stream for requested vs
received video Mbps, decoded fps, frame size and unrecovered loss. The console's
variable-rate encoder can send less than the requested amount. The received
readout counts encoded video payload, not network overhead or an encoder target.

Run `node scripts/check-renderer.mjs` from the repository root for the GPU and
2D fallback pixel tests. See the [complete setup and tuning guide](../docs/BROWSER_SETUP.md).

### Controls sidebar and external frame generation

During a stream, press backtick (`) to toggle the right-hand controls sidebar.
The keyboard toolbar button opens the same panel. It shows current bindings,
including the PC preset when enabled, and ignores repeated keydown events and
text-field input.

**Settings → Stream → Prepare stream for external Lossless Scaling** keeps new
streams windowed and offers a Steam launch link for the installed Windows app.
In Lossless Scaling, select LSFG Fixed ×2 for a 60 fps base stream on a 120 Hz
display, then activate capture on the browser window with its configured hotkey.
Scaling can stay Off when only frame generation is wanted. Generated frames
require GPU headroom and can introduce latency or artifacts. This is external
capture preparation, not a bundled LSFG engine: the browser cannot start or
verify LSFG, and console stream/input rates remain unchanged.

### `.env` file (server and Electron)

One format to configure Node **without recompiling**. Copy `.env.example` to `.env` at the repo root (for the server):

```env
CHIAKI_AUTH_ENABLED=true
CHIAKI_AUTH_ALLOW_REGISTER=true
CHIAKI_ADMIN_USER=
CHIAKI_ADMIN_EMAIL=
CHIAKI_ADMIN_PASSWORD=
CHIAKI_DB_DIR=./db
CHIAKI_DB_NAME=chiaki.sqlite
CHIAKI_SESSION_DAYS=30
CHIAKI_SESSION_SECRET=change-me
CHIAKI_MAX_HOSTS=32
CHIAKI_WASM_PORT=8090
```

Other useful variables: `CHIAKI_WASM_ROOT`, `CHIAKI_WASM_WWW`, `CHIAKI_WASM_BIND`, `CHIAKI_WASM_LAN_HTTPS`, `CHIAKI_DISCOVERY_ENABLED`, `CHIAKI_ENV_FILE`.

| | Server | Electron |
|---|---|---|
| File | `.env` at the project root (or `cwd`) | `%AppData%/Chiaki-NG Web/.env` (Windows) — **not** the server one |
| Auth | enable in production (`CHIAKI_AUTH_ENABLED=true`) | disabled by default (local use) |
| Port | 8080 / 8090 / 443 | 18780 locally only |

### Authentication

Protects access to registered consoles (SQLite). Sign-in / account creation, cookie sessions, optional admin account on first start. Consoles and settings follow the user across devices.

Disable auth (`CHIAKI_AUTH_ENABLED=false`): local / Electron use with no login page.

### Stream sharing (with auth)

A signed-in host can generate a **viewer link**. Optional rights:

- video
- audio
- physical gamepad
- the virtual pad follows the host stream

Guests receive the stream (WebRTC) without the console’s Remote Play keys.

### Keys and mouse

**Keys** tab: separate **keyboard** and **mouse** remaps (DualShock / DualSense buttons, sticks, triggers, PS, touchpad). Capture on click, reset to defaults, stream shortcuts (stop, restart, cursor / **F8**). Mouse: left or right stick, sensitivity, invert Y, cursor lock on the stream.

### Virtual pad (smartphone)

Touch overlay: short taps sent immediately, layout / size in a full-screen editor, transparency. Built for mobile; shown from the stream toolbar.

### Languages

**French** and **English** UI (General tab). Files in `wasm/www/i18n/`.

### Other

- Stream: WebCodecs H.264/H.265, AudioWorklet, IDR, WASM lazy-load, Android fullscreen, × = exit fullscreen only
- Stream defaults: **1080p**, **60 fps**, **15000 kbps**, H265
- Add console: IPv4, TCP 9295 check, PSN ID via [psntools](https://www.psntools.com/) (Look up button)
- LAN discovery, wake-up, PIN registration

---
