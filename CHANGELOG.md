# Changelog

See `android/PATCH_NOTES.md` and `desktop/PATCH_NOTES.md` for older releases.

## 1.13.1 (versionCode 102)
- Menu is now a popover with a row of back, forward and reload buttons and a three-column grid of icon tiles.
- List rows show their icon in a rounded tile, and settings rows are taller.
- The bottom bar, sheets and toasts have raised surfaces with thin borders.
- New-tab shortcuts are rounded cards.
- Android: version bump only.

## 1.13.0 (versionCode 101)
- Rounder look: the address bar, search fields and chips are full pills, cards have softer corners, and selected chips show amber text on an amber tint.
- The search button on the Lodica Search page is now a round amber button.
- Text on amber and rose buttons is easier to read in every theme, on desktop and Android.
- Muted grey text has more contrast in several themes.
- Android: buttons and icons are at least 44 dp, so they are easier to tap.

Known leftovers:
- About 46 animation durations are still hardcoded in ui.css, search.css and polish.css.
- Settings sidebar icons repeat across sections.
- A few `:root` fallback colours and the `html.mock` gradient are not theme variables.
- Duplicate `.sw-t` rules.
- Solarized-dark text on raised surfaces has contrast 3.7.
- Not yet redrawn from the design PDF: new-tab shortcut tiles, 6-box PIN dialog, Appearance cards, Ask AI and support chat layout, reader toolbar and player.

## 1.12.12 (versionCode 100)
- Desktop: redesign pass. Buttons and chips on amber or coral fills use black or white text for contrast. Dim behind sheets and dialogs has no blur. Toggles are larger. Delete (×) buttons are 28 px with a pointer cursor. Search page has visible focus rings. Motion respects the system reduced-motion setting. Removed the Fill button glow and the search card hover lift.
- Android: floating chips, toasts and the tab switcher share one shadow depth.

## 1.11.11 (versionCode 77)
- Android: Fixes: date and file inputs work, Reader no longer repeats the title and works after upgrades, Inbox retry, archived rows, landscape keyboard, false crash screen, shared searches use a public link, image search viewer has a close button and Open image link, spell-check language label, alias reuse on sign-up forms, and other small fixes.

## 1.11.10 (versionCode 66)
- Android: Custom emoji keyboard: Lodica Keyboard (Settings > AI answers > Emoji keyboard) with better autocorrect and a ★ tab of custom emojis. Import emojis from an image or generate one with your Anthropic key. Emojis sync with your server and send as images where the app accepts them, otherwise as :name:. Settings search finds the Emoji keyboard section.
- Relay: new /api/emojis endpoint (deploy the relay for emoji sync).

## 1.11.9 (versionCode 65)
- Android: Theme names are clearer (Wallpaper instead of a second System). DNS server box rejects addresses not starting with https://. Install-as-app no longer shows "null". Authenticator pre-fills the current site. Reader renders headings, keeps right-to-left text aligned and drops citation markers, tables and infoboxes. History merges duplicate pages.

## 1.11.8 (versionCode 64)
- Android: Settings search finds Smoother scrolling (now under Sites & domains). Dropdown menus open under their value. Settings keeps its scroll position and page when you come back from Server chat. History says "Just now" for fresh entries. Private badge stays on one line. Start page shortcuts show site names, skip error pages and are hidden in private tabs. Spell check says long-press.

## 1.11.6 (versionCode 54)
- Android: beta build with hidden scroll diagnostics. In Settings > Updates & About, tap "Build" 5 times to show GPU, render path and a frame time overlay. No scrolling fix yet.

## 1.11.5 (versionCode 53)
- Android: fixes blank pages in 1.11.4. "Smoother scrolling" is off by default again and the setting was reset, so it starts off for everyone.

## 1.11.4 (versionCode 52)
- Android: "Smoother scrolling" (draw pages directly on screen) is now on by default to fix slow scrolling on weaker phones. Tab previews may turn blank; turn it off in settings and restart if you prefer previews.

## 1.11.3 (versionCode 51)
- Android and desktop: chat files up to 5 GB, streamed to disk on the relay (20 GB total quota, Range support).
- Android: "Smoother scrolling" setting for slow phones (surface view backend).
- Relay deploy: new `chatfiles` dir under the data dir, no request timeout (120 s idle timeout), check any reverse proxy body limit.

## 1.11.2 (versionCode 50)
- Android and desktop: private tabs show the incognito mark on the start page.
- Android: the start page logo is the "l" of "Lodica".

## 1.11.1 (versionCode 49)
- Desktop: fixed the tab strip showing no tabs while the tab menu listed them.

## 1.11.0 (versionCode 48)
- Install as app: a chip offers to install a site that has a web app manifest. Installed web apps set to fullscreen run with no system bars.
- Page fullscreen (video, games) now hides the status and navigation bars. Swipe from the edge to peek.
- Select an equation like 3x - 24 = -6 and the answer shows above it: x = 6. Works for one unknown, linear or quadratic, and for 3(x+1) = 12.
- Address bar auto-hides on local files. Long-press the bar to hide it, long-press where it sat to bring it back. Editing and find always show it.
- Tab previews are saved to disk, so cards are not blank after a restart or after a tab is unloaded. Private tabs are never saved.
- Background tabs idle for 5 minutes are unloaded and at most 3 live sessions are kept, so passive CPU and memory drop.
- Opening an IP address with no scheme now uses the plain web scheme.
- New switch to turn off autocorrect in the search bar. Dropdown and keyboard alignment fixes.
- Double-click on the address path selects only path and query, so Backspace leaves the bare domain.
- Desktop: .docx files open in an editor. Edit text in place and save back as a real .docx.

