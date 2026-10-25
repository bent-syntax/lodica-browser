# Lodica feature list (agreed scope)

Excluded: tab spaces, AI summary (#17), CAPTCHA solving.

## Core
1. (done) Built-in ad blocker (uBlock Origin) + automatic cookie-banner rejection.
2. (done) Dummy-email logins: on sign-up/log-in, create a per-site alias (e.g. site-x7k@your-domain) + strong password,
   fill the form, save both in the vault, auto-open the confirmation mail via a catch-all inbox on the VPS.
   Saved login for the site wins, unlocked with fingerprint. No CAPTCHA solving.
3. (done) Tabs restored after closing the app, including back history and scroll position.
4. (done) Physics-based animations: swipe address bar to switch tabs, swipe-back with previous-page preview, pull to refresh.
5. (done) All traffic routed via your VPS (pure tunnel, no MITM).

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
18. (done) Phone tabs viewable on PC via a private page on your server.
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
  `tunnel.<domain>:443` (44742 for relays linked before 443 support). Off by default (Settings > Route through VPS); local/private hosts bypass.
  The address bar shows a lock icon while the page is routed.
- #2 Hidden email: "Use hidden email" chip (or menu item) on focused email fields fills `<site>-<6>@your-domain`.
  The app polls `/api/mail` every 5 s for up to 5 min and shows a notification and banner with "Open link"/"View".
  The Inbox is reachable from Settings and the menu. Sign-up is filled end to end: email and confirm-email,
  a generated password and confirm-password, a username, and the alias + password are saved in the vault.
- #18 Tabs on PC: AES-256-GCM, with the id and key wrapped by an Android Keystore key. Uploads to `/api/tabs/<id>`
  are debounced 3 s and also sent on pause. The link `lodica.<domain>/t/<id>#<key>` keeps the key in the fragment.

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
- #56 Sign-up detection was fixed in the content script; Android keeps the same detection rules as desktop.

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

- #59 Android themes: `ui/theme/Theme.kt` defines `Palettes` (Dark, Light, Everforest Dark/Light, Nord, Gruvbox,
  Catppuccin Mocha, Tokyo Night, Rose Pine, Solarized Dark) plus a "System" choice that follows the device. The
  colour vals (Graphite, Mist, Amber and so on) are getters backed by `ThemeState`, so every existing call site
  follows the active theme without edits. The choice is stored in `Prefs.theme`. Settings > Appearance lists the
  themes with a colour preview. Websites keep their own colours.
- #61 Android force dark: the inverting filter in `assets/extensions/helper/content.js` is gone. The top frame now
  remaps text, background and border colours to a dark lightness while keeping hue (saturation slightly reduced,
  alpha preserved). Images, video, canvas, picture, iframe and elements with a background image are skipped; svg
  content is skipped but the svg element itself is handled. The walk runs in 12 ms slices and a MutationObserver
  handles content added later. Pages are left alone when body or html already has a dark background (luminance
  below 0.4), when `meta color-scheme` is dark, or when a readable stylesheet has a `prefers-color-scheme: dark`
  rule. Known tradeoff: colours are written as inline !important styles (originals are saved and restored when the
  setting is turned off), so class or hover colour changes on remapped elements no longer show. Separate from
  "Dark pages", which only sets GeckoView's preferred colour scheme.
- #62 Search suggestions from history: `History.kt` (DB v2) gets a `searches` table and a recency plus frequency
  score. The address bar lists past searches and matching history pages; searches are recorded only when the
  toggle is on and the tab is not private. Settings > Privacy & blocking has the "Suggest from history" switch and
  "Clear suggestions", which wipes the searches table and the visit counts. All local.
- #64 Start page background: `ui/StartBackground.kt`. Choices are none, one of eight built-in gradients, a solid
  colour from a swatch row, or your own image (system picker, copied to `files/startbg.jpg`). Dim (0 to 0.9) and
  blur (0 to 24) sliders apply to all kinds. Blur is a render blur on Android 12+ and a down/upscale below that.
  The built-in "images" are procedural gradients; no raster images are bundled.
- #65 Settings are now seven tabs (a scrolling chip row): General, Appearance, Tabs, Privacy & blocking, Controls,
  Identity & mail, Updates & about. All earlier settings were moved, none dropped. Controls lists the phone
  gestures (not rebindable) plus two toggles: swipe the address bar to change tab and hide the bars on scroll.
  Keybind rebinding, vertical tabs, split tabs, the + button position and the Minecraft and hidden-mail fixes
  (#60, #63, #66 to #69) are PC only and not part of the Android build.

## Releases
- Android 0.1.1 (versionCode 2) and desktop 1.0.1 are the current builds. The in-app update check compares the installed version with the latest GitHub release served by the relay, so a release must carry a higher version than the installed one to be offered.
- Releases are published with `release.sh` (in the VPS assistant folder), which creates the GitHub releases and uploads the APK and the desktop installers.

## 1.1.0 additions
- Start page: custom quick sites (add, remove) and a switch for the automatic top sites. Stored in the helper page's localStorage. Clear (X) button in the search box. The page uses the app theme, sent by `Helper.push` as `theme`.
- Custom theme: four colours (background, text, accent, accent two) with a live preview in Settings > Appearance. It syncs through `/api/theme` on the relay, newest write wins.
- Dummy mail chip: only on sign-up pages, and hidden per site ("Dummy mail off" in the page menu). `Prefs.noDummy`.
- The "Force dark" switch is merged into "Dark pages" (`Prefs.darkPages`).
- Without a relay the start page searches DuckDuckGo.
- Search widget: hint text and shape (pill, rounded, square) are set in Settings > Appearance; colours follow the theme.

## Notebook
- Menu > Notebook (needs the relay): several text notes shared with every linked device. Switch between notes with the chips, add one with the plus chip, delete the open one with the bin button. Saves after you stop typing and checks for changes every 10 seconds. If two devices edit at once, the newer text stays and the other edit is added under it.

## Extensions (1.2.0)
- Desktop: install from the Chrome Web Store by link or ID (Electron, partial API). Android: search and install from Firefox Add-ons. On/off and remove in Settings > General.
