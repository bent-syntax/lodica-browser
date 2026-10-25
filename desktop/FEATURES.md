# Lodica desktop feature list (Windows + Linux, Electron)

Copied from the Android list. Android-only items have no desktop equivalent: the home-screen widget (#28), Shizuku installs (#34) and the Android background-audio service (#11). Desktop equivalents of the rest are described in IPC.md.

Excluded: tab spaces, AI summary (#17), CAPTCHA solving.

## Core
1. (done) Built-in ad blocker (uBlock Origin) + automatic cookie-banner rejection.
2. (done) Dummy-email logins: on sign-up/log-in, create a per-site alias (e.g. site-x7k@example.com) + strong password,
   fill the form, save both in the vault, auto-open the confirmation mail via a catch-all inbox on the VPS.
   Saved login for the site wins, unlocked with fingerprint. No CAPTCHA solving.
3. (done) Tabs restored after closing the app, including back history and scroll position.
4. (done) Physics-based animations: swipe address bar to switch tabs, swipe-back with previous-page preview, pull to refresh.
5. (done) All traffic routed via your own VPS (pure tunnel, no MITM). Link it in Settings > VPS with your domain and relay token.

## Extras
6. (done) Bottom address bar.
7. (done) Long-press link: preview in pop-up sheet.
8. (done) Per-site data meter: used, blocked, total saved.
9. (done) Per-site lite mode: block images / fonts / JavaScript.
10. (done) Reader mode with read-aloud.
11. (done) Picture-in-picture + background audio for any video, speed control.
12. (done) Forced dark mode on any site.
13. (done) Private tabs locked with fingerprint.
14. (done) Auto-archive of tabs not opened in a while.
15. (done) "Remind me": tab reopens at a chosen time.
16. (done) Clipboard link bubble: copy a link anywhere, bubble offers to open it.
17. (excluded: AI summary)
18. (done) Phone tabs viewable on PC via a private page on example.com.
19. (done) Undo closed tabs + recently-closed history.
20. (done) User-agent switcher + anti-fingerprinting.
21. (done) Download manager: resumable, save page videos/images.

## Batch 2 (agreed 2026-10-06)
22. (done) Compatibility mode per site: turns off anti-fingerprinting and the user-agent spoof for that site, so bot
    checks (Cloudflare Turnstile, Akamai, GoDaddy sign-up) see a normal Firefox. Switched on automatically when a
    known challenge page is detected; toggle in the per-site sheet. A blocked VPN/datacenter IP can still fail.
23. (done) Autofill fires real input events: every filled field (email, confirm boxes, username, password) is set with
    the native value setter followed by `input`, `change` and `blur`, so sign-up forms accept the password.
24. (done) Site language: Settings toggle English / Dutch. Sets Accept-Language and adds `hl=` on Google URLs.
25. (done) Reload = 4-finger swipe down anywhere on the page. One-finger pull-to-refresh is removed (maps no longer
    reload when dragged). Edge-swipe back stays.
26. (done) "Remind me" uses a free date and time picker instead of preset times.
27. (done) Web apps as real apps: Lodica builds a small wrapper APK per site on the phone (template APK in assets,
    package name, label and icon patched, signed with a key generated on the phone). Android asks once to
    install; needs "Install unknown apps" for Lodica. The wrapper opens Lodica's toolbar-less web-app mode
    with its own launcher and recents entry, and no browser badge on the icon.
28. (done) Home-screen search bar widget that opens a new search in Lodica.
29. (done) Ask AI: Claude Code bridge via Termux, optional and off by default (at the user's own risk). The user signs
    in to the official Claude Code inside Termux; Lodica never sees credentials. Lodica keeps one Claude Code
    process running and sends prompts to it (small model, minimal system prompt, no tools). Every request is
    hard-capped below 500 tokens: system ~50, memory <=100, search snippets ~120, question trimmed to fit,
    reply max ~150. An "Ask AI" button appears on the address bar once the bridge is connected.
30. (done) AI memory: facts about the user in a local file encrypted with an Android Keystore key. The AI can add
    facts; view, edit and clear them in Settings. Never sent to the VPS.
31. (done) Lodica Search: SearXNG on the VPS used only through its JSON API. Lodica renders its own light results page
    (own logo and name, Lodica theme, Chrome/Google-like layout, no JS framework). Result images are converted
    to small WebP on the VPS. When AI is connected, an AI answer box above the results is filled on the phone
    via the bridge (with memory, under 500 tokens); AI answers and memory never touch the VPS.

## Batch 3 (agreed 2026-10-07)
32. Google login works: Google sign-in pages always use compat mode and go direct, not through the VPS.
33. Web-app icon = the site's own icon (manifest, page icons or favicon, SVG included); a letter only as last resort.
34. Fewer install prompts for web apps: no repeat permission ask, no confirm on updates (Android 12+), and a fully
    silent install through Shizuku with a setup button in Settings.
35. Video quality: global default (720p) in Settings plus a per-site choice in the page menu.
36. Claude token usage in Settings > AI: today, last 30 days and all time, with a reset button.

## Batch 4 (agreed 2026-10-08)
37. Search-bar widget opens a new tab and types there. Open tabs are listed above the search bar while it is focused.
38. Sign-up uses one fixed dummy Belgian address (Rue de la Loi 16, 1000 Brussels, Brussels-Capital Region, Belgium).
39. Sign-up fills required fields only (required, aria-required, or * in the label); phone, newsletter and marketing stay empty.
40. Birthdate follows each field's format (ISO date input, dd-mm-yyyy, mm/dd/yyyy, yyyy-mm-dd, dd.mm.yyyy, split day/month/year selects or inputs, month as 1-12, 01-12 or name). Same date everywhere.
41. Private tabs lock when you switch to a normal tab and when the app closes. Desktop unlocks with the vault PIN, Android with biometrics.
42. Share and copy-link drop `?` and everything after it; `#fragment` stays unless it sits behind the `?`.
43. Double tap selects a word, triple tap selects the whole block of text (touch only; desktop keeps native double/triple click).
44. Mail to an account reaches every browser using it: the inbox is keyed per account and aliases are mirrored on the relay.
45. Desktop identifies as Chrome on Windows so sites stop refusing sign-up; a "Use dummy mail" button sits at the top of the screen.
46. YouTube ads: cosmetic and network filters, ad fields stripped from the player response, Ghostery lists updated.
47. Tabs on PC: link once with a code, then phone and PC always see each other's tabs. Only `pctabs.reset` unlinks.
48. Cookie banners are rejected reliably (OneTrust, Cookiebot, Didomi, Quantcast, Usercentrics, Sourcepoint, Google): click reject-all, else hide the banner, on load and for late banners.
49. Linux build (Wayland native, X11 fallback): `npm run dist:linux` makes an AppImage and a deb.

## Batch 5 (agreed 2026-10-09)
50. Desktop navigation: back, forward and reload buttons in the top bar; Alt+Left, Alt+Right and mouse buttons 4/5 also navigate.
51. Desktop crash handling: a crashing tab logs reason and exit code to `crash.log` in the user data folder and reloads itself; the window never dies with a tab.
52. Error page for failed loads with the error code and Retry, Try again without blockers, Open in system browser buttons.
53. Web Serial (Chrome/Edge style): sites get a port picker and COM port detection. Desktop only; GeckoView has no serial API.
54. Serial monitor panel (desktop): pick port and baud, live RX log, TX input, clear.
55. Keyboard input: pages that need a keyboard get key events; an on-screen keyboard button for pages that ask for one (desktop).
56. Sign-up email detection fixed (late-appearing fields, multi-step forms, iframes, shadow DOM) on desktop and Android.
57. "Check for updates" button (Settings > About) on desktop and Android. Repos stay private; the relay holds a read-only token and serves `/api/update/check` and `/api/update/download`; browsers never hold the GitHub credential.
58. `session_context.md` is kept updated after each piece of work.

## Implementation notes (VPS features)
- Token: `keystore/relay-token` (gitignored) becomes `BuildConfig.RELAY_TOKEN`; when empty, all VPS features hide.
- #5 VPS routing: built-in helper extension (`assets/extensions/helper`) sets `proxy.onRequest` to
  `tunnel.example.com:443` (44742 for relays installed before 443 support). Off by default (Settings > Route through VPS); local/private hosts bypass.
  The address bar shows a lock icon while the page is routed.
- #2 Hidden email: "Use hidden email" chip (or menu item) on focused email fields fills `<site>-<6>@example.com`.
  The app polls `/api/mail` every 5 s for up to 5 min and shows a notification and banner with "Open link"/"View".
  The Inbox is reachable from Settings and the menu. Sign-up is filled end to end: email and confirm-email,
  a generated password and confirm-password, a username, and the alias + password are saved in the vault.
- #18 Tabs on PC: AES-256-GCM, with the id and key wrapped by an Android Keystore key. Uploads to `/api/tabs/<id>`
  are debounced 3 s and also sent on pause. The link `lodica.example.com/t/<id>#<key>` keeps the key in the fragment.
- #59 Themes: Settings → Appearance picker with System, Dark, Light, Everforest Dark/Light, Nord, Gruvbox, Catppuccin Mocha, Tokyo Night, Rose Pine, Solarized Dark, Dracula, One Dark and Kanagawa. Palettes live in `scripts/build-themes.js`, which generates `ui/themes.css` and `search/themes.css`; the choice is the `theme` pref.
- #60 Vertical tabs: `vertTabs`, `vertWidth` and `vertCollapsed` prefs. The side panel can be collapsed and resized with the divider (`ui/divider.html`, `ui/js/divider.js`).
- #61 Force dark: the helper keeps hue and remaps lightness only, leaves images and video alone, and skips sites that have their own dark mode. The desktop preload is regenerated from the Android helper with `npm run config`.
- #62 Search suggestions come from local history only; toggle (`historySuggest`) and clear in Settings → Privacy.
- #63 The "+" button sits right after the last tab, in horizontal and vertical mode.
- #64 Start page backgrounds: `search/bgs.js`, `search/bg/`, pref `bg`.
- #65 Settings is split into tabs (General, Appearance, Tabs, Privacy & blocking, Keybinds & controls, Identity/mail, Updates/About). Shortcuts (`main/keys.js`, pref `keybinds`) and mouse-button actions (pref `mouse`) are rebindable.
- #66 Root cause: classic.minecraft.net sets `isMobile` from a UA regex that matches "Mobile", which trips when a tab is in mobile-site mode (Android UA). Fix: `prefs.agentFor(tab, host)` sends the desktop UA for hosts with `siteOverrides[host].desktopInput`, applied in `net.js`, `commands.js` and `main.js` (`did-start-navigation`). Default list holds `classic.minecraft.net`; Settings → Keybinds & controls has a per-site toggle and an "Add a site" field. Test: `test/agentfor.js`.
- #67 The stray keyboard icon is removed. The on-screen keyboard is opened from Settings → Keybinds & controls or by shortcut.
- #68 Split tabs: two pages side by side in one window. Test: `test/split.js`.
- #69 Hidden mail on PC fills the whole form with one consistent identity (name, surname, email, username, street, zip, city, date of birth, password). The #56 email-detection regression came from a stale generated `preload/content.js`; regenerating fixed it. Tests: `test/signup-detect.js`, `test/signup-fill.js`.

## Status
Done: #1-16, #18-21 (first batch). Batch 2 (#22-31) done. Batch 3 (#32-36) done. Batch 4 (#37-49) done. Batch 5 (#50-58) done.
- #1 Cookie banners: helper extension clicks "reject"/"necessary only"; toggle in Settings.
- #4 Swipe in from the left edge goes back; reload moved to a 4-finger swipe (#25).
- #8/#9 Data meter and lite mode live in the per-site sheet; totals in Settings > Data use.
- #10 Reader sheet with read-aloud (Android TTS).
- #11 Background audio: a media-playback foreground service with play/pause/stop keeps sound going after
  leaving the app. Android may refuse to start it if playback begins while the app is already in the background.
- #15 Remind me: alarm reopens the tab at the chosen time.
- #19 Undo close + recently-closed list (menu).
- #20 User-agent picker (Settings); Gecko fingerprinting protection is always on.
- #21 Downloads resume with HTTP Range requests (up to 5 retries) when the server supports it.
- #22 Compat mode: per-site toggle in the page menu; auto-on (with a toast) when a Cloudflare, Akamai or
  GoDaddy/Sucuri challenge page is seen. Compat sites get the default user agent and no fingerprinting protection.
- #23 Autofill uses the native value setter, then `input`, `change` and `blur`.
- #24 Site language (Settings): EN/NL via runtime locales (Accept-Language) and `hl=` on Google.
- #25 Four-finger swipe down reloads; one-finger pull-to-refresh removed.
- #26 Remind me: presets plus "Pick date and time…" (date picker, then 24-hour time picker; past times refused).
- #27 Web apps: "Install as app" in the page menu (hidden for private tabs) builds a wrapper APK on the phone from the
  `:webapp` template, signs it with an Android Keystore EC key and installs it via PackageInstaller (needs "Install
  unknown apps"). The wrapper opens a toolbar-less `WebAppActivity` with its own recents entry; off-origin links open
  in Lodica.
- #28 Search widget (`SearchWidget.kt`): tapping the bar opens Lodica with the address bar focused for a new search.
- #29 Ask AI: `assets/ai/bridge.js` runs in Termux (RUN_COMMAND, needs `allow-external-apps=true`) and keeps one
  Claude Code process, reached over 127.0.0.1:47821 with a random token. Lodica sends at most 1200 characters
  (~300 tokens: memory, page context, question); the reply is capped at ~80 words. Measured total per request is
  ~640 tokens because Claude Code adds ~340 tokens of fixed overhead that Lodica cannot remove, so the 500-token
  target is met for Lodica's own part only. Termux needs `@anthropic-ai/claude-code@2.1.112` (later releases are
  native-only, with no Android build); the bridge runs its `cli.js` with node directly.
- #30 AI memory: `Memory.kt`, AES-GCM with an Android Keystore key; Settings > AI memory to view, edit and clear.
  The model adds facts with a `MEMO:` line; up to 400 characters of the newest facts go into each prompt.
- #31 Lodica Search: the relay's `/api/search` calls SearXNG's JSON API (127.0.0.1:8888); result images come as
  small WebP from `/api/img`. `search.html` in the helper extension renders the page. Pick "Lodica Search" in
  Settings > Search engine (DuckDuckGo is used when the VPS is off). The AI answer box is filled on the phone via
- #32 `accounts.google.com`, `accounts.youtube.com`, `myaccount.google.com` and `gds.google.com` are always in compat
  mode and bypass the relay. Google may still block the embedded engine ("This browser may not be secure"); there is
  no fix for that from inside Lodica.
- #33 Icon order: maskable manifest icon, largest manifest icon, page `<link rel=icon>`s, the tab favicon,
  `/favicon.ico`, then a letter. SVG icons render through AndroidSVG.
- #34 Lodica's "Install unknown apps" setting is only opened when it is not granted yet. Android 12+ sessions set
  `USER_ACTION_NOT_REQUIRED`, so updates of wrappers Lodica installed skip the confirm screen. Settings > Web apps
  walks through Shizuku setup step by step (Play Store, developer options, wireless debugging, Start, allow Lodica);
  when Shizuku is ready, `pm install` runs through it with no prompt at all. Shizuku must be started again after
  each reboot. Play Protect can still warn about the new app: tap More details, then Install anyway, or turn off
  Play Protect > Scan apps. Lodica cannot turn that off itself.
- #35 YouTube only, through its player API. If the chosen quality is missing, the nearest lower one is used.
- #36 Counts are kept per day on the phone; numbers come from the reply metadata of each Ask AI request.
- #37 Android: strip shows non-locked tabs when the search bar is focused; tap switches tab. Desktop: strip above the address bar.
- #41 Android relocks private tabs on select (biometric prompt); desktop uses the vault PIN and `private.unlock`.
- #43 Android only: content script counts touches (350 ms, 30 px) and uses `selection.modify`. Not applied inside form fields, links or buttons.
- #44 Server registry: `GET/POST /api/aliases`, `DELETE /api/aliases/<local>`, tombstones in `removed`.
- #47 Desktop PC-tabs ids and keys moved from hex to base64url: old blobs are orphaned and old links stop working; link again once.
- #49 `app.commandLine.appendSwitch("ozone-platform-hint","auto")` before ready; `desktopName` ties the window to the .desktop entry on Wayland.
- #50 Back/forward/reload live in the top bar; Alt+Left/Right and mouse buttons 4/5 call the same `nav.*` commands.
- #51/#52 `main/errorpage.js` renders the failed-load page and a render-process crash writes `crash.log` and reloads the tab; the main window survives.
- #53/#54 Web Serial, WebUSB and WebHID pickers are in `ui/js/serial.js`; the monitor panel is in the menu. Tested with `test/serial.js` only, no real hardware.
- #55 Key events are forwarded to pages, focus returns to the page after overlays close, and the on-screen keyboard button sits in the top bar.
- #57 Updates: `main/updater.js` asks the relay (`update.*` commands, `update` event; see IPC.md), downloads to the Downloads folder, verifies SHA-256 and then opens the installer (Windows) or reveals the AppImage (Linux). No GitHub credential is stored here. `preload/content.js` is generated by `scripts/build-preload.js`; do not edit it by hand.

## Batch 6 (agreed 2026-10-09)
59. Themes: Settings > Appearance picker on PC and phone. System, Dark, Light, Everforest Dark, Everforest Light, Nord, Gruvbox, Catppuccin Mocha, plus three extras: Tokyo Night, Rose Pine, Solarized Dark. Themes colour the browser UI, start page and settings; websites keep their own colours.
60. Vertical tabs (PC only): a toggle moves the tab strip to a collapsible, resizable side panel.
61. Forced dark mode fix: keep hue and change lightness only (dark backgrounds, light text). Images and video are not touched, and sites that already have a dark mode are left alone. No more inverted colours.
62. Search suggestions from history: the address bar suggests matching history pages and past searches ranked by recency and frequency. Local only, with a toggle and a clear button in Settings.
63. The + (new tab) button sits right after the last tab, not at the far edge (also in vertical mode).
64. Backgrounds for the start page: built-in gradients and images, your own image, or a solid colour, with dim and blur sliders.
65. Settings split into tabs: General, Appearance, Tabs, Privacy & blocking, Keybinds & controls, Identity/mail, Updates/About. PC: rebindable shortcut list with reset, plus mouse-button actions. Phone: gesture list and toggles (not rebindable).
66. classic.minecraft.net still says a keyboard and mouse are required (PC only; mobile does not support it). Reproduce, find which check triggers it (pointer type, touch points, user agent, keyboard API) and add a per-site override.
67. Remove the stray keyboard icon at the top right; the on-screen keyboard stays reachable from Settings > Keybinds & controls and by shortcut.
68. Split tabs (PC only): two pages side by side with a draggable divider. Right-click a tab > Split with..., click a pane to focus it, a close button ends the split.
69. Hidden mail on PC: fix it pasting the address into the name field only. Port the phone's field detection and identity so one use fills the whole form (name, first name, last name, address, city, zip, country, username, email) as on phone. Also covers the #56 email detection regression.

## Releases
- Android 0.1.1 (versionCode 2) and desktop 1.0.1 are the current builds. The in-app update check compares the installed version with the latest GitHub release served by the relay, so a release must carry a higher version than the installed one to be offered.
- Releases are published with `release.sh` (in the VPS assistant folder), which creates the GitHub releases and uploads the APK and the desktop installers.
70. Desktop menu cleanup: flat two-column list instead of the phone-style icon grid; Share, Desktop/Mobile site, Remind me, Install as app and Archive tab removed from the page menu (copy link stays in the context menu, the Desktop sites toggle stays in Settings). Settings tabs wrap instead of scrolling under the scrollbar. Gradient and pill styling dropped.
71. AI is Claude Haiku only (`claude-haiku-4-5-20251001`), through the user's own API key (Settings > AI) with the web search tool for multi-step research, or the Claude Code CLI as fallback. Memory goes into the system prompt with a rule to use it only when relevant, so unrelated questions get plain answers.
72. AI chat (menu > AI chat): saved chats, stored encrypted on the PC, mirrored into the Tabs-on-PC blob and shown read-only on the phone (Settings > Tabs on PC). Per-chat last write wins; deletes are tombstones.
73. Lodica Search: site icons in circles, suggestion dropdown, top-site tiles on the start page. Only All and Images tabs exist.
74. Settings is a full-window page on desktop. The address-bar "+" is gone; the tab strip keeps its own.
75. Built-in site override for classic.minecraft.net and minecraft.net (`desktopInput`), merged in `main/prefs.js` under the user's own `siteOverrides`. Unverified against the live site.
76. One version for both apps: `node scripts/set-version.js <x.y.z>` writes package.json, package-lock.json and the Android `build.gradle.kts`; with no argument it prints both and fails if they differ.
77. Search home: custom quick sites (add and remove) and a switch for the automatic top sites.
78. Search box: clear (X) button. The search pages follow the browser theme.
79. Custom theme: four colours, live preview, synced to other devices through the relay (`/api/theme`, newest write wins).
80. Dummy mail button: only on sign-up pages; can be hidden for a single site.
81. The two dark-mode settings are merged into one.
82. Search works with no relay (falls back to DuckDuckGo).
83. Notebook (menu > Notebook): several text notes kept on the relay (`/api/notebook`) and shared with every linked device. Switch between notes with the chips, add one with the plus chip, delete the open one with the bin button. Saves after you stop typing and checks for changes every 10 seconds. If two devices edit at once, the newer text stays and the other edit is added under it.
84. Phone screen (menu > Phone screen): shows the screen of a linked Android phone live in the browser, for example to play a phone game on the computer. Start it on the phone in Settings > Server, chat & mail > Share phone screen and confirm the system dialog each time. Frames go through the relay (`/api/screen`, newest frame only, nothing stored). Stop from the phone notification or the Stop sharing chip.

## Extensions (1.2.0)
- Desktop: install from the Chrome Web Store by link or ID (Electron, partial API). Android: search and install from Firefox Add-ons. On/off and remove in Settings > General.

## PDF viewer (1.3.0)
- `pdf/` holds the pdf.js 6.4.299 release (Apache-2.0, see `pdf/LICENSE`), trimmed to the en-US locale.
- Served by the `lodica://pdf/` host in `main/main.js`. `/f?u=<url>` proxies a remote or file PDF so the viewer reads it same-origin.
- `pdfViewerUrl()` in `main/tabs.js` rewrites main-frame `.pdf` navigations, redirects and tab loads to the viewer.
