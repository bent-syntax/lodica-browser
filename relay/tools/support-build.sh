#!/bin/bash
# Build step for the support bridge. Runs in the fix worktree. Exit 0 = ok, APK left at $OUT/app.apk.
# Needs the phone build host (same ssh key as lodica-release.sh). The phone builds the checked-out HEAD
# of the repo it has; adjust PH_BUILD if your phone build host takes the source differently.
set -euo pipefail
OUT=${SUPPORT_OUT:-/home/shared/.support-out/${TICKET_ID:?}}
mkdir -p "$OUT"
(cd relay && for t in test/*.test.js; do node "$t"; done)
for f in desktop/main/*.js desktop/ui/js/*.js; do node --check "$f"; done
PH="ssh -i /home/bent/.ssh/lodica_phone -p 2223 -o IdentitiesOnly=yes -o BatchMode=yes root@127.0.0.1"
$PH build | tail -3
$PH get-apk > "$OUT/app.apk"
[ -s "$OUT/app.apk" ]
