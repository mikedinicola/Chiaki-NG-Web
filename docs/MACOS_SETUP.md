# macOS source setup (experimental)

This builds the browser client on your Mac. The Windows installer is not a Mac
installer. The contributor tested Apple Silicon; Intel Mac builds still need
native verification. The follow-up launcher and input fixes have automated
checks, but have not yet been tested on Mac hardware by this maintainer.

1. Install Apple's command line developer tools (`xcode-select --install`),
   [Homebrew](https://brew.sh), and Google Chrome.
2. In Terminal, download the project and its required submodules:

   ```sh
   git clone --recurse-submodules https://github.com/SKIZZOO/Chiaki-NG-Web.git
   cd Chiaki-NG-Web
   ./mac-setup.sh
   ```

   The setup script installs Emscripten, CMake, Ninja, Node and Rust through
   Homebrew, then builds the streaming core and relay. The first build needs
   an internet connection and can take several minutes. Follow any error printed
   in Terminal rather than continuing after a failed build.
3. Double-click **Start Chiaki-NG Web.command** in the project folder, or run
   `./Start\ Chiaki-NG\ Web.command` in Terminal. Leave its Terminal window open
   while playing. The browser opens only once the server is listening, using
   the actual available port. If Google Chrome is unavailable, the launcher
   tries your default browser. Chrome is recommended for this browser client.
4. Enable Remote Play on your PlayStation, keep it on the same network, and
   choose **Add a console**. Follow the pairing instructions. Keep keys and
   account identifiers private.

For a laptop trackpad, open **Settings → Keyboard & mouse → Trackpad mode
(Mac)**. Boost increases camera movement; momentum adds a short glide after
lifting your finger. Set momentum to zero to turn that glide off. Press F8 twice
to release and recapture the cursor after changing trackpad mode. These controls
emulate a stick, so the game's own turn-speed and dead-zone limits apply.

To stop the local server, press Control-C in its Terminal window. For future
source updates, run `git pull` and rerun `./mac-setup.sh` before using the launcher.
