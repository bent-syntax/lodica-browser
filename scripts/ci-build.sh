#!/usr/bin/env bash
# Builds the signed Android APK on GitHub Actions and prints its local path (only line on stdout).
#   scripts/ci-build.sh <branch>        run inside the git checkout/worktree that holds the commit to build
# The commit at HEAD is pushed as <branch> (use support/run-<timestamp>) to CI_REPO, where the workflow
# "Support build" (.github/workflows/support-build.yml, triggers on push to support/**) builds and uploads artifact "app-apk".
# Env: CI_REPO (default bent-syntax/lodica-support-ci, private: it holds the signing secrets and keeps unmerged branches out of the public repo),
#      CI_OUT (download dir, default ~/.local/state/lodica-fixer/out), AAPT2 (optional, to check the versionName).
# The GitHub token is read from /etc/lodica-push/github.env inside this script only; it is never printed.
set -euo pipefail
BR="${1:?usage: ci-build.sh <branch, e.g. support/run-20260101-1200>}"
case "$BR" in support/*) ;; *) echo "branch must start with support/ to trigger the workflow" >&2; exit 2 ;; esac
log() { echo "ci-build: $*" >&2; }
CI_REPO="${CI_REPO:-${SUPPORT_CI_REPO:-bent-syntax/lodica-support-ci}}"
OUT="${CI_OUT:-$HOME/.local/state/lodica-fixer/out}/${BR//\//_}"
AAPT2="${AAPT2:-/home/bent/android-sdk/build-tools/36.0.0/aapt2}"
if [ -r /etc/lodica-push/github.env ]; then . /etc/lodica-push/github.env; fi
export GH_TOKEN="${GH_TOKEN:-${GH_PUSH_TOKEN:?no GitHub token available}}" GH_REPO="$CI_REPO"
SHA="$(git rev-parse HEAD)"
EH="Authorization: Basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
git -c http.https://github.com/.extraheader="$EH" push -q -f "https://github.com/$CI_REPO.git" "HEAD:refs/heads/$BR" >&2
log "pushed $BR ($SHA) to $CI_REPO"
RUN=""
for _ in $(seq 1 30); do
  RUN="$(gh run list --workflow "Support build" --branch "$BR" --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
  [ -n "$RUN" ] && break
  sleep 10
done
[ -n "$RUN" ] || { log "no CI run started for $SHA (workflow present in $CI_REPO? Actions enabled?)"; exit 1; }
# poll the run; `gh run watch` needs check-run annotations the token cannot read
CONC=""
for _ in $(seq 1 180); do
  R="$(gh run view "$RUN" --json status,conclusion --jq '.status+" "+.conclusion' 2>/dev/null || true)"
  case "$R" in completed*) CONC="${R#completed }"; break ;; esac
  sleep 20
done
if [ "$CONC" != success ]; then
  log "CI build failed (run $RUN, result '${CONC:-timeout}')"
  gh run view "$RUN" --log-failed 2>&1 | tail -30 >&2 || true
  exit 1
fi
rm -rf "$OUT"; mkdir -p "$OUT/dl"
gh run download "$RUN" -n app-apk -D "$OUT/dl" >&2
APK="$(ls "$OUT"/dl/*.apk 2>/dev/null | head -1)"
[ -n "$APK" ] && [ -s "$APK" ] || { log "artifact app-apk holds no apk"; exit 1; }
cp "$APK" "$OUT/app.apk"; rm -rf "$OUT/dl"
if [ -x "$AAPT2" ] && [ -f android/app/build.gradle.kts ]; then
  WANT="$(grep -o 'versionName = "[^"]*"' android/app/build.gradle.kts | cut -d'"' -f2)"
  GOT="$("$AAPT2" dump badging "$OUT/app.apk" | grep -o "versionName='[^']*'" | cut -d"'" -f2)"
  [ "$WANT" = "$GOT" ] || { log "CI built v$GOT but source is v$WANT"; exit 1; }
fi
echo "$OUT/app.apk"
