#!/bin/sh
# Copy the Caddy-managed cert for the tunnel host to /etc/lodica-relay/tls (root:lodica-relay 0640).
# Caddy writes its files 0600 caddy:caddy and replaces them on renewal, so ACLs on them would not survive;
# a root copy step (run at service start and every 12h by lodica-relay-certsync.timer) is used instead.
set -eu
HOST=${LODICA_TUNNEL_HOST:?set LODICA_TUNNEL_HOST (install.sh does)}
SRC_ROOT=/var/lib/caddy/.local/share/caddy/certificates
DST=/etc/lodica-relay/tls
crt=$(ls -t "$SRC_ROOT"/*/"$HOST"/"$HOST".crt 2>/dev/null | head -n1 || true)
[ -n "$crt" ] || { echo "certsync: no cert for $HOST yet" >&2; exit 0; }
key="${crt%.crt}.key"
install -d -m 750 -o root -g lodica-relay "$DST"
if ! cmp -s "$crt" "$DST/tunnel.crt" || ! cmp -s "$key" "$DST/tunnel.key"; then
  install -m 640 -o root -g lodica-relay "$key" "$DST/tunnel.key.new"
  install -m 640 -o root -g lodica-relay "$crt" "$DST/tunnel.crt.new"
  mv -f "$DST/tunnel.key.new" "$DST/tunnel.key"
  mv -f "$DST/tunnel.crt.new" "$DST/tunnel.crt"
  echo "certsync: updated"
fi
