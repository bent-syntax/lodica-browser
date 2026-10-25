#!/usr/bin/env bash
# Installs the Lodica support desk as a systemd service.   sudo bash support/install.sh
# Asks for the mailbox password once and keeps it in /etc/lodica-support.env (root only).
# Safe to run again: existing settings are kept unless you say otherwise.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash support/install.sh"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN_USER="${SUDO_USER:-}"
# from a root shell: run as the owner of this checkout, so the desk finds their tasks login
[ -n "$RUN_USER" ] && [ "$RUN_USER" != root ] || RUN_USER="$(stat -c %U "$HERE")"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
ENVF=/etc/lodica-support.env
SECRET_FILE=/etc/lodica-relay/desk-secret
say() { printf '\n  \033[1m%s\033[0m\n' "$*"; }
command -v node >/dev/null || { echo "Node.js is needed."; exit 1; }
command -v npm >/dev/null || { echo "npm is needed."; exit 1; }
[ -f "$HERE/env.template" ] || { echo "env.template is missing."; exit 1; }

say "Lodica support desk"
KEEP=""
if [ -f "$ENVF" ]; then
  KEEP=y
  if (: </dev/tty) 2>/dev/null; then read -r -p "  $ENVF exists. Keep it? [Y/n] " KEEP </dev/tty || KEEP=y; fi
  case "$KEEP" in n|N) KEEP="" ;; *) KEEP=y ;; esac
fi

say "Installing files"
mkdir -p /opt/lodica-support /var/lib/lodica-support
cp "$HERE"/app.js "$HERE"/mail.js "$HERE"/tasks.js "$HERE"/server.js "$HERE"/package.json /opt/lodica-support/
(cd /opt/lodica-support && npm install --omit=dev --no-audit --no-fund >/dev/null)
chown -R "$RUN_USER" /var/lib/lodica-support

if [ -z "$KEEP" ]; then
  PASS="${SUPPORT_PASS:-}"
  if [ -z "$PASS" ]; then
    echo "  Mailbox password (an app password for Gmail). Nothing shows while you type."
    read -r -s -p "  Password: " PASS </dev/tty; echo
  fi
  PASS="${PASS// /}"
  [ -n "$PASS" ] || { echo "No password given."; exit 1; }
  NOTIFY="${SUPPORT_NOTIFY_TOKEN:-}"
  if [ -z "$NOTIFY" ]; then
    echo "  Bearer token for http://127.0.0.1:47601/support/incoming (empty = no phone notice)."
    read -r -s -p "  Token: " NOTIFY </dev/tty || true; echo
  fi
  SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  # build the env file from the template; secrets never appear on a command line
  umask 077
  P="$PASS" N="$NOTIFY" S="$SECRET" awk '
    /^SUPPORT_PASS=/ { print "SUPPORT_PASS=" ENVIRON["P"]; next }
    /^SUPPORT_NOTIFY_TOKEN=/ { print "SUPPORT_NOTIFY_TOKEN=" ENVIRON["N"]; next }
    /^SUPPORT_SECRET=/ { print "SUPPORT_SECRET=" ENVIRON["S"]; next }
    { print }' "$HERE/env.template" > "$ENVF"
  chmod 600 "$ENVF"
  # the service runs as the owner of this checkout, so it reads its own env file
  chown "$RUN_USER" "$ENVF"
  if getent group lodica-relay >/dev/null && [ -d /etc/lodica-relay ]; then
    (umask 037; printf '%s\n' "$SECRET" > "$SECRET_FILE")
    chown root:lodica-relay "$SECRET_FILE"; chmod 640 "$SECRET_FILE"
  else
    echo "  /etc/lodica-relay or group lodica-relay is missing: put the SUPPORT_SECRET value in $SECRET_FILE yourself."
  fi
  unset PASS NOTIFY SECRET
fi
# 47610 belongs to hearth-support; older env files still name it
sed -i 's/^SUPPORT_PORT=47610$/SUPPORT_PORT=47611/' "$ENVF"
chown "$RUN_USER" "$ENVF"

# the desk reads the relay admin token (group lodica-relay) to send answers to the apps
if getent group lodica-relay >/dev/null; then usermod -aG lodica-relay "$RUN_USER" || true; fi

say "Systemd units"
cat > /etc/systemd/system/lodica-support.service <<EOF
[Unit]
Description=Lodica support desk
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=/opt/lodica-support
EnvironmentFile=$ENVF
Environment=LODICA_TASKS_CONFIG=$RUN_HOME/.lodica-tasks.json
ExecStart=$(command -v node) /opt/lodica-support/server.js
Restart=always
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
# the relay hands in-app tickets to the desk on this address
if [ -f /etc/systemd/system/lodica-relay.service ]; then
  mkdir -p /etc/systemd/system/lodica-relay.service.d
  printf '[Service]\nEnvironment=LODICA_DESK_URL=http://127.0.0.1:47611\n' > /etc/systemd/system/lodica-relay.service.d/desk.conf
fi
systemctl daemon-reload
systemctl enable --now lodica-support >/dev/null 2>&1 || true
systemctl restart lodica-support
[ -f /etc/systemd/system/lodica-relay.service ] && systemctl restart lodica-relay || true
sleep 2
systemctl is-active lodica-support || { journalctl -u lodica-support -n 15 --no-pager | cut -c1-200; exit 1; }

say "Done"
echo "  Logs:   journalctl -u lodica-support -f"
echo "  Tasks:  the service reads ~/.lodica-tasks.json of $RUN_USER"
echo "  Old Slack bridge: disable it with  systemctl disable --now lodica-support-bridge"
