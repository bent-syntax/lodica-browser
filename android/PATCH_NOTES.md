# Patch notes

## 1.7.3
- New logo everywhere: launcher icon, in-app logo, start page, widget and the desktop window and taskbar icon. The logo follows your theme: the body takes the theme's text colour and the middle bar takes the accent colour, and it updates when you change theme.
- Search: the start page and address bar no longer fall back to DuckDuckGo when Lodica Search is your engine and Google is the fallback.
- Chat: notifications for new chat messages now arrive on Android in the background, not only the test notification.
- Mobile: desktop-only sites switch to a mobile-friendly layout automatically.
- Downloads (Android): the Downloads page now lists current downloads with progress and everything you downloaded with the browser, and opens or removes them.
- Widget: the logo changes colour with the app theme.
- Linux: a Flatpak package is built alongside the AppImage.

## 1.7.2
- Settings: reorganised into tabs and sub-tabs on both apps. Mobile now opens on a grouped list of pages and has a back button inside each page; desktop opens on Search. The find box still works.
- Chat: new messages now raise a notification (a message that mentions you no longer gets filtered out of it).
- Own domains: the address bar shows the name you typed, not the address it redirects to.
- Search on Lodica from the start page now uses Lodica when it is your default engine; Google (or your fallback) is used only when the server cannot be reached.
- App icon: the kite follows the theme colours (all ten built-in themes), not only the dark or light background.
- Android patch notes for 1.7.1 are now included in the app.

## 1.7.1
- Fix crash when opening settings (and anything that opens them, such as chat): the settings find index read the tab list before it was created.

## 1.7.0
- Settings: reorganised so identical settings sit in the same section on Android and desktop, plus a find box.
- Redirect domain display now shows only the originating domain.
- Device enrollment shows a confirmation in the browser once the device is approved.
- AI answers: a "Generate an AI answer" button appears where the answer would be, unless "Always generate AI answers" is on (off by default).
- Lodica Search is used by default when a server is linked; new fallback search engine setting for when it is unavailable. The relay favours recent results.
- Authenticator (Android): import a Google Authenticator export from a screenshot of its QR code.
- Chat notifications: fixed missing notifications for the shared name, added a test button, chat service starts on resume.
- Tab previews on the tabs page work again (texture view backend).
- Launcher icon follows the light and dark theme.

## 1.6.5
- Device gate: the relay can require a per-device token (`X-Lodica-Gate` header, no cookie) for gated hosts. Enroll in the app, then approve the shown code on the server with `sudo lodica-approve <code>`. The relay token is shared, so the pairing code (8 characters, valid 10 minutes, single use) is the real secret.
- Server chat: direct messages no longer leak into other chats, file upload, instant notifications (optional foreground service).
- Redirect domain display (Settings, off by default): shows the originating domain with a marker for the real host; lock and security stay on the real site.
- Authenticator: import a Google Authenticator export (`otpauth-migration://` link, pasted or opened from a camera app), preview and confirm.
- App name and identity set for notifications and the taskbar.
- Logo and start page follow the theme; short kite intro on startup (honors reduced motion).
- Android: address bar fix, NDEFReader stub (GeckoView has no Web NFC; pages get NotSupportedError), chat notification permissions (POST_NOTIFICATIONS, battery exemption prompt, "Instant chat messages" toggle).

## 1.6.4
- Server chat: "+" shows a list of available users to pick for a private chat (devices that used chat or opened it recently). Needs the relay redeployed.
- Notifications on mobile now ask for permission at first start (without it chat and update notifications never showed). Chat notifications check about every 15 minutes.
- DNS rules also work natively when the helper extension fails to redirect.
- Menu: only your pinned quick settings show. "More" shows everything; tap or long-press an item to pin or unpin it.

## 1.6.3
- Fix the chat crash on Android 16 (message time was formatted with a null context while drawing).

