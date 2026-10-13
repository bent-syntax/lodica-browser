#!/bin/sh
# Lodica relay installer for a fresh Debian/Ubuntu server.
#   curl -fsSL https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh | sudo bash -s -- example.com
# Needs: root, and DNS records for lodica.<domain> and tunnel.<domain> pointing at this server,
# with ports 80/443 reachable (Caddy uses them to get the certificates).
# Caddy is installed if missing. Its existing sites are left alone; only missing hostnames are added
# through /etc/caddy/lodica-relay.caddy. The relay itself uses its own ports (API 44741, proxy 44742).
# Safe to run again: it updates the code and keeps your token.
#
# Optional: use a certificate you already have instead of Caddy's:
#   LODICA_TLS_CERT=/path/fullchain.pem LODICA_TLS_KEY=/path/key.pem
set -eu

DOMAIN="${1:-}"
REPO="${LODICA_REPO:-https://github.com/bent-syntax/lodica-browser.git}"
DIR=/opt/lodica-browser
ETC=/etc/lodica-relay
API_PORT="${LODICA_API_PORT:-44741}"
PROXY_PORT="${LODICA_PROXY_PORT:-44742}"

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
apt-get install -y -qq git curl openssl ca-certificates >/dev/null

node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if ! node_ok; then
  say "installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node_ok || die "Node 20+ is required"

say "fetching Lodica relay"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q --ff-only; else git clone -q --depth 1 "$REPO" "$DIR"; fi

id lodica-relay >/dev/null 2>&1 || useradd --system --home /var/lib/lodica-relay --shell /usr/sbin/nologin lodica-relay
install -d -m 750 -o lodica-relay -g lodica-relay /var/lib/lodica-relay
install -d -m 750 -o root -g lodica-relay "$ETC" "$ETC/tls"

if [ ! -s "$ETC/token" ]; then
  say "creating token"
  openssl rand -hex 24 > "$ETC/token"
fi
chown root:lodica-relay "$ETC/token"; chmod 640 "$ETC/token"

cat > "$ETC/relay.env" <<ENV
LODICA_MAIL_DOMAIN=$DOMAIN
LODICA_API_PORT=$API_PORT
LODICA_PROXY_PORT=$PROXY_PORT
LODICA_API_TLS_CERT=$ETC/tls/lodica.crt
LODICA_API_TLS_KEY=$ETC/tls/lodica.key
LODICA_TLS_CERT=$ETC/tls/tunnel.crt
LODICA_TLS_KEY=$ETC/tls/tunnel.key
ENV
chmod 640 "$ETC/relay.env"; chown root:lodica-relay "$ETC/relay.env"

# ---- certificates: Caddy gets and renews them for lodica.<domain> and tunnel.<domain> ----
TLS="$ETC/tls"
put_cert() { # $1=cert $2=key $3=name
  install -m 640 -o root -g lodica-relay "$2" "$TLS/$3.key.new"; install -m 640 -o root -g lodica-relay "$1" "$TLS/$3.crt.new"
  mv -f "$TLS/$3.key.new" "$TLS/$3.key"; mv -f "$TLS/$3.crt.new" "$TLS/$3.crt"
}
if [ -n "${LODICA_TLS_CERT:-}" ] && [ -n "${LODICA_TLS_KEY:-}" ]; then
  say "using the certificate you supplied"
  put_cert "$LODICA_TLS_CERT" "$LODICA_TLS_KEY" lodica
  put_cert "$LODICA_TLS_CERT" "$LODICA_TLS_KEY" tunnel
else
  if ! command -v caddy >/dev/null; then
    say "installing Caddy (it routes the domain and gets the certificates)"
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null </dev/null
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key </dev/null | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
      || die "could not download the Caddy signing key"
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt </dev/null > /etc/apt/sources.list.d/caddy-stable.list \
      || die "could not add the Caddy apt repository"
    apt-get update -qq </dev/null
    apt-get install -y -qq caddy >/dev/null </dev/null || die "could not install Caddy"
  fi
  CADDYFILE=/etc/caddy/Caddyfile
  mkdir -p /etc/caddy; [ -f "$CADDYFILE" ] || touch "$CADDYFILE"

  # Only add hostnames Caddy does not already serve, so existing sites are never touched.
  MISSING=""
  KNOWN=$(caddy adapt --config "$CADDYFILE" --adapter caddyfile 2>/dev/null </dev/null || true)
  for h in "$API_HOST" "$TUN_HOST"; do
    printf '%s' "$KNOWN" | grep -q "\"$h\"" || MISSING="$MISSING${MISSING:+, }$h"
  done
  DROPIN=/etc/caddy/lodica-relay.caddy
  if [ -n "$MISSING" ]; then
    say "adding $MISSING to Caddy"
    printf '# Managed by the Lodica relay installer\n%s {\n\trespond "ok"\n}\n' "$MISSING" > "$DROPIN"
    grep -qF "import $DROPIN" "$CADDYFILE" || {
      cp -a "$CADDYFILE" "$CADDYFILE.bak.lodica-$(date +%s)"
      printf '\nimport %s\n' "$DROPIN" >> "$CADDYFILE"
    }
  else
    say "Caddy already serves $API_HOST and $TUN_HOST"
  fi
  caddy validate --config "$CADDYFILE" --adapter caddyfile </dev/null >/dev/null 2>&1 || die "Caddy rejected the config. Check: caddy validate --config $CADDYFILE"
  systemctl enable caddy >/dev/null 2>&1 || true
  if systemctl is-active --quiet caddy; then timeout 60 systemctl reload caddy </dev/null || timeout 60 systemctl restart caddy </dev/null
  else timeout 60 systemctl start caddy </dev/null; fi
  systemctl is-active --quiet caddy || die "Caddy is not running: journalctl -u caddy"

  cat > /usr/local/sbin/lodica-relay-certsync <<SYNC
