#!/bin/sh
# Must pass before publishing a release: desktop tests, AppImage smoke test, APK checksum.
# Usage: scripts/release-gate.sh <version>   (assets in /home/bent/rel, produced by build.sh)
set -e
V=$1; [ -n "$V" ] || { echo "usage: release-gate.sh <version>"; exit 2; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REL=${REL:-/home/bent/rel}
export DISPLAY=${DISPLAY:-:97}
cd "$ROOT/desktop" && ELECTRON_BIN=${ELECTRON_BIN:-/home/bent/electron-rt/electron} npm test
H=$(mktemp -d)
set +e
HOME=$H XDG_CONFIG_HOME=$H/.config timeout 15 "$REL/Lodica-$V.AppImage" --appimage-extract-and-run --no-sandbox >/dev/null 2>&1
rc=$?
set -e
[ "$rc" = 124 ] || { echo "AppImage smoke test failed (exit $rc)"; exit 1; }
(cd "$REL" && sha256sum -c "Lodica-$V.apk.sha256")
echo "release gate passed for $V"
