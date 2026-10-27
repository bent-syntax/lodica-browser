# Extensions in Lodica desktop

Settings > Extensions has three ways in:

- Chrome Web Store link or 32-letter ID.
- Install from a file: `.crx`, `.zip` or a Firefox `.xpi`. Lodica lists the permissions and asks before it installs.
- Load an unpacked folder: any folder with a `manifest.json`. It is copied into Lodica, so install again after you change it.

Lodica runs only part of the Chrome extension API. An extension that needs Firefox-only APIs (`browser_specific_settings`-only features, `browser.*` extras) will not load and the install shows "Not supported here".

## Make your own

A minimal extension that changes every page:

```
my-ext/
  manifest.json
  content.js
```

```json
{
  "manifest_version": 3,
  "name": "My extension",
  "version": "1.0.0",
  "content_scripts": [{ "matches": ["https://*/*"], "js": ["content.js"] }]
}
```

```js
document.body.style.outline = "2px solid #F59E0B";
```

Load the folder from Settings > Extensions. Android runs Firefox WebExtensions through GeckoView.
