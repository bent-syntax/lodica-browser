#!/usr/bin/env bash
# Installs the "run fixes" / "add features" runner as a systemd --user timer (every 2 minutes).   bash automation/install-user.sh
# It writes the two unit files and reloads systemd. It does NOT enable or start anything:
# the last line tells you the command for that.
#   --dry-run   only list what would be done
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DRY=""; [ "${1:-}" = "--dry-run" ] && DRY=y
UNITS="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
BIN="$HOME/.local/share/lodica-fixer"
STATE="$HOME/.local/state/lodica-fixer"
REPO="${LODICA_REPO:-/home/shared/lodica-browser-public}"
[ -f "$HERE/lodica-fixer.py" ] || { echo "lodica-fixer.py is missing."; exit 1; }

SERVICE="[Unit]
Description=Lodica run-fixes runner

[Service]
Type=oneshot
Environment=LODICA_REPO=$REPO
ExecStart=$(command -v python3) $BIN/lodica-fixer.py
TimeoutStartSec=3h
Nice=10"
TIMER="[Unit]
Description=Lodica run-fixes runner, every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=15s

[Install]
WantedBy=timers.target"

if [ -n "$DRY" ]; then
  echo "Would copy $HERE/lodica-fixer.py to $BIN/"
  echo "Would create $STATE (logs)"
  echo "Would write $UNITS/lodica-fixer.service and $UNITS/lodica-fixer.timer"
  echo "Would run: systemctl --user daemon-reload"
  echo "Would not enable or start anything."
  exit 0
fi
mkdir -p "$BIN" "$STATE" "$UNITS"
install -m 755 "$HERE/lodica-fixer.py" "$BIN/lodica-fixer.py"
printf '%s\n' "$SERVICE" > "$UNITS/lodica-fixer.service"
printf '%s\n' "$TIMER" > "$UNITS/lodica-fixer.timer"
systemctl --user daemon-reload
echo "Installed, not started. Check first:  python3 $BIN/lodica-fixer.py --dry-run"
echo "Then start:  systemctl --user enable --now lodica-fixer.timer"
echo "Logs: $STATE/fixer.log   (user services after logout need: sudo loginctl enable-linger $USER)"