#!/bin/sh
# Copies the certificates Caddy manages into $TLS for the relay; restarts the relay when one changed.
changed=0
for pair in "lodica:$API_HOST" "tunnel:$TUN_HOST"; do
  name=\${pair%%:*}; host=\${pair#*:}
  src=\$(find /var/lib/caddy /root/.local/share/caddy -path "*/certificates/*/\$host/\$host.crt" 2>/dev/null | head -n1)
  [ -n "\$src" ] || continue
  key="\${src%.crt}.key"
  [ -s "\$key" ] || continue
  if ! cmp -s "\$src" "$TLS/\$name.crt" || ! cmp -s "\$key" "$TLS/\$name.key"; then
    install -m 640 -o root -g lodica-relay "\$key" "$TLS/\$name.key.new"
    install -m 640 -o root -g lodica-relay "\$src" "$TLS/\$name.crt.new"
    mv -f "$TLS/\$name.key.new" "$TLS/\$name.key"; mv -f "$TLS/\$name.crt.new" "$TLS/\$name.crt"
    changed=1
  fi
done
[ "\$changed" = 1 ] && systemctl try-restart lodica-relay
exit 0
SYNC
  chmod 755 /usr/local/sbin/lodica-relay-certsync
  cat > /etc/systemd/system/lodica-relay-certsync.service <<UNIT
[Unit]
Description=Copy Caddy certificates for the Lodica relay

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/lodica-relay-certsync
UNIT
  cat > /etc/systemd/system/lodica-relay-certsync.timer <<UNIT
[Unit]
Description=Keep the Lodica relay certificates in sync with Caddy

[Timer]
OnBootSec=2min
OnUnitActiveSec=6h

[Install]
WantedBy=timers.target
UNIT

  say "waiting for Caddy to get the certificates (up to 2 minutes)"
  for i in $(seq 1 24); do
    /usr/local/sbin/lodica-relay-certsync
    [ -s "$TLS/lodica.crt" ] && [ -s "$TLS/tunnel.crt" ] && break
    sleep 5
  done
  [ -s "$TLS/lodica.crt" ] && [ -s "$TLS/tunnel.crt" ] || die "Caddy has no certificate for $API_HOST / $TUN_HOST yet. Check that both names point to this server and ports 80/443 are reachable from the internet, then see: journalctl -u caddy"
  systemctl daemon-reload
  systemctl enable --now lodica-relay-certsync.timer >/dev/null 2>&1
fi
[ -s "$TLS/lodica.crt" ] && [ -s "$TLS/tunnel.crt" ] || die "no certificate in $TLS"

cat > /etc/systemd/system/lodica-relay.service <<UNIT
[Unit]
Description=Lodica relay (HTTPS API :$API_PORT, HTTPS forward proxy :$PROXY_PORT)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lodica-relay
Group=lodica-relay
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

for p in "$API_PORT" "$PROXY_PORT"; do
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p\$" && ! systemctl is-active --quiet lodica-relay; then
    die "port $p is already in use by something else. Pick another: LODICA_API_PORT=... LODICA_PROXY_PORT=... (the apps then need the same ports)"
  fi
done

# Only these two ports, and never wait for input: ufw must not be able to hang this script.
if command -v ufw >/dev/null && timeout 15 ufw status </dev/null 2>/dev/null | grep -q "Status: active"; then
  say "opening ports $API_PORT and $PROXY_PORT in ufw"
  timeout 30 ufw allow "$API_PORT/tcp" </dev/null >/dev/null 2>&1 || echo "  could not run ufw; open $API_PORT/tcp and $PROXY_PORT/tcp yourself"
  timeout 30 ufw allow "$PROXY_PORT/tcp" </dev/null >/dev/null 2>&1 || true
fi

systemctl daemon-reload
systemctl enable lodica-relay >/dev/null 2>&1
systemctl restart lodica-relay
sleep 2
systemctl is-active --quiet lodica-relay || die "relay did not start: journalctl -u lodica-relay"

TOKEN=$(cat "$ETC/token")
if curl -fsS -m 10 -H "Authorization: Bearer $TOKEN" "https://$API_HOST:$API_PORT/api/health" >/dev/null 2>&1; then OK="yes"; else OK="not yet (check DNS and the firewall)"; fi

cat <<DONE

Lodica relay is installed.
  API reachable over HTTPS: $OK
  Domain:  $DOMAIN
  Token:   $TOKEN

Paste the token into the Lodica app (Setup, last step). The domain is already filled in.
Keep the token private. It is also stored in $ETC/token.
Ports used: $API_PORT and $PROXY_PORT (TCP). Caddy (80/443) obtains and renews the certificates; its existing sites were not changed.
Cloud firewalls (not ufw) must be opened in your provider's panel for those two ports.
DONE
