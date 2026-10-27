# Windows installer and portable edition

The browser edition has its own native Windows launcher. It bundles Node, the
Rust relay and the compiled WebAssembly core, and opens your default browser.
It does not use Electron or its embedded runtime.

## Install

1. Download `Chiaki-NG-Web-Setup-1.11.0-x64.exe` from the
   [browser release](https://github.com/SKIZZOO/Chiaki-NG-Web/releases/tag/browser-v1.11.0).
2. Run it and follow the setup wizard. It installs for your Windows account;
   administrator access is not required. The desktop shortcut is optional.
3. Open **Chiaki-NG Web** from Start. The first-run guide appears for a new
   browser profile. Choose **Add a PlayStation** when ready to pair.
4. Keep the app's tray icon running while playing. Its menu can open Chiaki,
   open the offline guide, open the local data folder, or stop the server.

No Git, Rust, Python, Emscripten or separate Node installation is needed for this
package. Windows 10/11 x64 and the included .NET Framework launcher are supported.
The community preview is **unsigned**. Checksums are published alongside the
downloads; no certificate or security-protection bypass is installed.

Close any development server already using port **8090** before switching to
the installed app. If a current Chiaki server with the app identity header is
already running, the launcher reuses it without taking ownership or stopping it.
An unrelated process on that port produces a clear startup message.

## Portable ZIP

Extract the entire ZIP to a folder, then double-click **Chiaki-NG Web.exe**.
Keep all extracted files together. It uses the same browser origin and local
data folder as the installer. Do not run two copies for the same console.

## Your data

- The UI opens at `http://127.0.0.1:8090/` and the server binds only to loopback.
- Settings and local console registrations use that browser profile/origin.
  Using a different browser profile can require pairing again.
- Server/account data and logs live under `%LocalAppData%\ChiakiNGWebBrowser`.
- The install folder contains public program files only. No developer `.env`,
  database, console key, account ID, screenshot or local configuration is bundled.
- Uninstall removes program files and shortcuts. It preserves local data and
  the browser's storage so an upgrade does not erase pairings.
- Quitting the launcher stops only the server it started. The Node input pipe
  also closes when the launcher exits unexpectedly; the Rust relay follows it.

## First-time guide

The **?** button inside the app reopens the offline guide. The Start menu has a
**First-time setup guide** shortcut too. It explains pairing, every PC-preset key,
controller/touch input, mouse capture, all settings tabs, picture presets,
Lossless Scaling and connection troubleshooting. The guide is served locally
and requires no external documentation service.

Only one Remote Play stream should use a console at a time. Connection failures
now stay visible on the home screen with **Try again** and **Dismiss** actions.
Close competing streams before retrying; changing picture settings does not
require deleting and re-pairing the console.

## Build and verify a package (maintainers)

Prerequisites: the source build toolchain, pinned Node, the compiled WASM core,
and the official Inno Setup 7 compiler. `scripts/build-browser-installer.ps1`
builds a static-CRT Rust executable and a .NET Framework x64 tray launcher.

```powershell
.\scripts\build-wasm.ps1
.\scripts\build-browser-installer.ps1 -CompilerPath 'C:\path\to\ISCC.exe'
```

Commit source changes first; production packaging refuses a dirty source tree.
`-AllowDirty` is for local test builds. The build copies tracked public UI files
and an explicit runtime/core/proxy allowlist into a new staging folder. It never
copies the developer's environment or data directories. The output contains the
installer, portable ZIP, SHA-256 checksums, license notices and a source commit
reference. Inno Setup is a maintainer tool and is not required on users' PCs.

`scripts/test-browser-package.ps1` checks the launcher, installs the package into
an isolated workspace test folder, runs the installed smoke test on port 8093,
then uninstalls that test copy and verifies its separate data folder remains.
It does not connect to a PlayStation or use the developer's data.

## Updates inside the app

Install version 1.11.0 once to enable the updater. Open **Settings → App updates**, or right-click the tray icon and choose **Check for updates**. Automatic checks run about 30 seconds after starting the local server and every six hours while it remains open. Turn off the checkbox to disable them; **Check now** still works.

The updater selects the newest numbered `browser-v` release from this repository, including community previews. It ignores native/non-browser releases and older versions. A home-screen notice appears when a newer browser installer is available. Read its release notes, then choose **Download and install** when you have finished playing. This closes active streams and restarts the app. Existing browser settings, registrations and separate user data are preserved.

The installed Windows edition downloads the exact x64 installer from this repository and verifies its size and GitHub SHA-256 digest. The native launcher verifies the saved file again before running setup in the same install folder. A checksum verifies download integrity; the community installer is still unsigned. Updates trust this repository and GitHub's HTTPS release metadata. No GitHub login, account ID, console information or credentials are sent. GitHub receives the normal network request, including your public IP.

Portable and source builds can check and open release downloads, but do not install themselves. A reused development server must be closed before launching the installed edition to enable installation. Update preferences are saved separately from program files. Downloaded installers remain in the local data folder's `updates` directory; they can be removed after setup finishes.

Maintainer checks: `scripts/test-browser-package.ps1` and `scripts/test-browser-updater.ps1`. The latter uses an isolated synthetic local server and harmless compiled installer fixture to verify native checksum/IPC/shutdown/handoff behavior without replacing your running app.
