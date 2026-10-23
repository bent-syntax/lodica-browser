## 1.12.0-beta.5 (redesign test)

- Link devices with a 6-character code instead of a long link (Settings > Tabs on PC: Show link code / Enter link code), on desktop and Android.
- Share history with linked devices (option, off by default).
- Control the phone from the desktop: open a page, show a phone tab, reload. The phone must allow it (Allow control from desktop, off by default).
- Server emojis button: Android syncs them, desktop lists them and copies one to the clipboard.
- Select "f(x)=3x+14" or "y=x^2" on a page to see its graph.
- Dark pages: dark text on a dark page now flips to a light colour (black becomes white).

## 1.12.0-beta.3 (redesign test)

- Android: turning Dark pages off now forces light pages; sites no longer stay dark by following the phone theme.
- Android: Dark pages keeps accent colours (buttons, badges) at their tint instead of making them near-black.
- Android: installed web apps get a fresh version code each build, so reinstalling after an uninstall no longer fails with "needs a new version".

## 1.12.0-beta.2 (redesign test)

- Android: tab switcher opens scrolled to the current tab.
- Android: add-shortcut is now a circle tile at the end of the shortcut grid.

# Patch notes

## 1.12.0-beta.1 (redesign test)
- Visual redesign: rounder sheets, dialogs, cards, pill URL bar, softer shadows, smoother motion.

## 1.11.12
- Image search viewer has a close button (and Esc) and an "Open image" link.
- Reader shows headings as headings, keeps right-to-left text aligned, drops citation markers, tables and infoboxes, and no longer repeats the title.
- Sign-up forms reuse the hidden-email alias already made for that site.
- Authenticator's auto-fill site box pre-fills the current site.
- Sharing a Lodica Search page copies the same query on a public search engine instead of the local lodica:// address.
- History merges the same page visited with a different fragment, trailing slash or www, and shows "Just now" for entries under a minute old.

## 1.11.11
- No desktop changes (version bump for the Android release).

## 1.11.10
- No desktop changes (version bump for the Android release).

## 1.11.9
- No desktop changes (version bump for the Android release).

## 1.11.8
- No desktop changes (version bump for the Android release).

## 1.11.7
- No desktop changes (version bump for the Android release).

## 1.11.7-beta.3
- No desktop changes (version bump for the Android release).

## 1.11.7-beta.2
- No desktop changes (version bump for the Android release).

## 1.11.7-beta.1
- No desktop changes (version bump for the Android release).

## 1.11.6
- No desktop changes (version bump for the Android release).

## 1.11.5
- No desktop changes (version bump for the Android release).

## 1.11.4
- No desktop changes (version bump for the Android release).

## 1.11.3
- Chat files can be up to 5 GB (was 5 MB). Files are streamed, so large files no longer fill memory.

## 1.11.2
- The private-tab start page shows the incognito mark.
- The start page logo is the "l" of "Lodica".

## 1.11.1
- Fixed: the tab strip on desktop showed no tabs even though they were listed in the tab menu.

## 1.11.0
- Select an equation like 3x - 24 = -6 and the answer shows above it: x = 6. Works for one unknown, linear or quadratic.
- Opening an IP address with no scheme now uses the plain web scheme.
- New switch to turn off autocorrect in the search bar.
- Double-click on the address path selects only path and query, so Backspace leaves the bare domain.
- .docx files open in an editor. Edit text in place and save back as a real .docx. Tables and images are not kept.

## 1.10.0
- Beta tester mode: tap the logo in Settings > Updates 7 times to unlock a Beta tester switch that also offers pre-releases.
- New tabs open as the rightmost tab. Drag a tab to move it. The order is saved.
- Faster, fresher tab previews: a preview is captured when a page loads and when you leave a tab.
- Smoother scrolling on Android: less work per frame, and nothing is drawn under Settings or the tab overview.

## 1.9.2
- Search, shortcut and sites widgets keep round corners at any size.
- Chat text can be selected and copied.
- Tab overview: new-tab tile at the end of the list, private tabs have their own style.
- Start page + button reads "Add shortcut". The keyboard shows reliably in the address bar.

## 1.9.1
- Desktop: fixed the app reporting version 1.8.2 and offering the update again.

## 1.9.0
- Linux: no more "no system keyring available" error. The token is stored encrypted in the profile folder.
- Pop-up windows from a page open as real windows.
- Chat: earlier messages stay yours after you change your display name.
- Start page: round + button, Auto shortcuts switch. Android search widget opens a new tab on the last visited site.
- Tests run on every build and must pass before a release.

## 1.8.2
- Updates from GitHub releases, checksum verified.
- Spell check and auto-correct, ten languages, mix allowed (Settings > Security).
- Select a math expression to see its answer.
- Server chat outbox: messages wait while the server is down and send when it is back.
- Lighter background work.

## 1.8.1
- Data and settings kept across updates (fixed user data folder, .bak backups).
- Removed autofilled password stays removed.
- Authenticator codes autofill without opening Settings; PIN asked on the page.
- Extension popups and action screens open from the main menu.
- Taskbar/window icon follows the theme.

## 1.8.0.2
- Search suggestions and the no-server search now use the engine chosen in Settings (or the fallback engine) instead of always DuckDuckGo.
- Two-finger swipe left/right goes back/forward.
- Themed Lodica Search and start page.

## 1.8.0.1
- Authenticator codes now fill in by themselves on the site they belong to. The first time a site asks for a code you choose which account to use; it is remembered. "Don't ask here" turns it off for that site. Change the site under Settings, Authenticator, globe button.

## 1.8.0
- Settings redesigned: sidebar with find (press "/"), 13 pages grouped Browsing, Look & tabs, Privacy & security, Data & controls, Account, About.

## 1.7.8
- Chat notifications arrive within about a second instead of up to a minute.

## 1.7.7
- Removed device-gate enrollment; use the website enrollment page instead.
- Search error now tells you to link a server in Settings.

## 1.7.6
- Home page: the new logo mark is now the "L" of "Lodica".

## 1.7.5
- The window and taskbar icon now follow the theme, including when the system light/dark theme changes, and apply to every open window.
- Chat: the cursor resyncs when the relay restarts and message ids reset (1.7.4).

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
- Windows taskbar icon follows the theme again, including in the installed build.
- Authenticator on desktop: codes behind your PIN, add by setup key or otpauth link, or from a screenshot of a QR code (Google Authenticator exports work too).
- New "What's new" page under Settings, Updates & About.

## 1.7.1
- Fix crash when opening settings (and anything that opens them, such as chat): the settings find index read the tab list before it was created.

## 1.7.0
- Settings: reorganised so identical settings sit in the same section on Android and desktop, plus a find box.
- Redirect domain display now shows only the originating domain.
- AI answers: a "Generate an AI answer" button appears where the answer would be, unless "Always generate AI answers" is on (off by default).
- Lodica Search is used by default when a server is linked; new fallback search engine setting for when it is unavailable. The relay favours recent results.
- Authenticator (Android): import a Google Authenticator export from a screenshot of its QR code.
- Desktop: .docx files open in the PDF viewer (converted to PDF first); .svg, .docx and .pdf can be opened from the OS (file associations).

## 1.6.5
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