## 1.6.2
- Search from the start page and the search widget uses the search engine chosen in Settings, not always DuckDuckGo.
- Settings, DNS: entries like `go.ogle` to `Google.com` are accepted. Add a rule in a sheet with a domain field and a redirect field; any number of rules can be added and removed.
- The start page has quick sites like the desktop. Long-press a tile to remove it.
- Sending a chat message no longer crashes the app (network and list-scroll failures are caught).
- Notifications for a new browser version and for new chat messages. They are checked about every 15 minutes in the background, and a tap opens Settings or the chat.
- Private chats with one device and group chats. In Server chat use "+" to open a private chat by device name or a group by group name. Chats others start with your device name appear by themselves.
- Three home-screen widgets: search bar, shortcuts (new tab, chat, inbox, settings) and quick sites.

## 1.6.1
- Android: fixes the Settings screen of 1.6.0, where the rows of a tab were drawn on top of each other.
- Desktop: new look. Settings has an icon sidebar and rows grouped in rounded cards, toggles and chips animate, theme tiles no longer show an oval selection ring, dialogs and sheets have softer corners and shadows, the tab switcher cards lift on hover, and the Server chat menu entry has its own icon.

## 1.6.0
- Android: Appearance page redone like the desktop one. Round theme swatches, a live mini-browser preview that follows the theme, round buttons for the start page background (none, gradient, colour, image) and a preview of the background with its dim and blur.
- Typing in the Lodica Search box now uses the search engine chosen in Settings. Lodica Search is only used when it is the chosen engine (Android and desktop).
- Android: settings redone. Every row has an icon, sections are quieter, and the tabs fade into each other. Items that appeared under two tabs are now in one place: search suggestions sit with Search, AI chats with AI, server chat with Mail, and the "Tabs on PC" header is now "Sync".
- Android: the flat look replaces the purple-pink gradients on the start page wordmark and the page-load bar.
- Android: tapping the address bar no longer shows the open-tabs strip above it.
- Lodica Search keeps its results, the AI answer and your scroll position when you go back from a page, instead of searching again (Android and desktop). Results appear before the theme and AI state arrive.
- Android: if you skipped server setup, Settings now offers it at the top of General and under VPS, and choosing Lodica Search without a server starts the setup.
- Includes everything from 1.5.2 (authenticator, server chat, offline-server fallback, sign-in tracking-protection pause).
- Not tested on a real device.

## 1.5.2
- Android: built-in authenticator (Settings > Identity & mail). Add a 2FA secret or otpauth:// link; the current code is filled into verification-code fields on that site and can be copied.
- Android: server chat, one shared room for everyone linked to the same server (needs the updated relay). Messages are not end-to-end encrypted and are kept 24 hours.
- Android: when the server is offline, VPS routing is skipped and Lodica Search falls back to Google until it answers again.
- Android: sign-in pages (login, signin, sso, auth, oauth) load without tracking protection so their scripts keep working.
- Android: a login field you empty by hand is no longer refilled with the saved value.
- Android: the address bar has a button that moves the cursor to the end of a long URL.
- Android: the tab switcher skips blank page captures and no longer hangs if a capture never answers.
- Typing a link into the in-page search bar opens it directly instead of searching (Android and desktop).
- Not tested on a real device.

## 1.5.1
- Android: "Own domain names" is more forgiving. It accepts "name target", "name=target", "name, target", "name -> target", hosts-file order ("192.168.1.10 nas.home") and "# comments". Before, any line that did not match exactly two space-separated words was dropped without a message.
- Android: saving a custom DNS server now also re-applies DNS over HTTPS mode in the running browser.
- Desktop has no own-DNS feature, so nothing changed there. Only the version number moved to stay in step.
- Not tested on a real device. I could not reproduce the original failure, so this fixes the likely causes.

