## 1.13.5

- Fixed: When you long press on a shortcut it should give you to option to remove that shortcut
- Fixed: There should not be an edit shortcut button there should be a plus to add shortcuts
- Fixed: When a password gets auto filled in and you remove it by using backspace it shouldn't reappear
- Fixed: When you click on the lodica text after you search something it shows a different start page but tha
- Fixed: On the search engine the l from lodia needs to be replaced bij the logo
- Fixed: There is no logo on the start page on mobile

## 1.13.4
- Desktop: the toolbar under the tabs shows fully again instead of being pushed down behind the page.

## 1.13.3
- Android: the menu sheet has New tab, Private and Reader tiles on top and outline icon rows below, with More for the rest.
- Android: the address bar is a full pill with a muted path after the host and an amber tracker count on the shield.
- Android: settings, dialogs, pickers, downloads, history, passwords and the Ask AI chat use the new cards, chips and icon tiles.
- Desktop: dialogs, theme cards, the segmented switcher, chat bubbles and search result cards follow the redesign.
- Desktop: settings has hero cards and a version footer. The chat shows memory and usage, and reader, support and toasts are polished.

## 1.13.2
- Desktop: tabs sit in one row above a single toolbar with back, forward, reload, a pill address bar with lock, shield and reader icons, and an Ask AI tile.
- Desktop: clicking the lock opens a site info popover. A setting can move the toolbar to the bottom.
- Desktop: new outline icon set (24 grid, round caps).
- Desktop: settings sections renamed to General, Privacy, Passwords, Your VPS, Ask AI, Search, Appearance, Downloads and Data use, with a clearer type scale and pill buttons.
- Android: new tab page has the Lodica tile, a pill search field with Ask AI, and rounded shortcut tiles.
- Android: the menu is a sheet with back, forward, reload and share on top and a grid of icon tiles.
- Android: settings rows, dialogs and filter chips use the shared shapes and type sizes, controls have 12 dp corners.

## 1.13.1

- Menu is now a popover with a row of back, forward and reload buttons and a three-column grid of icon tiles.
- List rows show their icon in a rounded tile, and settings rows are taller.
- The bottom bar, sheets and toasts have raised surfaces with thin borders.
- New-tab shortcuts are rounded cards.

## 1.13.0

- Rounder look: the address bar, search fields and chips are full pills, cards have softer corners, and selected chips show amber text on an amber tint.
- The search button on the Lodica Search page is now a round amber button.
- Text on amber and rose buttons is easier to read in every theme, on desktop and Android.
- Muted grey text has more contrast in several themes.
- Android: buttons and icons are at least 44 dp, so they are easier to tap.

## 1.12.12

- Redesign pass: buttons on amber or coral fills use readable text, the dim behind sheets is flat, toggles are larger, delete buttons are easier to hit, the search page shows focus rings, and animations follow the system reduced-motion setting.
- Android: floating chips, toasts and the tab switcher share one shadow depth.

## 1.12.11

- Contact support: chat bubbles, step chips and a cleaner composer.
- Settings: window opacity slider and blur toggle; the pane animates only on tab change.
- System theme follows the Hyprland, KDE, GNOME or GTK dark/light preference on Linux.
- AI chat: choose the folder where chats are saved.
- Theme plugins: author docs and an example plugin.

## 1.12.10

- Theme plugins: community themes. Drop a folder with plugin.json into the plugins folder (Settings > Themes > Theme plugins). See docs/theme-plugins.
- Contact support: a progress bar shows where your report is (sent, reviewing, asking, fixing, confirming, done), on mobile and desktop.
- Contact support: you now always get a confirmation when your message is sent, and the app shows a message when support answers or needs more information.
- Mobile: support answers arrive instantly as a notification instead of up to 15 minutes later.
- Reply to support with up to 3 images, and confirm with Yes, fixed / No once a fix is published.

## 1.12.9

- Swipe the "Open link" bar (and the mail bar) at the bottom of the browser away to dismiss it, on mobile.
- New: Settings > Contact support, on mobile and desktop. You get a notification when your message is sent, and again when it is answered, fixed, or when more information is needed.
- Server emoji button in the server chat, on mobile and desktop.

## 1.12.8

- Dark pages: text that sets its own colour (not inherited) is now recoloured too. This fixes the invisible "Chores" label on chores.vpswb.store, on mobile and desktop.

## 1.12.7

- Dark pages: elements with a plain gradient background no longer hide the text inside them (the small "Chores" label on chores.vpswb.store), on mobile and desktop.
- Checked on a phone: the "Older versions" dialog lists every release.

## 1.12.6

- Mobile: "Go back to an older version" in Settings, like on desktop. Android may refuse a downgrade until the newer app is uninstalled.
- Mobile: text in AI chats can now be selected and copied.
- Desktop: server chat no longer loses your text selection every few seconds, so messages can be copied.

## 1.12.5

- Dark pages: the helper extension now forces the page colour scheme to light when Dark pages is off (and dark when on), so sites with their own dark mode no longer turn dark by themselves. Checked on a phone: a site renders light with the setting off.

## 1.12.4

- Dark pages: the page colour scheme is set again after startup, so sites with their own dark mode follow the Dark pages switch. Not confirmed on a device yet.

## 1.12.3

- Dark pages: fixed text that stayed invisible or turned grey on sites using modern colour formats (oklch and similar), such as chores.vpswb.store. White text on buttons now stays white, and any text with too little contrast against its background is flipped to light or dark. Desktop now uses the same dark page code as mobile.

## 1.12.2

- Smartschool planner on the start page: add your Smartschool ICS link in Settings, Start page. Until then the start page says no planner is added. Desktop and Android.
- Desktop: sites can use the file picker API (fixes importing files on Sprint Online).

## 1.12.1

- Select a word or short phrase to get a Translate button (Dutch, French, English, language detected automatically), with a definition for English words. Desktop and Android.
- Desktop: drag a link or image onto the tab strip to open it in a new tab.
- GoDaddy sites use compatibility mode, which avoids the Akamai "Access Denied" page.

## 1.12.0-beta.10 (redesign test)

- Fix the Android build of beta.9 (missing import). Same changes as beta.9.

## 1.12.0-beta.9 (redesign test)

- Server chat: long press a message on Android to copy it; text in the desktop chat can now be selected.
- Graphs show where the line crosses the axes, with coordinates.
- Tabs show the site icon (desktop and Android); search tabs show the Lodica logo.
- Google sign-in on all country domains (accounts.google.*) uses the compatibility user agent.
- Linux: the system theme takes the accent colour of KDE or GNOME.

## 1.12.0-beta.8 (redesign test)

- Go back to an older version: Settings > About > Go back to an older version (desktop). Pick a release from the list; the download is still checksum verified.
- Android: autocorrect fixes, Gboard-like keyboard look, better landscape keyboard, IME switcher no longer overlaps the keyboard.
- Android: tab switcher and search thumbnails load reliably, find bar layout, viewport after the keyboard closes.
- Android: friendly error page when a site cannot be loaded, private tabs no longer stay blank, desktop-site pages no longer clip on the left.
- Android: start page settings show an explanation and a preview, also with None selected.
- Dark pages: detection only looks at the real page colours, so light sites are no longer darkened.
- Fixes for installing a site as an app and for a blank tab after a download.

## 1.12.0-beta.6 (redesign test)

- Server chat: emoji button next to (desktop) or under (Android) the file button. Server emojis on both, normal emojis on desktop. Sent as `:name:`, shown as images.

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
