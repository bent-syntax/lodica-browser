#!/usr/bin/env bash
# Polls Google Tasks for "run fixes" and "add features" every 60 s without systemd or cron (this server has neither for users).
#   setsid nohup bash automation/fixer-loop.sh >/dev/null 2>&1 &     start
#   pkill -f automation/fixer-loop.sh                                 stop
# Runs the fixer from this checkout, so updates to it apply on the next poll. Does not survive a reboot;
# with root, `loginctl enable-linger <user>` plus install-user.sh is the lasting setup.
cd "$(dirname "$0")/.." || exit 1
exec 9>"${HOME}/.local/state/lodica-fixer/loop.lock"
flock -n 9 || { echo "loop already running"; exit 0; }
while true; do
  LODICA_REPO="$PWD" nice -n 10 python3 automation/lodica-fixer.py >/dev/null 2>&1
  sleep 60
done