## 1.5.0
Desktop and Android now share the same version number.
- Desktop: the start page background no longer shows only half. The header is transparent on the home page.
- Desktop: add a start page shortcut straight from the page, no edit mode needed. Hover a shortcut to remove it.
- Desktop: "Hide automatic shortcuts" moved into Settings > Start page shortcuts.
- Desktop: picking an image or gradient background shows a preview before you apply it. Images you used before are kept in a gallery, and you can remove them from it.
- Desktop: vertical tabs show only the site icon by default. Drag the divider wider to see full tab titles, narrower to go back to icons.
- Android: you choose what each gesture does (edge swipes, four-finger swipes, address bar swipes) in Settings > Controls, with a reset button.
- Desktop keybinds were already editable in Settings > Keybinds & controls.
- Not tested on a real device. The Windows build is untested.

## 1.4.2 (Android)

- New: custom DNS. In Settings, Custom DNS, map your own names (for example `.home` or `*.lab.me`) to a host, IP or URL. They work only inside Lodica and load directly, not through the VPS. You can also set your own DNS over HTTPS server.
- Changed: server setup is copy and paste only. Assuming wildcard DNS (`*.yourdomain`) already points to the server, you copy one command, run it on the server and paste the token. The DNS and port steps are gone and the installer only warns about DNS.
- Changed: no domain is built in any more. Nothing is preset until you link your server.
- Fixed: a generated or suggested password is no longer filled into password fields. Only saved logins are filled, and the dummy-mail sign-up flow fills a password only when you use it.

## 1.4.1 (Android)

- Fixed: the app crashing on launch or when the screen was rotated, caused by a second browser engine being created after a failed start. A failing optional startup step (ad blocker, helper, extensions) is now logged and skipped instead of taking the app down.

## 1.4.0 (Android)

New: first-run setup screen. Choose to use Lodica without a server, or with your own: it shows the exact install command, DNS records, ports and token steps, filled in with your domain, then tests and links the app. Re-run it from Settings, Identity & mail.
Change: the server domain is no longer fixed to example.com. The helper extension and settings follow the domain you enter.
Fix: the crash report now also records the error text for crashes after the engine starts.

## 1.3.3 (Android)

New: after a crash, the next launch shows a crash report with a Copy button, so the cause can be found. Tap Continue to open the browser as usual.

## 1.3.2 (Android)

New: patch notes are now inside the app. Open Settings, then About, then "What's new".

## 1.3.1 (Android)
- Fix: the app closed right after opening on 1.3.0. Easy view is removed again until the cause is found. Everything else is the same as 1.2.0.

## 1.3.0 (Android)
- Easy view for desktop-only sites. On a touch screen, pages that have no mobile layout show a small "Easy view" button in the bottom-right corner. Tap it to fit the page to your screen, make text readable, stop sideways scrolling and make buttons easier to tap. Tap "Original view" to undo. Your choice is remembered per site.
- Not tested on a real device yet.
- Still to come: Chromium/Firefox engine switch.

## 1.2.0
- Extensions. Settings > General > Extensions.
  - Desktop: paste a Chrome Web Store link or extension ID to install it. Electron supports only part of the Chrome extension API, so some extensions will not work fully.
  - Android: search Firefox Add-ons and install with one tap. You see the permissions first.
  - Turn extensions on or off, or remove them, in the same place.
- Not tested on a real device yet. Firefox add-ons cannot run on desktop, and the Chrome Web Store cannot be used on Android.
- Still to come: Chromium/Firefox engine switch, built-in PDF editor, desktop-site mobile mode.

## 1.1.0
- Search home page: add your own quick-access sites, remove any tile, and turn off the automatic "most visited" tiles.
- Search page now uses your browser theme.
- Search box has a clear (X) button.
- Make your own theme (four colours) with a live preview. It syncs to your other devices.
- "Use dummy mail" appears only on sign-up pages. You can hide it for a specific site.
- The two dark-mode settings are now one ("Dark pages").
- Search works without a server (falls back to DuckDuckGo).
- Android: the home-screen search widget follows your theme and has its own hint text and shape.
- Not done yet: Chromium/Firefox engine switch, extension store, built-in PDF editor, desktop-site mobile mode.
