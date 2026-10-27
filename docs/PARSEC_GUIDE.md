# Play with friends using Parsec

Use **Settings → Play with friends**. This option needs Parsec accounts, but no
VPS, domain or Chiaki host key. Parsec runs separately from the browser client.

1. **Install and sign in.** Choose Get Parsec in the app to open the
   [official download page](https://parsec.app/downloads). On the Windows gaming
   PC, keep Parsec's virtual gamepad driver installed and enable Hosting under
   Settings → Host. Use Open Parsec once installed; portable/custom installs can
   be opened manually. You manage your account entirely inside Parsec.
2. **Start your console stream.** Open your PS5/PS4 in Chiaki as usual.
3. **Invite your friend.** In Parsec's Computers view, choose Share on this PC.
   Send that Parsec link privately. Your friend signs in and requests to join;
   accept in Parsec and allow Gamepad input. The installed Parsec client is
   recommended; a Chrome [web client](https://web.parsec.app/) is also available.
4. **Return to the game.** Your friend presses a controller button; click the
   game browser and keep it focused. If a local controller takes priority,
   select the friend's virtual pad under Controller to use. Device names come
   from the browser and may say Xbox 360 Controller rather than Parsec.

**Stop sharing in Parsec:** disconnect your friend or press Ctrl+F3 on the host.
Closing Chiaki does not close the Parsec desktop session. Parsec controls its
own invitations and permissions; Chiaki cannot report whether a guest is connected.

Parsec shares your PC display. Keep private windows and notifications out of
view, and leave keyboard/mouse permission off unless needed. Approved Apps can
restrict access to a browser application, but cannot isolate one tab within it.
Use Windows for hosting with guest gamepads; Parsec documents controller
limitations for macOS hosts. This shares the existing Remote Play controller;
it does not automatically create a second console player.

If no controller appears, check Parsec's Gamepad permission and virtual-gamepad
driver, press a button, then refocus the browser. If an explicitly selected pad
disconnects, choose another or reconnect it; the app does not silently use a
local controller instead. Selection stays in memory for this page only.

The app's launcher/controller routing has automated checks. A complete session
with a remote Parsec guest still needs live verification on your hardware.
Parsec is not bundled, and this project is not affiliated with Parsec.

Official references: [hosting and permissions](https://support.parsec.app/hc/en-us/articles/32381747079572-Hosting-and-Permissions),
[gamepad setup](https://support.parsec.app/hc/en-us/articles/32381705301908-Setup-Gamepad),
[browser limitations](https://support.parsec.app/hc/en-us/articles/32381650129300-Use-the-Web-App-browser).
