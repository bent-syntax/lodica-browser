# Lodica for iOS

SwiftUI shell around WKWebView (Apple requires WebKit on iOS). Tabs, private tabs, address bar with search, start page. Not tested on a device yet.

## Install (no jailbreak)

Apple only runs apps that are signed. The shortest route is Sideloadly on a computer:

1. Plug in the iPhone, open Sideloadly, drag `Lodica-unsigned.ipa` onto it, enter your Apple ID, press Start.

That is the whole install. Sideloadly signs the app with your free Apple ID and puts it on the phone.

First time only: on the phone, turn on Settings > Privacy & Security > Developer Mode, then trust the app under Settings > General > VPN & Device Management.

Free Apple IDs expire the app after 7 days. Repeat the same step to renew it. AltStore can renew it by itself over Wi-Fi if you leave it running on the computer.

## Get the IPA

CI builds it from `ios-build.yml`. Open the latest successful "iOS build" run under the repository's Actions tab and download the `ios-ipa` artifact. Unzip it to get `Lodica-unsigned.ipa`.
