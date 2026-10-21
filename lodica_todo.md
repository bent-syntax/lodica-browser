# Lodica todo

Trigger: "Run Keep bug fixes". Read Pending, implement, move finished items to Done with commit hash, then release (changelog, patch notes, version bump, compile and tests, commit, tag, `git push origin main --tags`), then publish a GitHub Release.

Release assets: Android APK from `cd android && ./gradlew assembleRelease` (needs `LODICA_KEYSTORE_PASS`; use `assembleDebug` if unsigned), desktop installers from `cd desktop && npm run dist:linux` (or `npm run dist` for Windows). Publish with `gh release create vX.Y.Z <assets> --title "vX.Y.Z" --notes-file <section of PATCH_NOTES.md>`. Needs `gh auth login` or `GH_TOKEN`. If a build or `gh` step is unavailable, report it and skip.

## Handoff state (as of 2026-10-20)

- v1.11.0 is tagged and pushed, and published as a GitHub Release with the Windows setup and portable exes, the Linux AppImage and deb, and a debug-signed Android APK. The Android asset is a debug build, not a release build.
- The signed release APK for 1.11.0 is not built. Building it needs `LODICA_KEYSTORE_PASS`, the password for `android/keystore/lodica.jks` (alias `lodica`, created 2026-10-18). The password is not stored anywhere in the repo or in this server's environment, and the user does not remember it. Do not search for it or read credential files. Ask the user to find it (password manager, notes) or to export it. If it is lost, the only option is a new keystore, which means installs signed with the old key cannot be updated in place. That is the user's decision.
- `android/app/build/outputs/apk/release/app-release.apk` (dated 2026-10-20 15:24) is an older signed build. It has not been verified as 1.11.0 and has not been uploaded.
- `.github/workflows/release.yml` is committed locally (a834c1f) but not pushed. The push token in `/etc/lodica-push/github.env` lacks the `workflow` scope. Fix by adding the scope (or "Workflows: read and write") and regenerating `/home/bent/.git-credentials`, or by adding the file through the GitHub web UI. The workflow needs the repo secrets `LODICA_KEYSTORE` (base64 of the jks), `LODICA_KEYSTORE_PASS`, and optionally `LODICA_RELAY_TOKEN`, `LODICA_API`, `LODICA_DOMAIN`.
- `gh` is logged in as `bent-syntax` on this server. The user ran the login as root from the token file, because the auto-mode classifier blocks reading `/etc/lodica-push/github.env`.
- Server build limits: 7.9 GB RAM and no swap, so the full Windows build (`npm run dist`) is OOM-killed. Build `electron-builder --win nsis --x64` and `--win portable --x64` separately, in the background, with `NODE_OPTIONS=--max-old-space-size=1024` and `nice`. Android: `cd android && ANDROID_HOME=/home/bent/android-sdk ./gradlew --offline --no-daemon -q -Dorg.gradle.jvmargs=-Xmx1536m <task>`, in the background.
- `npm test` cannot run on this server (no Electron binary). The user runs it locally.

## Pending
- [ ] Idle unload may kill background media tabs
- [ ] Desktop docx editor is lossy for tables and images; legacy .doc unsupported
- [ ] Desktop has no equivalent of the bar auto-hide and web app install

## Done

### 1.11.8 (versionCode 64)
- [x] Web scroll jank (1.11.7, SurfaceView default)
- [x] Settings search, dropdown anchors, scroll position, history Just now, private badge, start page shortcuts, spell text

### 1.11.0 (versionCode 48)
- [x] Search bar autocorrect toggle
- [x] Tab idle unload (4ad4873)
- [x] Tab preview disk cache (fdb7db2)
- [x] Bare IP entries use http://
- [x] Android address bar auto-hide (bfdeaa7)
- [x] Web app install chip and fullscreen (23b56cd)
- [x] Selection equation solver (b7ddfc2)
- [x] Desktop .docx editor (76b0a37)
- [x] Version bump, changelog, patch notes (f4ce870)
