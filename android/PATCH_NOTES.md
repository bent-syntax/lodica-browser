# Patch notes

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
