#!/bin/sh
# Lodica relay installer for a fresh Debian/Ubuntu server.
#   curl -fsSL https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh | sudo bash -s -- example.com
# Needs: root, and DNS records for lodica.<domain> and tunnel.<domain> pointing at this server.
# The relay uses its own ports (API 44741, proxy 44742). It never touches ports 80/443 or any
# existing web server (Caddy, nginx, Apache). Safe to run again: it updates the code, keeps your token.
#
# Certificate (needed because the apps check it). Pick one:
#   LODICA_TLS_CERT=/path/fullchain.pem LODICA_TLS_KEY=/path/key.pem   use a cert you already have (copied)
#   LODICA_ACME_DNS=dns_cf  (plus that provider's variables, e.g. CF_Token=...)   Let's Encrypt via DNS, no ports
#   (nothing)  Let's Encrypt over port 80, only if port 80 is free
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

say "installing packages (nothing on ports 80/443 is touched)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates cron socat >/dev/null

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
ENV
chmod 640 "$ETC/relay.env"; chown root:lodica-relay "$ETC/relay.env"

# ---- certificate for lodica.<domain> and tunnel.<domain> ----
CRT="$ETC/tls/tunnel.crt"; KEY="$ETC/tls/tunnel.key"
put_cert() { # $1=cert $2=key
  install -m 640 -o root -g lodica-relay "$2" "$KEY.new"; install -m 640 -o root -g lodica-relay "$1" "$CRT.new"
  mv -f "$KEY.new" "$KEY"; mv -f "$CRT.new" "$CRT"
}
if [ -n "${LODICA_TLS_CERT:-}" ] && [ -n "${LODICA_TLS_KEY:-}" ]; then
  say "using the certificate you supplied"
  put_cert "$LODICA_TLS_CERT" "$LODICA_TLS_KEY"
elif ! { [ -s "$CRT" ] && openssl x509 -in "$CRT" -noout -checkhost "$API_HOST" 2>/dev/null | grep -q "does match" \
        && openssl x509 -in "$CRT" -noout -checkhost "$TUN_HOST" 2>/dev/null | grep -q "does match" \
        && openssl x509 -in "$CRT" -noout -checkend 604800 >/dev/null 2>&1; }; then
  [ -s "$CRT" ] && say "existing certificate does not cover $API_HOST and $TUN_HOST (or expires soon): getting a new one"
  ACME=/root/.acme.sh/acme.sh
  if [ ! -x "$ACME" ]; then
    say "installing acme.sh (Let's Encrypt client)"
    curl -fsSL https://get.acme.sh | sh -s email="admin@$DOMAIN" >/dev/null 2>&1 </dev/null || die "could not install acme.sh"
  fi
  "$ACME" --set-default-ca --server letsencrypt >/dev/null 2>&1 || true
  RELOAD="systemctl restart lodica-relay"
  if [ "${LODICA_ACME_DNS:-}" = "manual" ]; then
    # No DNS API: run once to get two TXT records, add them, run the same command again.
    if [ -d "/root/.acme.sh/${API_HOST}_ecc" ] || [ -d "/root/.acme.sh/${API_HOST}" ]; then
      say "checking the TXT records"
      "$ACME" --renew --force --ecc -d "$API_HOST" -d "$TUN_HOST" --yes-I-know-dns-manual-mode-enough-go-ahead-please </dev/null || die "TXT records not found yet. Wait a few minutes and run the same command again"
    else
      "$ACME" --issue --keylength ec-256 --dns -d "$API_HOST" -d "$TUN_HOST" --yes-I-know-dns-manual-mode-enough-go-ahead-please </dev/null || true
      die "add the TXT record(s) shown above in your DNS, wait a few minutes, then run the same command again"
    fi
  elif [ -n "${LODICA_ACME_DNS:-}" ]; then
    say "getting a certificate with DNS validation ($LODICA_ACME_DNS)"
    "$ACME" --issue --keylength ec-256 --dns "$LODICA_ACME_DNS" -d "$API_HOST" -d "$TUN_HOST" </dev/null || die "certificate failed. Check the DNS provider variables"
  elif ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]80$'; then
    die "port 80 is in use here, so Let's Encrypt cannot validate over it. Run again with LODICA_ACME_DNS=<acme.sh dns plugin> (see https://github.com/acmesh-official/acme.sh/wiki/dnsapi) plus its variables, or give LODICA_TLS_CERT and LODICA_TLS_KEY."
  else
    say "getting a certificate over port 80 (it is free right now)"
    "$ACME" --issue --keylength ec-256 --standalone -d "$API_HOST" -d "$TUN_HOST" </dev/null || die "certificate failed. Check DNS for $API_HOST and $TUN_HOST and that port 80 is reachable"
  fi
  "$ACME" --install-cert --ecc -d "$API_HOST" --key-file "$KEY" --fullchain-file "$CRT" --reloadcmd "chgrp lodica-relay $KEY $CRT; chmod 640 $KEY $CRT; $RELOAD" </dev/null >/dev/null
  chgrp lodica-relay "$KEY" "$CRT"; chmod 640 "$KEY" "$CRT"
fi
[ -s "$CRT" ] && [ -s "$KEY" ] || die "no certificate in $ETC/tls"

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
Ports used: $API_PORT and $PROXY_PORT (TCP). Nothing on 80/443 was changed.
Cloud firewalls (not ufw) must be opened in your provider's panel for those two ports.
DONE
