# Lodica for iOS

SwiftUI shell around WKWebView (Apple requires WebKit on iOS). Tabs, private tabs, address bar with search, start page. Not tested on a device yet.

## Install (no jailbreak)

Apple only runs apps that are signed. The shortest route is Sideloadly on a computer:

1. Plug in the iPhone, open Sideloadly, drag `Lodica-unsigned.ipa` onto it, enter your Apple ID, press Start.

That is the whole install. Sideloadly signs the app with your free Apple ID and puts it on the phone.

First time only: on the phone, turn on Settings > Privacy & Security > Developer Mode, then trust the app under Settings > General > VPN & Device Management.

Free Apple IDs expire the app after 7 days. Repeat the same step to renew it. AltStore can renew it by itself over Wi-Fi if you leave it running on the computer.

## Update from inside the app

When a newer release exists, the app shows an "Update to x.y.z" bar at the top. Tap it and AltStore (or SideStore) opens and installs the new version. This needs AltStore or SideStore installed on the phone. Sideloadly cannot start an install from the phone, so with Sideloadly you still repeat the computer step. The bar appears only for releases that have the IPA attached. Not tested on a device.

## Get the IPA

Open the repository's Releases page and download `Lodica-<version>.ipa` from the newest release that lists one. It is attached by `ios-build.yml` after the release is published, so it can show up a few minutes later than the Android and desktop files.

Builds that are not releases: Actions tab, latest successful "iOS build" run, artifact `ios-ipa` (a zip holding `Lodica-unsigned.ipa`).
