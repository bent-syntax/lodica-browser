## 1.17.16

- The toolbar no longer drops down and snaps back when you leave the Settings tab (commit 3fc6201). I only syntax-checked it and haven't tried it in a live window. `npm test` crashes with `(r.stdout + r.stderr).split is not a function`, so the tests didn't run. `graphify` isn't installed here, so I di

## 1.17.15

- Compat mode and per-site permissions can already be set by hand on both mobile and desktop, and Google sign-in pages are forced into compat mode on both. I changed no code for this item.

## 1.17.14

- Motion redesign. Desktop: one easing curve and three durations (120, 180, 240 ms) for every transition, exit animations for dialogs, menus, suggestions, toasts and sheets, cards lift on hover and buttons press down, all animations off under reduced motion. Android: the same three durations for tab switcher, bottom bar, settings, kite and appearance, so every screen moves the same way.

## 1.17.13

- All 20 items were already implemented in the code (90% tab cap, narrower open tab, themed window controls that dim with the menu, `lodica://settings` as a closeable tab, a 360px docked support chat, full-area pages, forced compat for Google sign-in, a mobile compat toggle, per-site Allow/Block/Ask, 

## 1.17.12

- `lodica://settings` now opens Settings as a closeable tab and the address stays without the trailing slash (fix is in `desktop/main/tabs.js`, not built or run). The full-page layout, docked support chat and kept support draft were already on `main` from earlier commits (`4fc80fb`, `315046d`, `a099e1

## 1.17.11

- Settings opens as a tab from `lodica://settings`, pages fill the whole area with no edge padding, the support chat docks on the right like the AI panel, and unsent support text, images and category now survive switching away and back.

## 1.17.10

- Mobile and desktop already have the manual controls — the mobile site sheet (tap the lock) has a Compatibility mode switch and per-site Allow/Block/Ask permission rows. The earlier rounds covered the rest: 90% tab width, `lodica://settings` opening as a tab without a trailing slash, chat docked like

## 1.17.9

- Tabs in the desktop tab bar now shrink so together they take at most about 90% of the window width, and typing `lodica://settings` in the address bar opens Settings.

## 1.17.8

- Added a setting to turn off RAM saving tab unloading.

## 1.17.7

- Settings, notebook and chat cover the whole window. Close button works.
- Removed the light-blue ring around the active tab.

## 1.17.6

- The search button on the new tab page shows its icon again.

## 1.17.5

- The close button in settings, notebooks and server chat works again.

## 1.17.4

- Settings, notebooks and server chat now have a close button, and notebooks can be removed. The chat avatar no longer overlaps the name. Private tabs no longer show among normal tabs. The planner no longer flashes on a new tab when it is turned off. The draw and move toolbar matches your theme, and drawings appear as soon as a page loads. A shortcut that would show only a letter now uses the parent domain logo. New Grid menu setting brings back the grid menu at the bottom.

## 1.17.3

- The buttons on the draw and move toolbar work again, and the colour you pick is used for new strokes.

## 1.17.2

- The AI panel follows the theme. Hidden mail addresses can be rerolled. Draw and move keybinds no longer fail silently.

## 1.17.0

- New look: frameless window, a quieter tab strip, new menu and site-protection popovers, and restyled settings, search page and dialogs. The shield opens the site-protection popover.

## 1.16.2

- Fixed: "Draw on tab" and "Move page part" are now in Settings → Shortcuts. Rebind or reset them there.

## 1.16.1

- Fixed: Ctrl+Shift+D (draw) and Ctrl+Shift+M (move) now work whichever part of the window has focus.

## 1.16.0

- New: Draw on a page. Press Ctrl+Shift+D for a tools bar with pen, highlighter, eraser, colour, size, undo and Erase from tab. The page still scrolls and the drawing stays put on the page. Drawings come back after a reload or when the tab is reopened. Private tabs do not save them.
- New: Press Ctrl+Shift+M and drag any spot on the page to move it. Moves are saved the same way and also cleared by Erase from tab.

## 1.15.21

- Fixed: Shop no longer shows "No offers match these filters" when saved shop picks from an earlier search match none of the new shops.

## 1.15.20

- Fixed: Shop item images load for lazy, protocol-relative and escaped image URLs.

## 1.15.19

- Fixed: Google sign-in is no longer blocked as an insecure browser.
- Fixed: Search suggestions no longer overflow the box.
- Fixed: Translate searches show the translate widget.
- Fixed: Lock popup toggles look right and the menu opens on the right.
- Changed: Search results are cached for 60 seconds on the relay.

## 1.15.18

- Fixed: Shop shows a Clear shop filters button when saved filters hide every offer.

## 1.15.17

- Fixed: Shop bar buttons line up on narrow windows.
- Changed: Search ranking and parsing start moving to a Rust core, with a JS fallback.

## 1.15.16

- Fixed: Shop tab loads items again.
- Fixed: Settings no longer keep reloading.
- New: Unlock passwords and authenticator with "PIN or phone". A popup tells you to verify on your phone, with a Use PIN button.
- Changed: Passwords and authenticator lock again 30 seconds after unlocking.

## 1.15.15

- Fixed: Quick results work with Dutch phrasing (timer, dice, random number, leap year, dates).
- New: Typing "translate" or "vertaal" shows a quick translate card.

## 1.15.14

- Fixed: Changing the vault PIN needs the old PIN, and five wrong PIN tries lock the vault for 30 seconds.
- Fixed: Support messages, data meter and AI agent step limit reject bad values.
- Fixed: Safer checks on data sent from pages, the relay and settings.

## 1.15.13

- Fixed: The AI agent keeps your goal in every step, so it no longer says "no task received".
- Fixed: The desktop AI panel follows the browser theme.

## 1.15.12

- Added: Shop has a "Search in" category picker. Your search word is searched inside that category.
- Added: The AI agent step limit is a setting. Set any number of steps.
- Fixed: The desktop Shop fills the window width and the sort and view buttons sit together.

## 1.15.11

- Changed: Shop features sit in a left column as tick lists with counts, and results fill the right with a sort bar and list or grid.
- Changed: On phones the features slide in from the right and close with an X or a tap outside.
- Changed: The desktop AI panel follows the theme fonts and colours.
- Fixed: The phone AI panel fills the screen width, also with the keyboard open.

## 1.15.10

- Changed: Shop shows review and spec links from several sites in place of one, with prices from the Belgian price comparison.
- Added: Shop filters sit on the right on desktop, and results switch between list and grid.
- Added: On phones the Shop filters fold away behind a three-line button that turns into an X.
- Fixed: A tab left idle for a while no longer comes back black.

## 1.15.9

- Added: Shop filters like a price comparison site: show or hide shops, shop rating, and counts next to every option.
- Added: Shop can include second hand and refurbished offers from second hand sellers, marked Second hand.
- Changed: The Shop condition switch picks new only, both, or second hand only.

## 1.15.8

- Fixed: The desktop Notebook opens and creates a first note without needing the phone.
- Fixed: The start page search now redirects like the address bar, including search words and the chosen engine.
- Fixed: The Android address bar keeps the cursor where you tap it.
- Changed: Shop lists Tweakers links and takes Belgian prices from Vergelijk.
- Changed: The site language is now Nederlands (België), so Belgian sites show in Dutch.

## 1.15.7

- New: Shop offers spec pickers for the product type, such as RAM, CPU and GPU for laptops or size and panel type for TVs.
- Fixed: Shop shows a clear message when the relay does not have Shop yet.
- Changed: The AI panel on Android is shorter and keeps its width.

## 1.15.6

- New: Shop tab in Lodica Search. Pick your country, price range and features to compare prices at trusted shops, cheapest first.
- New: Characters are made from a prompt and an optional sketch, no longer human by default, with separate idle, active and typing poses.
- Fixed: The AI panel header on Android no longer looks broken.
- Fixed: Read aloud uses a speaker icon instead of an emoji.

## 1.15.5

- Fixed: Selected text in PDFs offers Translate and Read aloud, and read aloud works for long selections.

## 1.15.4

- Fixed: The AI panel input stays above the keyboard on mobile.
- Fixed: Tapping the mobile search bar keeps the keyboard open until you press back.
- Fixed: Backspace removes one letter at a time, and Ctrl+Backspace removes a word, in the address bar.
- Fixed: The download animation ends at the bottom of the window and no longer clips through the folder.
- New: Pelckmansportaal signs in by itself with your saved login.
- Fixed: Reader mode works on script-rendered pages such as Pelckmansportaal.
- New: Selecting text offers a read-aloud button that detects the language.

## 1.15.3

- Fixed: The desktop translate bubble works again with the new language picker.

## 1.15.2

- New: Select a formula and the page offers rearranged forms of it.
- New: The translate bubble lets you pick any target language and detects the source language when it is unknown.

## 1.15.1

- Fixed: When the AI will not draw your character, your current character stays and you get three other wordings to try. It no longer falls back to an emoji.

## 1.15.0

- New: Shortcut logos on the start page have their background removed.
- New: AI custom themes can now set colours and textures per element: page background, search bar, tabs and shortcut tiles.

## 1.14.60

- Fixed: The in-browser AI now has the permission level choice (Read only, Plan, Edit, Full auto) right inside the AI panel, so you no longer need to open Settings.
- Fixed: Runs with the in-browser AI are now saved to the chat history, and a New chat button starts a fresh session.
- Fixed: Follow-up questions in the same AI session now remember what the AI said and did earlier.

## 1.14.59

- New: Instant answers on Lodica Search. Searching "speedtest" shows a speed test button, "what day is it today" shows the date and week, "when is Christmas" counts the days, and there are cards for timers, stopwatch, calculator, unit conversion, currency, weather, time in another city, moon phase, calendars, dice, coin flip, random number, colour picker, roman numerals and leap years. Currency and weather are skipped in private tabs.
- New: Describe a custom theme to the linked AI and it builds one with your own colours and tab textures (dots, stripes, grid, paper, waves). Tab text and tab edge colours can be set too.
- New: Permission levels for the AI that controls the browser. Read only never clicks or types. Plan shows a short plan you approve first. Edit asks before typing and before risky clicks. Full auto never asks. Password fields, non-web pages and the 20 step limit stay in force at every level. Pick the level in Settings and see it in the AI panel.

## 1.14.57

- Fixed: Costume characters no longer fall back to emojis after the server is updated or restarted. The app asked the server once, got "not found" from an older server, and never sent the costume again until you restarted the app. It now tries again every few minutes.

## 1.14.56

- Fixed: Other people's characters now really hold the top of the typing bar. Their hands sit on the edge of the message field instead of floating above it.

## 1.14.55

- Fixed: The same person now looks the same on every device. The character is shared between your linked devices (Settings > Linked devices > Chat character), so a new phone or PC takes over your character instead of making its own.
- Added: Other people's characters grip the typing bar with their hands while they are in the chat, and a thinking bubble floats above them while they type. The AI you linked draws the hands and the bubble to match the costume.
- Fixed: "Seen by" now sits under the newest message each person has read, whoever sent it. If your PC read up to three messages back, everyone sees it under that message.
- Fixed: Notes are no longer shared through the server. They stay on your device and sync only with your linked devices (Settings > Linked devices > Notes). Old notes on the server are not imported. The server needs the newest update for the character and typing parts.

## 1.14.54

- Added: Characters in the server chat are now costume drawings made by the AI you linked in Settings (API key, Hearth or Claude). Without a linked AI you keep the emoji or drawn avatar. Describe a costume under your character button to change yours. The server needs the newest update to share the drawings with others.

## 1.14.53

- Fixed: The server chat now shows the top half of each online user's character above the typing bar, bigger and without a circle behind it. "Seen by" now shows the character of the person who saw your message, not the old drawn avatar.

## 1.14.52

- Changed: The server chat now shows only the other online users, as half characters peeking over the typing bar. Tap one to see the full character and open a private chat. "Seen by" now shows only under your last sent message.

## 1.14.51

- Fixed: The online characters in the server chat now show above the typing bar on desktop and Android, and the "Seen by" mark is sent again after a server restart.

## 1.14.50

- Fixed: After the server restarts, the chat on desktop and Android now reloads instead of silently missing new messages.

## 1.14.49

- Fixed: "Seen by" now works after the server restarts and when you switch chats (Android remembered one read mark for all chats), so read marks and online characters show up again.

## 1.14.48

- Added: Make your own costume character: click your character in the server chat strip, describe it, and the AI makes it. Everyone sees it; empty text goes back to the automatic one.

## 1.14.47

- Fixed: Version kept in step with Android; no desktop changes.

## 1.14.46

- Fixed: Version kept in step with Android; no desktop changes.

## 1.14.45

- Added: Server chat shows "Seen by" names under the last message each person has read.
- Added: Online list shows a drawn character per username, an OS badge and an online dot. You are listed first.

## 1.14.44

- Added: Online list character: the linked AI picks one emoji for your username, made again when the name changes and once when the AI is first linked. Others see it through the server.
- Changed: No other desktop change in this release.

## 1.14.43

- Changed: No desktop change in this release.

## 1.14.42

- Changed: No desktop change in this release. Hearth and the page assistant (Ctrl+Shift+L) were already in place.

