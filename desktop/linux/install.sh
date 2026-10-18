#!/bin/sh
# Lodica Linux installer. Run again to update: the old version is removed first.
# Usage: sh install.sh [--uninstall] [path/to/Lodica.AppImage]
set -eu

REPO="bent-syntax/lodica-browser"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/lodica"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
BIN_DIR="$HOME/.local/bin"
DESKTOP="$APPS_DIR/lodica.desktop"

refresh() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
}

remove_old() {
  rm -rf "$APP_DIR" "$DESKTOP" "$ICON_DIR/lodica.png" "$BIN_DIR/lodica"
}

if [ "${1:-}" = "--uninstall" ]; then
  remove_old
  refresh
  echo "Lodica removed."
  exit 0
fi

case "$(uname -m)" in
  x86_64) ;;
  *) echo "Only x86_64 is supported." >&2; exit 1 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -n "${1:-}" ]; then
  cp "$1" "$TMP/Lodica.AppImage"
else
  command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
  URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -n1 | cut -d'"' -f4)"
  [ -n "$URL" ] || { echo "No AppImage found in the latest release." >&2; exit 1; }
  echo "Downloading $URL"
  curl -fL --progress-bar -o "$TMP/Lodica.AppImage" "$URL"
fi

chmod +x "$TMP/Lodica.AppImage"
(cd "$TMP" && ./Lodica.AppImage --appimage-extract >/dev/null)

remove_old
mkdir -p "$APP_DIR" "$APPS_DIR" "$ICON_DIR" "$BIN_DIR"
mv "$TMP/squashfs-root/"* "$APP_DIR/"

ICON_SRC="$(find "$APP_DIR" -maxdepth 1 -name '*.png' | head -n1)"
[ -n "$ICON_SRC" ] && cp "$ICON_SRC" "$ICON_DIR/lodica.png"

cat > "$BIN_DIR/lodica" <<EOF
#!/bin/sh
exec "$APP_DIR/AppRun" "\$@"
EOF
chmod +x "$BIN_DIR/lodica"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Lodica
Comment=Lodica browser
Exec=$APP_DIR/AppRun %U
Icon=lodica
Terminal=false
Categories=Network;WebBrowser;
StartupWMClass=Lodica
EOF

refresh
echo "Lodica installed. Find it in the app drawer, or run: lodica"
