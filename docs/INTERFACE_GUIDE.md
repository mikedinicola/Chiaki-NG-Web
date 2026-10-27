# Your play space

Version 1.11 introduces a new interface inspired by contemporary Apple materials:
quiet navigation, rounded controls, grouped settings and a clearer visual hierarchy.
It is a browser interface, not an Apple product or native iOS application.

## Find your way

The library has **Add a console** and **Appearance** actions. Settings
use a sidebar on desktop and a horizontally scrollable category strip on phones.
**Search settings** finds matching controls and takes you straight to them. Press
`/` while in Settings to focus search, or Escape to clear it.

| Category | What you can change |
| --- | --- |
| General | Language, disconnect/suspend actions, audio/video enablement |
| Appearance | Theme, accent, surfaces, motion, contrast, spacing, text size, privacy, statistics |
| Display | Hardware-decoder preference, window fit, double-click fullscreen |
| Picture quality | Source/high-quality/fog presets, codec, resolution, bitrate, image filters, Lossless Scaling |
| Audio | App volume, mute and audio buffering |
| Consoles | Saved console visibility and account identifiers |
| Keyboard & mouse | PC preset, bindings, mouse response and shortcuts |
| Controllers | Connected-controller status, stick dead zone, virtual-pad layout and skin |
| Play with friends | Parsec setup, controller selection and advanced self-hosting |
| App updates | Automatic-check preference and verified Windows updates |
| Connection | Advanced proxy and default PSN-account settings |

## Appearance that feels right

- **Light / Dark / System:** System follows your device, including changes while
  the page is open. The offline first-run guide follows the same theme.
- **Accent:** blue, violet, mint, rose or amber.
- **Surface style:** translucent navigation or solid surfaces to reduce transparency.
  Content cards stay solid for legibility. Streaming controls do not blur gameplay.
- **Motion:** follow the device's reduced-motion preference, or reduce it explicitly.
- **Contrast:** increase border/text contrast when needed.
- **Spacing:** comfortable or compact setting rows.
- **Text size:** scale interface text between 90% and 120%.
- **Hide account identifiers:** enabled initially. Use **Show** beside an account
  field to reveal it temporarily. Reloading or changing appearance conceals it again.
  This is display masking, not encryption of the browser's local storage.
- **Compact stream statistics:** show received video bitrate and decoded frame
  rate over the stream. The backtick sidebar still has detailed statistics.

**Reset appearance preferences** resets these visual/privacy/overlay choices.
It preserves app volume, mute, controller dead zone, pairings, network settings
and custom key bindings.

## Sound and controllers

**Game volume** changes this app's Web Audio gain, not Windows volume. **Mute game
audio** is separate and remains saved. These controls also affect audio sent to
approved online guests, since it comes from the same game-audio path.

**Controller stick dead zone** is a 0–30% threshold for a physical controller;
15% preserves the previous default. Lower it for small movements, or raise it
to suppress stick drift. Mouse dead-zone compensation remains a separate setting
under Keyboard & mouse. This setting does not remove a game's own dead zone.

Preferences are saved in the current browser/origin. A different browser profile
can have different preferences. The interface does not export or upload these
new UI preferences to the online invitation server.

## During a game

The floating toolbar retains Stop, Controls, Online play, Share, Virtual pad,
Fullscreen and Settings. The backtick key toggles the rounded controls sidebar;
F8 releases/captures the mouse. Small screens use compact controls. The game
picture remains black-backed and is not tinted by the selected interface theme.

No new frame interpolation, image buffering or video filters are added by this
redesign. Translucency is limited to navigation; stream controls use solid
surfaces. Browser/OS rendering and GPU load still determine actual performance.

## Laptop trackpads

Under **Keyboard & mouse**, enable **Trackpad mode (Mac)** for camera control
with pointer acceleration, adjustable boost and optional momentum. Release and
recapture the cursor with F8 twice after changing this mode. Start with the
3× boost and 250 ms momentum; choose 0 ms to stop movement promptly after input.
A browser cannot detect a resting finger, so touching the trackpad alone does
not cancel momentum. Use a small opposite swipe, lower momentum, or disable it.
The trackpad option is off initially and ordinary mouse controls keep their
existing behavior. Game-specific turn-speed limits still apply.

## Invite a friend

Online play has three steps: connect your console, load the server's private
setup code, then create and copy a guest invitation. Setup stays in tab memory
so repeat invites need no retyping. The code is a host credential; send only the
generated invitation link to friends. Picture quality and expiry are under
Invite options. Approve each arriving friend as Watch only or Let play; Stop
sharing revokes the invitation and disconnects everyone.

For first-time self-hosting, the [online setup guide](ONLINE_PLAY.md#first-time-setup)
uses `sudo bash start.sh` to create/start the service and print a setup code after
HTTPS is ready. A public Linux server and domain are still required once.

## Parsec is the easy sharing option

Open **Play with friends** for the host checklist and Get/Open Parsec buttons.
The Windows local helper opens only Parsec's fixed vendor executable, after an
explicit button click. It cannot sign in, generate Parsec links, approve guests,
or disconnect Parsec sessions. Use Parsec for those actions. The controller
selector can explicitly route the friend's virtual pad instead of a local pad;
a missing selected device produces no controller input rather than selecting
another pad. See the [Parsec guide](PARSEC_GUIDE.md). The previous browser-invite
feature is under **Advanced: self-hosted browser invitations**.
