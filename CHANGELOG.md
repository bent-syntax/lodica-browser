# Changelog

See `android/PATCH_NOTES.md` and `desktop/PATCH_NOTES.md` for older releases.

## 1.7.2 (versionCode 31)
- Settings reorganised into tabs and sub-tabs on Android and desktop; the find box still works.
- Chat messages raise a notification again.
- Own-domain redirects show the typed domain in the address bar.
- Search on Lodica uses Lodica when it is the default engine.
- Android launcher icon kite follows the theme colours.
- Desktop: taskbar icon follows the theme again, authenticator (PIN-gated, QR screenshot import), and a What's new page.

## 1.7.1 (versionCode 30)
- Fix crash when opening settings (and anything that opens them, such as chat): the settings find index read the tab list before it was created.

## 1.7.0 (versionCode 29)
- Settings: reorganised so identical settings sit in the same section on Android and desktop, plus a find box.
- Redirect domain display now shows only the originating domain.
- Device enrollment shows a confirmation in the browser once the device is approved.
- AI answers: a "Generate an AI answer" button appears where the answer would be, unless "Always generate AI answers" is on (off by default).
- Lodica Search is used by default when a server is linked; new fallback search engine setting for when it is unavailable. The relay favours recent results.
- Authenticator (Android): import a Google Authenticator export from a screenshot of its QR code.
- Chat notifications: fixed missing notifications for the shared name, added a test button, chat service starts on resume.
- Tab previews on the tabs page work again (texture view backend).
- Launcher icon follows the light and dark theme.
- Desktop: .docx files open in the PDF viewer (converted to PDF first); .svg, .docx and .pdf can be opened from the OS (file associations).

## 1.6.5 (versionCode 28)
- Device gate: the relay can require a per-device token (`X-Lodica-Gate` header, no cookie) for gated hosts. Enroll in the app, then approve the shown code on the server with `sudo lodica-approve <code>`. The relay token is shared, so the pairing code (8 characters, valid 10 minutes, single use) is the real secret.
- Server chat: direct messages no longer leak into other chats, file upload, instant notifications (optional foreground service).
- Redirect domain display (Settings, off by default): shows the originating domain with a marker for the real host; lock and security stay on the real site.
- Authenticator: import a Google Authenticator export (`otpauth-migration://` link, pasted or opened from a camera app), preview and confirm.
- App name and identity set for notifications and the taskbar.
- Logo and start page follow the theme; short kite intro on startup (honors reduced motion).
- Android: address bar fix, NDEFReader stub (GeckoView has no Web NFC; pages get NotSupportedError), chat notification permissions (POST_NOTIFICATIONS, battery exemption prompt, "Instant chat messages" toggle).
