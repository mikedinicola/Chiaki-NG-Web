#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [ "${EUID}" -ne 0 ]; then echo 'Run with sudo bash setup.sh (secret-file ownership must be set).'; exit 1; fi
if [ -e .env ] || [ -e secrets/turnserver.conf ]; then echo 'Setup already exists; refusing to overwrite keys. See the guide for updates/rotation.'; exit 1; fi
command -v openssl >/dev/null || { echo 'Install openssl first.'; exit 1; }
command -v docker >/dev/null || { echo 'Install Docker Engine and the Compose plugin first; see the guide.'; exit 1; }
read -r -p 'Play domain (example: play.example.com): ' domain
read -r -p 'This VPS public IPv4 address: ' public_ip
domain=${domain,,}
if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,250})[a-zA-Z0-9]$ ]] || [[ "$domain" != *.* ]] || [[ "$domain" == *..* ]]; then echo 'Use a valid DNS hostname without https:// or a path.'; exit 1; fi
IFS=. read -r -a octets <<< "$public_ip"
if [ "${#octets[@]}" -ne 4 ]; then echo 'Invalid IPv4.'; exit 1; fi
for octet in "${octets[@]}"; do if [[ ! "$octet" =~ ^[0-9]{1,3}$ ]] || (( 10#$octet > 255 )); then echo 'Invalid IPv4.'; exit 1; fi; done
umask 077
host_key=$(openssl rand -hex 32)
turn_secret=$(openssl rand -hex 32)
printf 'PLAY_DOMAIN=%s\nHOST_KEY=%s\nTURN_SECRET=%s\n' "$domain" "$host_key" "$turn_secret" > .env
mkdir -p secrets
cat > secrets/turnserver.conf <<EOF
listening-port=3478
external-ip=$public_ip
realm=$domain
server-name=$domain
fingerprint
use-auth-secret
static-auth-secret=$turn_secret
no-auth-pings
no-dynamic-ip-list
no-dynamic-realms
no-cli
pidfile=/tmp/turnserver.pid
no-tls
no-dtls
no-tcp-relay
min-port=49160
max-port=49200
user-quota=4
total-quota=64
max-bps=2000000
bps-capacity=16000000
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
simple-log
log-file=stdout
EOF
chown 65534:65534 secrets/turnserver.conf
chmod 400 secrets/turnserver.conf
echo "Configuration created. Ensure DNS points to $public_ip and the VPS firewall allows the guide's ports."
echo 'Start with: sudo docker compose up -d --build'
echo 'Read your private host key with: sudo sed -n "s/^HOST_KEY=//p" .env'
echo 'Never share the host key or TURN secret with guests. Send only the app-generated invite.'
