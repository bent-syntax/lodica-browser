# Lodica theme plugins

Share a browser theme without touching the source code.

## Install
1. Settings > Themes > Theme plugins > Open plugins folder.
2. Copy the plugin folder in (for example `example-midnight`).
3. Reopen Settings, press Use.

## Make one
A plugin is a folder with a `plugin.json` and an optional CSS file:

```json
{
  "name": "Midnight",
  "author": "You",
  "version": "1.0.0",
  "description": "Deep blue theme",
  "vars": { "--bg": "#0b1020", "--raised": "#141b33", "--amber": "#7aa2f7" },
  "css": "theme.css"
}
```

Variables you can set: `--bg`, `--raised`, `--high`, `--mist`, `--text`, `--muted`, `--amber`, `--coral`, `--link`, `--url`, `--sub`.

## Animations
Add an optional `animations` object to `plugin.json`:

```json
"animations": {
  "pop": {
    "target": "tab",
    "duration": 300,
    "iterations": 1,
    "keyframes": { "from": { "opacity": "0", "transform": "scale(0.9)" }, "to": { "opacity": "1", "transform": "scale(1)" } }
  }
}
```

- `target`: `tab` (every tab row), `current-tab`, or `window` (the browser page). On the start page: `logo` and `start-page`.
- `duration`: 50 to 10000 ms. `iterations`: 1 to 10, or `"infinite"`. At most 8 animations and 12 keyframes each.
- Allowed properties: `opacity`, `transform`, `filter`, `background-color`, `color`, `border-color`, `box-shadow`. Values are plain CSS values without `url()`.
- Animations are skipped when the system asks for reduced motion.

## Limits
- Plugins never run code. Only CSS variables and one stylesheet (max 200 KB).
- Stylesheets cannot use `@import` or load http(s)/file URLs. Variable values cannot contain semicolons, braces, angle brackets or backslashes.
- Folder name: letters, digits, `.`, `_`, `-` (max 64).
