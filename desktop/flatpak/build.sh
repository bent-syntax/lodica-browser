#!/bin/sh
# Build the Flatpak. Needs: sudo apt install flatpak flatpak-builder, then
# flatpak remote-add --user --if-not-exists flathub https://flathub.org/repos/flathub.flatpakrepo
set -e
cd "$(dirname "$0")/.."
npm ci
npx electron-builder --linux flatpak
ls dist/*.flatpak
