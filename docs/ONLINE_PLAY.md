# Invite a friend over the internet

Your PlayStation runs the game. Your Windows PC connects to it normally and shares
only the game picture, sound and approved controller input. Your friend opens a
private browser link. They do not install Chiaki, pair with your console, receive
your registration keys, or get access to your desktop.

This feature requires **your own Linux VPS with a public IPv4 address and a DNS
name**. A VPS is a small rented internet server. Its provider may charge for
server time and outgoing traffic. Nothing is rented or exposed automatically by
installing Chiaki. The included setup is for a small private group of friends,
not an anonymous public gaming service.

## What you need once

- A Linux VPS, for example Ubuntu, with administrator access and a public IPv4.
- A domain/subdomain such as `play.example.com`. In your DNS control panel,
  create an **A record** for that name pointing to the VPS public IPv4. Use a
  normal DNS record; HTTP-only CDN proxies cannot carry the TURN UDP traffic.
- Docker Engine and the Docker Compose plugin installed on the VPS using
  [Docker's official Linux installation instructions](https://docs.docker.com/engine/install/).
- Chiaki-NG Web **1.10.4 or newer** on the gaming PC. Keep the PS5 and PC on
  your usual home network. No ports need forwarding on the home router.

The VPS is separate from your gaming PC. Do not publish port 8090, the local
database, `/posix-net`, the updater, or the entire Chiaki application through a
tunnel or reverse proxy.

## Set up the public service

1. Download the **Chiaki-Online-Server-1.10.4.zip** release asset and extract it
   on the VPS. Alternatively clone this repository. The ZIP contains only the
   invitation service, its guest page and the required shared browser helpers.
2. In a terminal inside the extracted folder, run:

   ```sh
   cd wasm/online/deploy
   sudo bash setup.sh
   ```

   Enter your domain and the VPS public IPv4 when asked. The script creates
   fresh private keys and refuses to overwrite an existing setup. Do not run
   setup again for a normal upgrade.
3. In the provider's VPS firewall and the server firewall, allow:

   | Port | Protocol | Purpose |
   | --- | --- | --- |
   | 80 | TCP | HTTPS certificate setup/renewal |
   | 443 | TCP | Secure invite page and signaling |
   | 443 | UDP | Optional HTTP/3 |
   | 3478 | TCP and UDP | Authenticated TURN relay |
   | 49160–49200 | UDP | TURN media relay range |

   Keep your existing SSH/admin rule. These are **VPS** ports, not PS5 or home
   router ports. Do not publish the broker's internal port 3000.
4. Start it:

   ```sh
   sudo docker compose up -d --build
   ```

   Caddy obtains and renews the HTTPS certificate. Check
   `https://play.example.com/health`; it should say `ok`. Opening the main page
   without an invite should say to ask the host for a valid invite.
5. Read the host key privately:

   ```sh
   sudo sed -n 's/^HOST_KEY=//p' .env
   ```

   This key lets you create sessions. Keep it yourself. Never send it to guests,
   put it in screenshots, commit `.env`/`secrets`, or paste it into an issue.

## Host a game

1. Open Chiaki on the PC and start your console stream normally.
2. Press **Online play** in the stream toolbar, or open **Settings → General →
   Host online play**. Paste the HTTPS server address and private host key.
3. Start with **720p60 · 6 Mbps**. Choose how long the invite should last and
   press **Create private invite**. Copy the invite and send it privately.
4. Guests appear as requests. Verify who they are through your usual chat; a
   display name is not proof of identity. Choose **Watch only** or **Let play**.
5. Use **Watch only** to take control away, **Remove** to kick one guest, or
   **Stop and revoke everyone** / **Stop online** to close every peer and revoke
   the invite immediately. Closing the host tab, losing signaling, stopping the
   console stream, restarting the broker or reaching expiry also ends access.

The host key is cleared from the form and is not saved by the app. Paste it
again for a new browser session. Existing guests are not admitted automatically
after a reconnect. A removed guest with the same link can ask again, but needs a
fresh approval. Revoke the whole session to invalidate the link itself.

Keep the host tab visible while playing. Start with one friend; additional
viewers require more upload bandwidth and encoding work. At 6 Mbps, one viewer
uses about 2.7 GB of video data per hour before overhead. A TURN-relayed session
also consumes VPS network traffic. The service caps each room at four guests
including pending requests, and has connection, message, relay and room limits.

## Join as a friend

Open the invite in a recent Chrome/Edge browser, enter a display name and choose
**Ask to join**. Wait for the host's approval. Use **Enable sound** if autoplay
starts muted. A controller works after pressing a button. Keyboard/mouse controls
are listed on the guest page; **Capture mouse** enables aiming and Escape releases
it. No PSN login, account ID, pairing code, webcam or microphone is requested.

Only one guest at a time can play. The guest shares the host's **same controller**;
this does not add player two or enable split-screen by itself. PS, Share, Options
and touchpad buttons remain local. Remote gameplay can still change saves or
perform in-game actions: approve only people you trust. Stop sharing before
opening console account screens or other private content.

## How the connection works and its limits

The browser sends media directly to the guest when possible. Authenticated TURN
relays it when a direct path fails. TURN credentials expire with the room and are
issued only after approval. They can remain usable until their expiry even after
a kick; they never grant access to the revoked WebRTC session. Relay quotas and
private-address exclusions limit abuse. TURN over UDP and TCP 3478 is included;
networks that allow only TLS on port 443 may still block this setup. TURN/TLS on
443 is not configured by this beginner stack.

WebRTC encrypts media and control transport. Your self-hosted broker handles
signaling and can see connection metadata. Approved peers may learn each
other's public IP through ICE. The invite token stays in the URL fragment, is
removed from the displayed guest URL after opening, and is sent only through
the WebSocket join message. Browser history is not a secure vault; keep invites
private. HTTPS is required outside localhost testing.

Sharing decodes and re-encodes video, so it adds latency, GPU work and compression.
The browser may lower the sent resolution or frame rate to maintain connectivity.
It cannot match a direct local PS5 display or guarantee zero lag. Prefer Ethernet
on the host; use 720p first. Input is range-checked, has an approval-specific
control lease and sequence number, and returns to neutral after 250 ms without
valid input. This protects against stale/reordered packets and stuck buttons.

## If it does not connect

- If `/health` fails, check DNS, ports 80/443 and `sudo docker compose logs caddy broker`.
- If the page works but video fails across different networks, check TURN ports,
  the public IPv4 entered during setup, and `sudo docker compose logs turn`.
- A host-authentication error means the host key is wrong or belongs to a
  different server. Never solve it by disabling authentication or TLS checks.
- Keep the host's console stream running; create a new invite after expiry or a
  disconnect. Links do not reconnect automatically after revocation.
- If control stops, check that the host granted **Let play**, the guest page has
  focus, and another guest has not taken the single control slot.
- The VPS setup uses Linux host networking for coturn. It is not intended for
  Docker Desktop on Windows/macOS or a VPS hidden behind provider NAT without
  additional provider-specific relay-address configuration.

## Updates, secrets and security checks

Keep the server OS, Docker and containers patched. For an existing ZIP setup,
copy updated public source files while preserving `wasm/online/deploy/.env`,
`secrets/` and Docker volumes, then run:

```sh
sudo docker compose pull
sudo docker compose up -d --build
```

This disconnects existing sessions. To rotate secrets, stop the service, move the
old `.env` and `secrets/turnserver.conf` to private backup files, run setup again
and restart. To stop the service: `sudo docker compose down`. This does not delete
certificate volumes. Treat provider/server logs as private; they may contain IPs.

The broker exposes an allowlist of static guest assets, `/health` and a bounded
WebSocket signaling endpoint. It has no console transport, local account,
registration, updater, filesystem API or desktop input API. The older local
sharing path was also hardened against unauthenticated host fallback, unauthorized
pad forwarding, unbounded buffers, stale controller state and incomplete
revocation. Loopback app requests also reject foreign Host/Origin values to block DNS rebinding and cross-origin access. Use the new dedicated broker for internet play.

Automated tests cover authentication, approval, room isolation, permissions,
revocation/expiry, stale input and malformed/oversized messages. CI checks the
Docker setup and dependencies. These checks are not an independent security audit
and cannot promise zero vulnerabilities. Before relying on a deployment, test with
a trusted friend on a different network, including a TURN-relayed connection.
