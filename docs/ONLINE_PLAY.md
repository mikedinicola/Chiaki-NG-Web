# Advanced: self-hosted browser invitations

For easier sharing without running a server, use [Parsec](PARSEC_GUIDE.md) from
**Play with friends**. This guide covers the optional advanced browser-invite service.

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
- Chiaki-NG Web **1.14.0 or newer** on the gaming PC. Keep the PS5 and PC on
  your usual home network. No ports need forwarding on the home router.

The VPS is separate from your gaming PC. Do not publish port 8090, the local
database, `/posix-net`, the updater, or the entire Chiaki application through a
tunnel or reverse proxy.

## First-time setup

You need a Linux VPS and a domain once. There is no shared public invitation
service included with the app. This server is separate from your gaming PC.

1. Point your domain's DNS A record to the VPS public IPv4 and install Docker
   Engine with its Compose plugin. Keep the record DNS-only if your provider
   offers an HTTP CDN proxy.
2. Download the **Chiaki-Online-Server-1.14.0.zip** release asset and extract it
   on the VPS. Inside the extracted folder run:

   ```sh
   cd wasm/online/deploy
   sudo bash start.sh
   ```

   On the first run it asks for the domain and VPS public IPv4, generates private
   keys, builds and starts the service, then waits for verified HTTPS. Later runs
   reuse existing keys. It never overwrites your configuration.
3. In your VPS/provider firewall allow the following ports. Keep your SSH rule.
   These are VPS ports, not home-router or PlayStation ports:

   | Port | Protocol | Purpose |
   | --- | --- | --- |
   | 80 | TCP | HTTPS certificate setup/renewal |
   | 443 | TCP | Secure invite page and signaling |
   | 443 | UDP | Optional HTTP/3 |
   | 3478 | TCP and UDP | Authenticated TURN relay |
   | 49160–49200 | UDP | TURN media relay range |

   If setup reports that HTTPS isn't ready, fix DNS/firewall settings and rerun
   `sudo bash start.sh`. Do not publish internal port 3000 or the local gaming app.
4. Copy the **private host setup code** printed after the service is ready. On
   the gaming PC open **Settings → Play with friends → Advanced: self-hosted browser invitations**, paste it and choose **Use setup
   code**. This loads the settings; creating an invite makes the connection.

Already have the server configured? Update its files, then run
`sudo bash connect-code.sh` in `wasm/online/deploy` to print the setup code.
Manual address/key entry remains under **Enter server details manually**.
The setup code contains the host key; base64 encoding does not encrypt it.
Keep it private. Do not put it in a public screenshot or send it to a friend.

## Host a game

1. Start your console stream as usual.
2. Open **Play with friends** from the stream toolbar, then expand **Advanced: self-hosted browser invitations**. Its checklist shows what is ready.
3. Press **Create invite**, then **Copy invite link**, and send that link privately
   to your friend. The default is 720p60 with a 30-minute expiry. Open **Invite
   options** only if you want to change picture quality or expiry.
4. When the friend appears under **Friends**, verify who they are through your
   usual chat, then choose **Watch only** or **Let play**. Display names aren't
   proof of identity. Only one friend controls at a time.
5. Use **Watch only** to take control away, **Remove** to disconnect one friend,
   or **Stop sharing** / **Stop online** to revoke the invite and disconnect all.

The private setup remains in memory for the current tab, so another invite needs
no retyping. Reloading, leaving or closing the page clears it. No host credentials
are stored in localStorage, exported to a share link or given to guests. Use
**Change server** to forget the loaded setup before closing the tab. You cannot
change it while sharing; stop sharing first.

Closing the tab, losing signaling, stopping the console, restarting the broker
or reaching expiry ends access. Guests must be approved each time they join;
a removed guest can request to rejoin while the invite is valid, so stop sharing
to invalidate the whole invite.

Keep the host tab visible. Start with one friend; each viewer needs more upload
bandwidth and encoding work. At 6 Mbps one viewer uses about 2.7 GB of video per
hour before overhead; relayed traffic also uses VPS bandwidth. The service caps
rooms at four guests including pending requests and enforces connection, message,
relay and room limits.

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
