# Changelog

See `android/PATCH_NOTES.md` and `desktop/PATCH_NOTES.md` for older releases.

## 1.6.5 (versionCode 28)
- Device gate: the relay can require a per-device token (`X-Lodica-Gate` header, no cookie) for gated hosts. Enroll in the app, then approve the shown code on the server with `sudo lodica-approve <code>`. The relay token is shared, so the pairing code (8 characters, valid 10 minutes, single use) is the real secret.
- Server chat: direct messages no longer leak into other chats, file upload, instant notifications (optional foreground service).
- Redirect domain display (Settings, off by default): shows the originating domain with a marker for the real host; lock and security stay on the real site.
- Authenticator: import a Google Authenticator export (`otpauth-migration://` link, pasted or opened from a camera app), preview and confirm.
- App name and identity set for notifications and the taskbar.
- Logo and start page follow the theme; short kite intro on startup (honors reduced motion).
- Android: address bar fix, NDEFReader stub (GeckoView has no Web NFC; pages get NotSupportedError), chat notification permissions (POST_NOTIFICATIONS, battery exemption prompt, "Instant chat messages" toggle).
