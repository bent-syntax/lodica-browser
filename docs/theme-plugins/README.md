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

## Limits
- Plugins never run code. Only CSS variables and one stylesheet (max 200 KB).
- Stylesheets cannot use `@import` or load http(s)/file URLs. Variable values cannot contain semicolons, braces, angle brackets or backslashes.
- Folder name: letters, digits, `.`, `_`, `-` (max 64).
