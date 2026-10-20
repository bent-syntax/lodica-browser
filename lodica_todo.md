# Lodica todo

Trigger: "Run Keep bug fixes". Read Pending, implement, move finished items to Done with commit hash, then release (changelog, patch notes, version bump, compile and tests, commit, tag, `git push origin main --tags`), then publish a GitHub Release.

Release assets: Android APK from `cd android && ./gradlew assembleRelease` (needs `LODICA_KEYSTORE_PASS`; use `assembleDebug` if unsigned), desktop installers from `cd desktop && npm run dist:linux` (or `npm run dist` for Windows). Publish with `gh release create vX.Y.Z <assets> --title "vX.Y.Z" --notes-file <section of PATCH_NOTES.md>`. Needs `gh auth login` or `GH_TOKEN`. If a build or `gh` step is unavailable, report it and skip.

## Pending
- [ ] Web scroll jank (about 29-33%) unresolved
- [ ] Idle unload may kill background media tabs
- [ ] Desktop docx editor is lossy for tables and images; legacy .doc unsupported
- [ ] Desktop has no equivalent of the bar auto-hide and web app install

## Done

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
