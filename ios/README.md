# Lodica for iOS

SwiftUI shell around WKWebView (Apple requires WebKit on iOS). Tabs, private tabs, address bar with search, start page.

## Install without a jailbreak

CI builds an unsigned IPA (`ios-build.yml`, artifact `ios-ipa`). Sign it on your own computer with a free Apple ID:

1. Download the `ios-ipa` artifact and unzip it.
2. Install it with AltStore or Sideloadly. They sign with your Apple ID and install over USB or Wi-Fi.
3. Free Apple IDs expire apps after 7 days. Re-sign the same way. A paid developer account lasts a year.

On iOS 16 or later, enable Settings > Privacy & Security > Developer Mode first.
