# Changelog

See `android/PATCH_NOTES.md` and `desktop/PATCH_NOTES.md` for older releases.

## 1.7.9 (versionCode 38)
- Android: the 1.7.8 APK was built from a stale cache and still reported 1.7.7 (versionCode 36), so updating looked like it did nothing. 1.7.9 is built with the correct version. Please install 1.7.9 and skip 1.7.8.
- Android: Lodica Search rebuilt. The app now fetches results itself with its own relay token and passes them to the search page, instead of the page needing a token pushed to it. Helper extension version 1.7. Not tested on a phone.

## 1.7.8 (versionCode 37)
- Desktop: chat notifications now use the relay long-poll, one per room, so a new message notifies within about a second instead of up to a minute. Not tested against a live relay.
- Android: Settings shows "Linked to lodica.<domain>" with a reachable state. Search now asks the app for the current config when the helper has no token, before showing "needs a linked server". The root cause of that error after linking is not confirmed on a device. Helper extension version 1.6.

## 1.7.7 (versionCode 36)
- Removed device-gate enrollment; use the website enrollment page instead. Old stored gate tokens and host lists are deleted on upgrade.
- Desktop: taskbar icon update no longer depends on a worker thread and logs failures. Not verified on a Wayland or packaged Windows taskbar.
- "Lodica Search is not available" now says a server must be linked in Settings. Builds carry no relay token; link one in Settings. Helper extension version 1.5.

## 1.7.6 (versionCode 35)
- Android: search page no longer auto-navigates to the fallback engine; it shows an error with a link instead. Helper extension version 1.4. Root cause of the DuckDuckGo flip is not confirmed on a device.
- Desktop: home page uses the new logo mark as the "L" of "Lodica".
- Not device-tested; Flatpak not built.

## 1.7.5 (versionCode 34)
- Desktop: icon is re-applied on show/focus/restore.
- Desktop: taskbar/window icon follows the theme, including system theme changes, on all windows.
- Includes 1.7.4: chat cursor resync after relay restart.

## 1.7.3 (versionCode 32)
- New logo in the launcher icon, in-app, widget and desktop icons; it follows the theme colours.
- Search fallback no longer lands on DuckDuckGo; chat notifications fixed on Android.
- Desktop sites get an automatic mobile layout on Android; Downloads page lists current and finished downloads.
- Flatpak package added.

## 1.7.2 (versionCode 31)
- Settings reorganised into tabs and sub-tabs on Android and desktop; the find box still works.
- Chat messages raise a notification again.
- Own-domain redirects show the typed domain in the address bar.
- Search on Lodica uses Lodica when it is the default engine.
- Android launcher icon kite follows the theme colours.

## 1.7.1 (versionCode 30)
- Fix crash when opening settings (and anything that opens them, such as chat): the settings find index read the tab list before it was created.

## 1.7.0 (versionCode 29)
- Settings: reorganised so identical settings sit in the same section on Android and desktop, plus a find box.
- Redirect domain display now shows only the originating domain.
- AI answers: a "Generate an AI answer" button appears where the answer would be, unless "Always generate AI answers" is on (off by default).
- Lodica Search is used by default when a server is linked; new fallback search engine setting for when it is unavailable. The relay favours recent results.
- Authenticator (Android): import a Google Authenticator export from a screenshot of its QR code.
- Chat notifications: fixed missing notifications for the shared name, added a test button, chat service starts on resume.
- Tab previews on the tabs page work again (texture view backend).
- Launcher icon follows the light and dark theme.
- Desktop: .docx files open in the PDF viewer (converted to PDF first); .svg, .docx and .pdf can be opened from the OS (file associations).

## 1.6.5 (versionCode 28)
- Server chat: direct messages no longer leak into other chats, file upload, instant notifications (optional foreground service).
- Redirect domain display (Settings, off by default): shows the originating domain with a marker for the real host; lock and security stay on the real site.
- Authenticator: import a Google Authenticator export (`otpauth-migration://` link, pasted or opened from a camera app), preview and confirm.
- App name and identity set for notifications and the taskbar.
- Logo and start page follow the theme; short kite intro on startup (honors reduced motion).
- Android: address bar fix, NDEFReader stub (GeckoView has no Web NFC; pages get NotSupportedError), chat notification permissions (POST_NOTIFICATIONS, battery exemption prompt, "Instant chat messages" toggle).