## 1.10.0

- Beta tester mode (Android and desktop): in Settings, tap the logo in the update section 7 times to unlock a "Beta tester" switch. With it on, the updater also offers GitHub pre-releases (tags like `v1.10.0-beta.1`). Everyone else only sees stable releases. To promote a beta, publish the build as a normal (non-pre-release) release.
- Tabs: new tabs always open as the rightmost tab. Drag a tab to move it (long-press and drag in the Android tab overview; drag in the desktop tab strip and tab overview). The order is saved.
- Version comparison now ranks `1.10.0-beta.2` above `-beta.1` and below `1.10.0`.

## 1.9.2 (versionCode 46)

- Search widget (and the shortcut and sites widgets): corners are now drawn at the widget's real size, so they stay round instead of stretched, and they redraw when you resize the widget.
- Chat: message text can be selected and copied.
- Tab overview: the new-tab button is now a tile at the end of the tab list, new tabs animate in, and private tabs have a distinct tinted style.
- Start page: the round + button now reads "Add shortcut".
- Address bar: the keyboard is shown reliably when it opens, and a tab swipe on the address bar needs a shorter drag.
- Not included yet: WebNFC, Bluetooth key sign-in, readable hex display and the password-field backspace report. These need hardware or more details.

## 1.9.1 (versionCode 45)

- Desktop: fixed the app reporting version 1.8.2 and offering the update again after installing a newer one.

## 1.9.0 (versionCode 44)

- Linux: connecting to the server no longer fails with "no system keyring available". Without a keyring the token is stored encrypted with a key file in the profile folder (permissions 0600).
- Pop-up windows opened by a page (for example the Smartschool mail composer) now open as a real separate window, so the page that opened them no longer hangs waiting for it.
- Chat: after you change your display name, your earlier messages still show as yours and keep the name they were sent under.
- Start page shortcuts: a round + button replaces the text button, cleaner add and remove styling. Android Settings has a new switch, Auto shortcuts, to show only the shortcuts you add. Desktop already had it as Show most visited sites.
- Android search widget opens a new tab on the last visited site.
- Tests: `npm test` in desktop runs every test, and the release build refuses to publish unless they pass.

## 1.8.2 (versionCode 43)

- Updates now come straight from the GitHub releases of bent-syntax/lodica-browser, checked against the SHA-256 of the file. No install without a checksum.
- Spell check and auto-correct in ten languages (en, nl, de, fr, es, it, pt, sv, da, pl). Pick any mix: a word is fine if it is in any chosen dictionary. Auto-correct on: fixes as you type, Backspace undoes. Off: right-click a misspelled word for suggestions. Settings > Blocking/Spelling (Android) and Settings > Security (desktop).
- Selecting a math expression (for example 12*(3+4)) shows the answer above it.
- Server chat: messages sent while the server is down wait in an outbox and go out in order when it is back. Shown as pending in the chat.
- Lighter: dictionaries load only when you focus a text field, idle timers only run when needed.

## 1.8.1 (versionCode 42)

- Desktop: data and settings stay put across updates (fixed user data folder, backup copy of every store restored if one is damaged). Android already keeps data on update.
- Both: a removed autofilled password no longer comes back.
- Desktop: authenticator codes autofill on their own. A PIN prompt shows on the page when the vault is locked.
- Extensions: popups and action screens now open. Desktop: extension buttons in the main menu. Android: Open row under Settings > Extensions.
- Desktop: the taskbar and window icon follow the theme colour (Linux desktops that read the icon from the .desktop file may still show the installed icon).

## 1.8.0.2 (versionCode 41)

- Android: Lodica Search results and its home page now take the app theme (the colours are passed in the address, so they apply even on the first load).
- Android: the new tab page matches the desktop start page: horizontal logo, search box, site icons and an Edit shortcuts link. The black strip at the bottom is gone.
- Android: every Settings page has an icon, and a red Danger zone at the bottom holds Clear history, Clear suggestions and Clear site data.
- Android: fixed the screen sometimes going black when opening a site after leaving one.
- Desktop: a two-finger swipe left or right on the touchpad goes back or forward, like the Back and Forward buttons.
- New "System colours" theme: Android uses the wallpaper colours (Android 12+), desktop uses the OS light/dark setting and accent colour.
- Chat name defaults to the device name. Names are unique per device: a name already used by another device is refused (needs the relay update to enforce).

## 1.8.0.1 (versionCode 40)

- Lodica Search now uses the app theme from the first paint (colours are remembered between visits), including result text and links. This is the 1.8.0 Android build with this fix.
- Desktop: authenticator codes fill in automatically on the site they are tied to, asking once which account to use. The desktop build also ships as a Flatpak.

## 1.8.0 (versionCode 39)
- Android: Lodica Search uses the new logo and follows the app theme. Helper extension version 1.8.
- Android: the first time a site asks for an authenticator code, the app asks which code to use. It fills that code automatically on later visits. Choosing "Don't use" stops the prompt for that site, and you can still set a code for the site later in the Authenticator screen (tap the site line).
- Settings redesigned on desktop and Android: the same 13 pages in the same order (Search, Sites & domains, AI answers, Theme, Start page, Tabs, Privacy & history, Security & blocking, Data/apps/extensions, Keybinds & controls, Server & mail, Identity & passwords, Updates & About). Desktop has a sidebar with find and a "/" shortcut; Android has a grouped home with find and a slide into each page. Site language, User agent, Passwords, Dark pages and Tab layout moved to the pages that fit them. No settings were added or renamed.

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
