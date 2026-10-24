#!/bin/bash
# Phone test step for the support bridge. Follows /root/NORD_DEBUG.md: only the Lodica app is touched,
# nothing is uninstalled, no root, no reboot. Passes only if the app starts and logs no crash.
set -euo pipefail
OUT=${SUPPORT_OUT:-/home/shared/.support-out/${TICKET_ID:?}}
PKG=be.syntaxya.lodica
nord up
nord clearlogs
nord install "$OUT/app.apk"
nord run $PKG
sleep 8
nord shot "$OUT/start.png"
if nord crash | grep -qi "$PKG"; then nord crash | tail -20; echo "crash on start"; exit 1; fi
nord logs $PKG 200 | grep -E "FATAL|AndroidRuntime" && { echo "fatal in log"; exit 1; } || true
echo "phone test passed (start screenshot: $OUT/start.png)"
