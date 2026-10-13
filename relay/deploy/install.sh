#!/bin/sh
# Lodica relay installer for a fresh Debian/Ubuntu server.
#   curl -fsSL https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh | sudo bash -s -- example.com
# Needs: root, and a wildcard DNS record (*.<domain>) pointing at this server.
# Safe to run again: it updates the code and keeps your token.
set -eu

DOMAIN="${1:-}"
REPO="${LODICA_REPO:-https://github.com/bent-syntax/lodica-browser.git}"
DIR=/opt/lodica-browser
ETC=/etc/lodica-relay

die() { echo "error: $*" >&2; exit 1; }
say() { echo "==> $*"; }

[ "$(id -u)" = 0 ] || die "run as root (use sudo)"
[ -n "$DOMAIN" ] || die "usage: install.sh <your-domain>   e.g. install.sh example.com"
case "$DOMAIN" in *[!a-zA-Z0-9.-]*|.*|*.) die "bad domain: $DOMAIN" ;; esac
command -v apt-get >/dev/null || die "this installer supports Debian/Ubuntu (apt) only"

API_HOST="lodica.$DOMAIN"
TUN_HOST="tunnel.$DOMAIN"
MY_IP=$(curl -fsS4 https://ifconfig.me 2>/dev/null || true)

# Wildcard DNS (*.<domain> to this server) is assumed; only warn if it looks wrong.
for h in "$API_HOST" "$TUN_HOST"; do
  got=$(getent ahostsv4 "$h" 2>/dev/null | awk 'NR==1{print $1}' || true)
  if [ -z "$got" ]; then echo "  warning: $h does not resolve yet"
  elif [ -n "$MY_IP" ] && [ "$got" != "$MY_IP" ]; then echo "  warning: $h -> $got, but this server is $MY_IP"; fi
done

say "installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl acl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if ! node_ok; then
  say "installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node_ok || die "Node 20+ is required"

if ! command -v caddy >/dev/null; then
  say "installing Caddy"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

say "fetching Lodica relay"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q --ff-only; else git clone -q --depth 1 "$REPO" "$DIR"; fi

id lodica-relay >/dev/null 2>&1 || useradd --system --home /var/lib/lodica-relay --shell /usr/sbin/nologin lodica-relay
install -d -m 750 -o lodica-relay -g lodica-relay /var/lib/lodica-relay
install -d -m 750 -o root -g lodica-relay "$ETC"

if [ ! -s "$ETC/token" ]; then
  say "creating token"
  openssl rand -hex 24 > "$ETC/token"
fi
chown root:lodica-relay "$ETC/token"; chmod 640 "$ETC/token"

cat > "$ETC/relay.env" <<ENV
LODICA_MAIL_DOMAIN=$DOMAIN
LODICA_TUNNEL_HOST=$TUN_HOST
ENV
chmod 640 "$ETC/relay.env"; chown root:lodica-relay "$ETC/relay.env"

install -m 755 "$DIR/relay/deploy/certsync.sh" /usr/local/sbin/lodica-relay-certsync

cat > /etc/systemd/system/lodica-relay.service <<UNIT
[Unit]
Description=Lodica relay (HTTPS forward proxy :3443, mail/tabs API 127.0.0.1:3400)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lodica-relay
Group=lodica-relay
ExecStartPre=+/usr/local/sbin/lodica-relay-certsync
ExecStart=/usr/bin/node $DIR/relay/src/main.js
Environment=NODE_ENV=production
EnvironmentFile=$ETC/relay.env
EnvironmentFile=-$ETC/github.env
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/lodica-relay
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
UMask=0077
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/lodica-relay-certsync.service <<UNIT
[Unit]
Description=Copy the tunnel cert for lodica-relay

[Service]
Type=oneshot
EnvironmentFile=$ETC/relay.env
ExecStart=/usr/local/sbin/lodica-relay-certsync
UNIT
install -m 644 "$DIR/relay/deploy/lodica-relay-certsync.timer" /etc/systemd/system/lodica-relay-certsync.timer

say "configuring Caddy"
if [ -s /etc/caddy/Caddyfile ] && ! grep -q "lodica-relay" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-lodica
fi
cat > /etc/caddy/Caddyfile <<CADDY
# lodica-relay
$API_HOST {
	reverse_proxy 127.0.0.1:3400
}
# Only here so Caddy fetches and renews a certificate for the proxy port.
$TUN_HOST {
	respond "ok"
}
CADDY

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  say "opening ports 80, 443, 3443 in ufw"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 3443/tcp >/dev/null
fi

systemctl daemon-reload
systemctl enable --now caddy >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "waiting for the tunnel certificate (up to 2 minutes)"
n=0
until /usr/local/sbin/lodica-relay-certsync 2>/dev/null && [ -s /etc/lodica-relay/tls/tunnel.crt ]; do
  n=$((n + 1)); [ "$n" -le 24 ] || die "no certificate yet. Check ports 80 and 443 are open and DNS is right: journalctl -u caddy"
  sleep 5
done

systemctl enable --now lodica-relay-certsync.timer >/dev/null 2>&1
systemctl enable lodica-relay >/dev/null 2>&1
systemctl restart lodica-relay
sleep 2
systemctl is-active --quiet lodica-relay || die "relay did not start: journalctl -u lodica-relay"

TOKEN=$(cat "$ETC/token")
if curl -fsS -H "Authorization: Bearer $TOKEN" "https://$API_HOST/api/health" >/dev/null 2>&1; then OK="yes"; else OK="not yet (give it a minute)"; fi

cat <<DONE

Lodica relay is installed.
  API reachable over HTTPS: $OK
  Domain:  $DOMAIN
  Token:   $TOKEN

Paste the token into the Lodica app (Setup, last step). The domain is already filled in.
Keep the token private. It is also stored in $ETC/token.
Open ports needed: 80, 443, 3443 (TCP). Cloud firewalls (not ufw) must be opened in your provider's panel.
DONE
