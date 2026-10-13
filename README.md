# Lodica

A privacy-focused browser for Android (GeckoView) and desktop (Electron), with vertical tabs, editable keybinds, customizable gestures, a built-in PDF viewer, ad blocking and a custom start page.

![Setup overview](docs/img/overview.svg)

| Folder | What it is |
| --- | --- |
| `android/` | Android app (Kotlin, Jetpack Compose, GeckoView). Package id `be.syntaxya.lodica`. |
| `desktop/` | Desktop app (Electron). |

Both apps share one version number. Everything works without a server. A relay is only needed for the optional hidden email, tab sharing and search features. The relay lives in `relay/` in this repository.

## Android

Requirements: JDK 17, Android SDK (platform and build-tools for the version in `android/app/build.gradle.kts`).

![Android build steps](docs/img/android-build.svg)

```bash
git clone <this repository>
cd lodica-browser/android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/*.apk
```

Release builds need your own signing key: create `android/keystore/lodica.jks` (alias `lodica`) and run
`LODICA_KEYSTORE_PASS=<password> ./gradlew assembleRelease`. The `keystore/` folder is gitignored.

## Desktop

Requirements: Node.js 20 or newer.

![Desktop build steps](docs/img/desktop-build.svg)

```bash
cd lodica-browser/desktop
npm ci
npm start             # run from source
npm run dist:linux    # AppImage and deb in dist/
npm run dist          # Windows installer (untested)
```

## Optional: connect a relay

![Relay overview](docs/img/relay.svg)

The relay is a server you host yourself (code in `relay/`). You need a Debian or Ubuntu VPS and a domain with a wildcard DNS record (`*.example.com`) pointing at the VPS. Then run, as root on the server:

```sh
curl -fsSL https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh | sudo bash -s -- example.com
```

It installs Node and the relay, gets a certificate, and prints a token. The relay has its own TCP ports, **44741** (API) and **44742** (tunnel), and never touches ports 80/443 or an existing web server. It opens those two in ufw only. Open them in your host's web firewall too if it has one.

The certificate comes from Let's Encrypt through [acme.sh](https://github.com/acmesh-official/acme.sh). If port 80 is free it works by itself. If you already run a web server on 80, use one of these (the variables go through `sudo env`):

```sh
# DNS validation, no ports needed (any acme.sh DNS plugin, here Cloudflare)
curl -fsSL https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh | sudo env LODICA_ACME_DNS=dns_cf CF_Token=xxxx bash -s -- example.com
# no DNS API: LODICA_ACME_DNS=manual prints TXT records to add, then run the same command again
# or your own certificate for lodica.example.com and tunnel.example.com
curl -fsSL https://raw.githubusercontent.com/bent-syntax/lodica-browser/main/relay/deploy/install.sh | sudo env LODICA_TLS_CERT=/path/fullchain.pem LODICA_TLS_KEY=/path/key.pem bash -s -- example.com
```

Set `LODICA_API_PORT` / `LODICA_PROXY_PORT` to use other ports (the apps expect the defaults). Running it again updates the relay and keeps the token. The app's setup wizard shows this same command with your domain filled in. To link the apps:

- **Android:** open the setup wizard from Settings, enter your domain, then paste the token.
- **Desktop:** run `LODICA_API=https://lodica.<domain>:44741 LODICA_DOMAIN=<domain> LODICA_TOKEN_FILE=./relay-token npm run config`. This writes the gitignored `desktop/config.json`.

Without a relay these features stay hidden and the browser works normally.

## Notes

- Never commit `config.json`, `relay-token`, `keystore/` or `*.env`. They are gitignored.
- Feature list: `android/FEATURES.md`, `desktop/FEATURES.md`. Patch notes: `*/PATCH_NOTES.md`.
- Only the Android build was compiled here. The Windows build and real-device behavior are untested.

## License

MIT.
