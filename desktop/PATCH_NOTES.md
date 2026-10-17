# Patch notes

## 1.7.2
- Settings: reorganised into tabs and sub-tabs on both apps. Mobile now opens on a grouped list of pages and has a back button inside each page; desktop opens on Search. The find box still works.
- Chat: new messages now raise a notification (a message that mentions you no longer gets filtered out of it).
- Own domains: the address bar shows the name you typed, not the address it redirects to.
- Search on Lodica from the start page now uses Lodica when it is your default engine; Google (or your fallback) is used only when the server cannot be reached.
- App icon: the kite follows the theme colours (all ten built-in themes), not only the dark or light background.
- Windows taskbar icon follows the theme again, including in the installed build.
- Authenticator on desktop: codes behind your PIN, add by setup key or otpauth link, or from a screenshot of a QR code (Google Authenticator exports work too).
- New "What's new" page under Settings, Updates & About.

## 1.7.1
- Fix crash when opening settings (and anything that opens them, such as chat): the settings find index read the tab list before it was created.

## 1.7.0
- Settings: reorganised so identical settings sit in the same section on Android and desktop, plus a find box.
- Redirect domain display now shows only the originating domain.
- Device enrollment shows a confirmation in the browser once the device is approved.
- AI answers: a "Generate an AI answer" button appears where the answer would be, unless "Always generate AI answers" is on (off by default).
- Lodica Search is used by default when a server is linked; new fallback search engine setting for when it is unavailable. The relay favours recent results.
- Authenticator (Android): import a Google Authenticator export from a screenshot of its QR code.
- Desktop: .docx files open in the PDF viewer (converted to PDF first); .svg, .docx and .pdf can be opened from the OS (file associations).

## 1.6.5
- Device gate: the relay can require a per-device token (`X-Lodica-Gate` header, no cookie) for gated hosts. Enroll in the app, then approve the shown code on the server with `sudo lodica-approve <code>`. The relay token is shared, so the pairing code (8 characters, valid 10 minutes, single use) is the real secret.
- Server chat: direct messages no longer leak into other chats, file upload, instant notifications (optional foreground service).
- Redirect domain display (Settings, off by default): shows the originating domain with a marker for the real host; lock and security stay on the real site.
- Authenticator: import a Google Authenticator export (`otpauth-migration://` link, pasted or opened from a camera app), preview and confirm.
- App name and identity set for notifications and the taskbar.
- Logo and start page follow the theme; short kite intro on startup (honors reduced motion).

## 1.6.4
- Server chat: "+" shows a list of available users to pick for a private chat. Needs the relay redeployed.
- Chat notifications check every minute, update notifications every 30 minutes.
- New Settings, Domain redirects: send a name (or *.name) to another address.
- Menu: only pinned quick settings show. "More" shows everything; click or right-click an item to pin or unpin it.

## 1.6.3
- Version bump to match Android 1.6.3 (no desktop changes).

## 1.6.2
- The search box on the home screen uses the search engine chosen in Settings.
- Desktop notifications for a new browser version and for new messages while the chat is closed (checked every 5 minutes).
- Server chat has private chats with one device and group chats. Use "+" in the chat header; right-click a chat tab to remove it. Messages in other chats are kept apart from the shared room.

## 1.6.1
- New look. Settings has an icon sidebar and rows grouped in rounded cards, toggles and chips animate, theme tiles no longer show an oval selection ring, dialogs and sheets have softer corners and shadows, the tab switcher cards lift on hover, and the Server chat menu entry has its own icon.

## 1.6.0
- Typing in the Lodica Search box now uses the search engine chosen in Settings. Lodica Search is only used when it is the chosen engine.
- Lodica Search keeps its results, the AI answer and your scroll position when you go back from a page, instead of searching again. Results appear before the theme and AI state arrive.
- Server chat and the in-page search link handling from 1.5.2 are included.
- The Android-only changes of this release (settings redesign, authenticator, setup entry points) are not in the desktop app.

## 1.5.2
- Server chat: one shared room for everyone linked to the same server (menu > Server chat; needs the updated relay). Messages are not end-to-end encrypted and are kept 24 hours.
- Typing a link into the in-page search bar opens it directly instead of searching.
- The Android-only items of this release (authenticator, sign-in tracking-protection pause, server-offline fallback, address bar, tab switcher) are not in the desktop app yet.

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

## 1.3.0
- Built-in PDF viewer (desktop). PDF links and PDF files open in a clean viewer with no ads. It is pdf.js, the same viewer Firefox uses.
  - Draw, write text, highlight and add signatures with the toolbar buttons, then save the edited copy.
  - Pass a .pdf path on the command line, or click any link to a .pdf, to open it.
  - Only links ending in .pdf are caught. A PDF served from a URL without .pdf still opens in the normal Chromium viewer.
- Android: no change yet. Firefox's own PDF viewer in GeckoView is used. Editing there is not checked on a device.
- Not tested on a real device yet.
- Still to come: Chromium/Firefox engine switch, desktop-site mobile mode.

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
