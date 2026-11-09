# Patch notes

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

- New: Shortcut tiles show the site logo with its background removed. Dark logos sit on a light tile so they stay visible.
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

- Added: Make your own costume character: click your character in the server chat strip (tap on Android), describe it, and the AI makes it. Everyone sees it; empty text goes back to the automatic one, and without any AI the operating system badge shows.
- Fixed: Your own character now shows in the Android chat strip.

## 1.14.47

- Added: Start page notes on Android: a movable, resizable window showing your Notebook note with a quick-add line.
- Added: Your online character on Android can be picked by the AI and is shared with the server chat.

## 1.14.46

- Added: Start page planner on Android moves and resizes like a window: drag the title, drag the grip, double tap the title to reset.
- Changed: Removed the duplicate theme preview below the theme list in settings.

## 1.14.45

- Added: Server chat shows "Seen by" names under the last message each person has read.
- Added: Online list shows a drawn character per username, an OS badge and an online dot. You are listed first, and the list is always visible.

## 1.14.44

- Added: The server chat people strip shows the character the linked AI picked for each username.
- Fixed: Start page shortcut logos retry loading after a failed fetch instead of staying a letter.
- Changed: Custom theme tab and start page colours now apply on Android.

## 1.14.43

- Fixed: Pause, resume and cancel buttons for running downloads. Cancel removes the partial file.

## 1.14.42

- Added: Hearth provider for Ask AI and chats. Settings, AI, "Hearth address and key". The key is stored encrypted and sent only to your address.

## 1.14.41

- Changed: No Android change in this release; the emoji picker Add button is desktop only.

## 1.14.40

- Added: Custom themes can now set danger, raised, high and muted colours on Android; they sync with the desktop theme. Tab and start page background colours are kept and synced but not painted on Android yet.
- Changed: Danger buttons and warnings follow the theme danger colour.

## 1.14.39

- Added: On Android you can pick which Notebook note the start page Notes card shows (Settings, Notes, Notes notebook), and type a quick note line into it from the start page.
- Added: A chat text size setting on Android (Settings, Chat text size, 80 to 250 percent), matching the desktop.
- Changed: Chat images on Android now load by themselves at their real aspect ratio, with a download icon in the top right corner.
- Changed: Free dragging and resizing of the planner and notes windows already exists on desktop; the Android start page still uses the fixed positions.

## 1.14.38

- Fixed: The planner on the Android start page now shows straight away after the app starts, using the last downloaded calendar while the new one loads.

## 1.14.37

- Added: Every device that has read a message now shows its own icon under that message, so you can see who has seen what. Changed: The people list in the chat shows the icon of each device's system (Windows, macOS, Linux, Android, iPhone).

## 1.14.36

- Added: Make an extension with the AI on the phone (Settings, Extensions): describe it, the AI writes the files, and you check its permissions before it is added. Changed: AI emojis now pick the most recognisable view and include the iconic parts (a hot dog shows the bun, sausage and mustard). The download animation now starts where you clicked or touched and drops the file into a folder in your theme colours, shaped like the folder of your system (Windows, macOS, Linux or Android).

## 1.14.35

- Fixed: The online list in the server chat only shows people who have the chat open right now, with the right device name. AI-made emojis are drawn cleaner (bold outline, fewer colours, no thin details). The relay must be updated for the online list

## 1.14.34

- Fixed: Saved theme names on the phone are no longer cut off (long names wrap to two lines). The phone now plays a custom theme's animation on the start page

## 1.14.33

- Added: Make an extension with the AI (Settings, Extensions on the PC): describe what it should do, the AI writes the extension files, and after you check its permissions it is installed in the browser

## 1.14.32

- Added: Log in your own email address (Inbox, Addresses) to get a forwarding address. Forward login mails from your email to it and the login code is filled into the open tab. Works on phone and PC. The relay must be updated for this

## 1.14.31

- Added: The AI theme maker can make a theme with a light and a dark version that follows the system theme, and can add an animation (pulse, glow, drift, float or shimmer) on the PC start page and search page. The phone keeps and syncs both, and follows the system light or dark; it does not play the animation yet

## 1.14.30

- Changed: Saved themes and holiday themes now show as swatches like the other themes (background with two colour dots). Holiday themes moved to the bottom of the theme settings

## 1.14.29

- Added: Saved themes: name and keep your own and AI-made themes, use or delete them later, synced between phone and PC

## 1.14.28

- Changed: Settings tidied: one-item sections merged, search widget moved to Start page, holiday themes use a normal switch row

## 1.14.27

- Fixed: Launcher icon now matches the app theme, also for custom and wallpaper themes

## 1.14.26

- Fixed: Link watcher no longer polls in a loop when the server is older

## 1.14.25

- Fixed: Linking updates within seconds: tabs, authenticator keys, passwords, settings and theme sync as soon as the other device changes them

## 1.14.24

- Added: Server chat shows who is online with their device and name, and a "Seen" line under your last message
- Added: Themes refresh the start page when changed, and the Linux system theme follows the desktop
- Added: The download animation uses the theme colours and starts at the cursor
- Fixed: The mouse back button went back two pages
- Fixed: The toolbar download button shows the download arrow again
- Fixed: On Linux an update replaces the running AppImage instead of adding a new one
- Fixed: Tabs flickering on desktop
- Fixed: Phone shortcuts now show the site logo more often, and a hidden toolbar no longer blocks taps
- Fixed: The phone settings show one theme preview
- Fixed: The fallback search engine is available on Linux
- Changed: The planner on the start page is off by default
- Changed: AI server emojis are simpler and keep their shapes inside the picture

## 1.14.23

- Fixed: The device that shows a link code now always becomes the owner of the link. Before, two devices could both end up reading data nobody wrote, so tabs, authenticator keys and passwords did not show on the other device
- Fixed: Settings > Link refreshes the key status when the other device changes the link

## 1.14.22

- Fixed: Linking no longer makes a new link key on the device that confirms. A device without a key now tells the other one, which keeps or makes its own key
- Fixed: A different link key on the two devices is now always shown, also when nothing protected was sent yet
- Fixed: On the phone, a link key that cannot be read right after start is no longer replaced by a new one

## 1.14.21

- Changed: Version kept in step with the desktop app. No changes on the phone in this release

## 1.14.20

- Changed: Version kept in step with the desktop app. No changes on the phone in this release

## 1.14.19

- Fixed: The link key now moves to a new device however it was linked, also with a pasted link, not only with a code
- Fixed: An old request for the link key on the server no longer blocks a new one
- New: "Get key from the other device" in Settings > Linked devices. Every linked device can answer it, not only the one that showed a code
- Fixed: When sending to the linked device fails or there is too much to send, Settings now says so instead of stopping silently

## 1.14.18

- Fixed: Authenticator keys and passwords from the phone now show on the PC. Sharing them was switched off on phones that linked before 1.14.17, so it is switched on once
- Fixed: Adding or removing an authenticator key now sends it to the linked device right away

## 1.14.17

- Added: Choose which device the theme comes from in Settings > Linked devices: the newest change, this device or the other device
- Changed: Passwords and authenticator keys are shared by default and merged both ways, so both devices show the ones from the PC and the phone
- Fixed: When the two devices hold different link keys, Settings now says so instead of asking for a key this device already has
- Added: The link key row shows a four-digit key number. Both devices show the same number when they share the key

## 1.14.16

- Fixed: Starting a support test session on PC no longer says support is not reachable

## 1.14.15

- Added: Start page shortcuts are circles with the site logo and the name below. A setting shows or hides the names
- Added: Site notifications show as system notifications on Android and as desktop notifications on PC
- Added: Per-site permissions list in Settings under History & site data > Site permissions, with notifications, camera, microphone and location
- Added: Download animation: a folder opens, a sheet of paper drops in and the folder closes
- Added: Linked devices share settings and theme
- Changed: Desktop and Android Settings use the same pages and sections in the same order
- Changed: Android tab switcher shows the real site icons
- Fixed: Shortcuts load the real site icon instead of a letter
- Fixed: The Android updater removes old update files, and the desktop updater also removes half-finished downloads
- Fixed: Vertical tab strip and version text no longer get cut off in Settings

## 1.14.14

- Added: Link devices by entering the linking code, then confirm the code on the other device. They swap a secret key that only opens shared passwords and authenticator codes, which stay encrypted on the server
- Added: Search words in Settings: type a word like youtube in the address bar to go to a chosen site
- Added: Typing on the start page goes into the search bar
- Changed: The key file is gone
- Changed: Passwords are under Privacy and history on the PC, and the settings tab is called Link
- Changed: The Android Settings no longer show the raw link text
- Fixed: Start page shortcuts show the site icon
- Fixed: Vertical tabs no longer show a dark square at the bottom
- Fixed: The version number is no longer cut off in Settings
- Fixed: Updates replace the older downloaded installer or AppImage instead of piling up in Downloads
- Fixed: Linking devices shares your settings and theme again
- Fixed: Open tabs on Android show a proper icon for local sites and Lodica Search

## 1.14.13

- Added: Unlock the passwords on the PC with the PIN, the link key, your phone, or the key and phone together
- Added: Open a .lkey file on the phone and confirm to inject the key
- Added: Turn the planner off on the start page
- Fixed: Passwords from the phone show on the PC, and the other way, without switching on the share toggle first
- Fixed: Inserting a key refreshes the link at once
- Fixed: What's new no longer cuts off long lines
- Fixed: Two-finger swipe back and forward on Linux
- Fixed: Black page when the browser opens on Android

## 1.14.12

- Fixed: The Windows installer no longer hangs while removing older Lodica installs

## 1.14.11

- Added: Android has the link settings: what to share, link key, passwords and authenticator
- Changed: "Let support connect for testing" is a hidden setting and needs a code kept on the server
- Changed: Settings use the same pages, groups and order on desktop and Android
- Changed: Tilt fills the whole screen with no border
- Fixed: The test session no longer crashes the phone
- Fixed: Pages no longer flash white when going back or forward with force dark on

## 1.14.10

- Added: Remote test session. Turn on "Let support connect for testing" in Settings, press Start and read the code to support. Support can then tap, swipe, scroll and flip a few settings inside the app. A bar stays on screen with a Stop button, your settings are saved first and put back after, and it ends by itself after 15 minutes. No vault, passwords or files
- Added: Android emoji size setting
- Added: Attach images to support tickets
- Added: The contact form asks for a reason (bug, idea, question, other)
- Added: The support window is full screen
- Added: Android toolbar AI button opens the agent
- Changed: New download animation
- Changed: When support marks your request fixed, the old support chat clears and closes, and the last message stays visible
- Fixed: Desktop swipe has no dead zone and the charging arrow shows

## 1.14.9

- Added: AI browser agent on Android. The toolbar AI button opens a phone-shaped panel on the right. The AI opens pages, clicks, types and scrolls for you, the page glows while it works, risky clicks ask first, and you can minimize it without stopping, open older chats or go full screen
- Changed: Every holiday theme now has its own look: snowflakes, tumbling confetti, flapping bats, floating hearts, clovers and fluttering Belgian flags

## 1.14.8

- Added: Make your own theme with the linked AI (for example a Minecraft theme) in the custom theme editor
- Added: Holiday themes for St Patrick's Day and Belgian National Day, each with its own effect

## 1.14.7

- Removed: The tabs link for linking devices; use the link code

## 1.14.6

- Added: Holiday themes (New Year, Valentine, Halloween, Christmas). Claim one from a week before to a week after the holiday, then keep it for good. Each has its own effect: snow and confetti pile up and can be pushed off, bats and hearts drift past. Toggle in Settings > Appearance
- Added: Selecting two or more functions graphs them together; with two, the points where they meet are marked

## 1.14.5

- Added: Tilt rotate: turn your phone and the page turns the other way so it stays upright. Switch it on in Settings or the menu. Dead zone and zoom can be set. Restart the browser once after switching it on

## 1.14.4

- Changed: Maintenance release, desktop only

## 1.14.3

- Changed: Maintenance release, desktop and server only

## 1.14.2

- Changed: The start page planner shows today and the next day with lessons, and moves on once today's last lesson is over
- Fixed: Signing in to Smartschool with Microsoft starts at once
- Changed: Emojis drawn by AI look like polished Apple-style emoji with gradients and highlights
- Changed: Server emojis are stored sharper (256 px), so they look better when sent to Snapchat

## 1.14.1

- Changed: Maintenance release, desktop only

## 1.14.0

- Added: Setting to translate selected French or Dutch text into English next to the selection, with a Copy button (Settings > Privacy > Translation)
- Changed: Desktop touchpad swipe fix

## 1.13.58
- Changed: Maintenance release, desktop only

## 1.13.57
- Changed: Maintenance release, desktop only

## 1.13.56
- Changed: Maintenance release, desktop only

## 1.13.55
- Changed: Maintenance release, desktop only

## 1.13.54
- Changed: Maintenance release, desktop only

## 1.13.53
- Changed: Maintenance release, desktop only

## 1.13.52
- Changed: Maintenance release, desktop only

## 1.13.51
- Changed: Maintenance release, desktop only

## 1.13.50
- Changed: Maintenance release, desktop only

## 1.13.49
- Changed: Maintenance release, desktop only

## 1.13.48
- Changed: Maintenance release, desktop only

## 1.13.47
- Changed: Maintenance release, desktop fixes only

## 1.13.46
- Fixed: Dark mode now works on Android 17 phones

## 1.13.45
- Fixed: Dark mode alone now darkens pages that have no dark mode of their own

## 1.13.44
- Fixed: Support window no longer shifts when the keyboard opens

## 1.13.43
- Fixed: Support window stays at the top while typing

## 1.13.42
- Fixed: Dark mode on mobile

## 1.13.41
- Fixed: Support screen no longer jumps up and down while typing
- Fixed: A new message after a fixed request starts a new support thread

## 1.13.40
- Fixed: 2 finger swipe to go back

## 1.13.39
- Fixed: Auto fillin password

## 1.13.38

- Added: Planner items starting with "Afwerkingsopdracht:" now count as tasks (yellow), like Huistaak and Meebrengen

## 1.13.37

- Fixed: The Generate an AI answer button now shows on Lodica Search results; the app config reached the helper too late or not at all

## 1.13.36

- Fixed: The Generate an AI answer button and AI answers now show on Lodica Search results when an AI key is set

## 1.13.35

- Fixed: Phone no longer jumps to the desktop site after you chose mobile (the Minecraft desktop mode was sticking to tabs)
- Fixed: Touchpad two-finger sideways swipe now counts small up/down wobble, so back and forward trigger reliably

## 1.13.34

- Version bump to match desktop

## 1.13.33

- Fixed: Two fingers sideways on a touchpad goes back or forward again, with an arrow at the edge
- Fixed: Saving an API key on some Samsung phones, so Ask AI shows up

## 1.13.32
- Fixed: Api search

## 1.13.31
- Fixed: Server chat emojis on Android are bigger, and Android syncs server emojis every time the chat opens

## 1.13.30
- Fixed: Ask AI now switches on when you connect a key or Hearth, and for people who were already connected
- Fixed: Server chat emojis are bigger and sync every time the chat opens
- Added: Adding a server emoji removes a plain background around the picture

## 1.13.29
- Added: AI can browse for you: a new button in the AI sheet lets it open pages, click, type and scroll, with a Stop button and a confirmation before risky clicks
- Added: Planner and notes keep clear of the search bar and can be resized from every edge and corner
- Added: The active tab is easier to see and dragging a tab shows where it will land
- Fixed: Emoji add button layout, and Enter now adds the emoji
- Fixed: Start page shortcuts are round
- Fixed: Custom theme now also colours the start page search box
- Fixed: Choosing a theme no longer leaves Custom selected, so it stays after a restart
- Fixed: Notes on the start page show the full text

## 1.13.28
- Added: Install Firefox extensions from an .xpi file
- Fixed: Smartschool clicks Microsoft after More

## 1.13.27
- Changed: Round start page shortcuts; dark mode and force dark mode are separate settings

## 1.13.26
- Added: New features request

## 1.13.25
- Changed: The files to host your own support desk are no longer published; support stays with the Lodica team

## 1.13.24
- Fixed: The phone app failed to build because of the control setup file; phone control from the desktop now installs

## 1.13.23
- Added: Control your phone from the desktop while you share its screen: click to tap, drag to swipe, and Back, Home, Recent apps and Notifications buttons (turn on "Allow control from the browser" in the phone's Server settings)
- Added: Surprise: tick off the last task or test of a day in the planner and it throws confetti

## 1.13.22
- Fixed: The time line on the planner sits above the first item of the next lesson, not below it
- Changed: A lesson with tests and tasks is coloured by share: 2 tests and 1 task is 2/3 red and 1/3 yellow

## 1.13.21
- Added: Tasks and tests show inside the lesson they belong to: yellow for a task, red for a test
- Added: Tick off a task or test in the planner; its text hides but the colour stays until you tap the lesson
- Changed: The current time shows on the line in the planner

## 1.13.20
- Added: Planner shows from-to hours per lesson, and tapping a lesson shows more about it
- Added: A line on the planner shows the time: above the next lesson, or inside the current one
- Changed: Adding a server emoji removes a plain background
- Fixed: Extension options window no longer closes when you click away
- Fixed: Claude in the browser shows the real error

## 1.13.19
- Added: Planner on the start page, with a box around every subject and a grip to show more lessons
- Changed: Planner widget shows up to 12 lessons when resized, tasks and tests get a coloured box
- Fixed: Claude in the browser extension timing out
- Fixed: Patch notes and update mails now use plain wording

## 1.13.18
- Added: Smartschool planner widget

## 1.13.17
- Added: Choose where the Smartschool planner sits on the start page

## 1.13.16
- Added: Choose where the Smartschool planner sits

## 1.13.15
- Fixed: The search engine gives outdated websites and an outdated vibe

## 1.13.14
- Fixed: Contact support now needs a linked email for every message, including replies
- Fixed: Update check no longer fails with 403 when GitHub blocks the API

## 1.13.13
- Changed: Contact support now asks you to link your email before you send a new request

## 1.13.12
- Added: Link your email in Contact support to get updates by mail and to send requests by email

## 1.13.11
- Added: View and control a linked phone screen from the desktop browser
- Fixed: Tabs missing from the tabs menu on some phones
- Fixed: Notebook showed "Can't reach the server" while connected

## 1.13.10
- Fixed: Some sites stayed dark after turning dark mode off
- Added: The server emojis should be visible in every app or program as long as your connected to the server 
- Added: Notities in the browser that sync with your linked devices and you can type equations and functions 
- Fixed: Notebook showed "Can't reach the server" while connected

## 1.13.9
- Fixed: Notebook Can't reach the server

## 1.13.8
- Fixed: Notebook showed "Can't reach the server" while connected

## 1.13.7
- Added: There should be a notebook that is synced with your linked devices
- Added: You should be able to have multiple different notes in your notebook
- Added: When you select any thing math related in the notebook is should use the already implemented math so

## 1.13.6
- Fixed: When you go to an ip adress it should always use http unless the ip it self redirects you to https
- Fixed: Every website should have there corresponding site icon on the tab
- Fixed: On the start page of lodica it should say (logo)odica on mobile
- Fixed: When dark mode is of some pages still load with dark mode like chores.vpswb.store that is a page tha
- Fixed: When I want to search something via the widget it should open a new empty tab with no link already i
- Fixed: When it auto fills in a password and I want to use a different one it keeps auto pasting the saved o
- Fixed: When you add a new tab and there is still a new tab open it shouldn't open a new one but just move t
- Fixed: When you click on the logo in the search engine screen you load on a blank page

## 1.13.5
- Fixed: When you long press on a shortcut it should give you to option to remove that shortcut
- Fixed: There should not be an edit shortcut button there should be a plus to add shortcuts
- Fixed: When a password gets auto filled in and you remove it by using backspace it shouldn't reappear
- Fixed: When you click on the lodica text after you search something it shows a different start page but tha
- Fixed: On the search engine the l from lodia needs to be replaced bij the logo
- Fixed: There is no logo on the start page on mobile

## 1.13.4
- Desktop: the toolbar under the tabs shows fully again instead of being pushed down behind the page.

## 1.13.3
- Android: the menu sheet has New tab, Private and Reader tiles on top and outline icon rows below, with More for the rest.
- Android: the address bar is a full pill with a muted path after the host and an amber tracker count on the shield.
- Android: settings, dialogs, pickers, downloads, history, passwords and the Ask AI chat use the new cards, chips and icon tiles.
- Desktop: dialogs, theme cards, the segmented switcher, chat bubbles and search result cards follow the redesign.
- Desktop: settings has hero cards and a version footer. The chat shows memory and usage, and reader, support and toasts are polished.

## 1.13.2
- Android: new tab page has the Lodica tile, a pill search field with Ask AI, and rounded shortcut tiles.
- Android: the menu is a sheet with back, forward, reload and share on top and a grid of icon tiles.
- Android: settings rows, dialogs and filter chips use the shared shapes and type sizes, controls have 12 dp corners.
- Desktop: tabs sit in one row above a single toolbar with back, forward, reload, a pill address bar with lock, shield and reader icons, and an Ask AI tile.
- Desktop: clicking the lock opens a site info popover. A setting can move the toolbar to the bottom.
- Desktop: new outline icon set (24 grid, round caps).
- Desktop: settings sections renamed to General, Privacy, Passwords, Your VPS, Ask AI, Search, Appearance, Downloads and Data use, with a clearer type scale and pill buttons.

## 1.13.1
- Version matches desktop 1.13.1. The new menu, icon-tile rows and shortcut cards are desktop only in this release.

## 1.13.0
- Rounder look: the address bar, search fields and chips are full pills, cards have softer corners, and selected chips show amber text on an amber tint.
- The search button on the Lodica Search page is now a round amber button.
- Text on amber and rose buttons is easier to read in every theme, on desktop and Android.
- Muted grey text has more contrast in several themes.
- Android: buttons and icons are at least 44 dp, so they are easier to tap.

## 1.12.12
- Redesign pass: floating chips, toasts and the tab switcher share one shadow depth.


## 1.11.11
- Fixes: date and file inputs work, Reader no longer repeats the title and works after upgrades, Inbox retry, archived rows, landscape keyboard, false crash screen, shared searches use a public link, image search viewer has a close button and Open image link, spell-check language label, alias reuse on sign-up forms, and other small fixes.

## 1.11.10
- Custom emoji keyboard: Lodica Keyboard (Settings > AI answers > Emoji keyboard) with better autocorrect and a ★ tab of custom emojis. Import emojis from an image or generate one with your Anthropic key. Emojis sync with your server and send as images where the app accepts them, otherwise as :name:. Settings search finds the Emoji keyboard section.

## 1.11.9
- Theme names are clearer (Wallpaper instead of a second System). DNS server box rejects addresses that are not secure web addresses. Install-as-app no longer shows "null". Authenticator pre-fills the current site. Reader renders headings, keeps right-to-left text aligned and drops citation markers, tables and infoboxes. History merges duplicate pages.

## 1.11.8
- Settings search finds Smoother scrolling (now under Sites & domains). Dropdown menus open under their value. Settings keeps its scroll position and page when you come back from Server chat. History says "Just now" for fresh entries. Private badge stays on one line. Start page shortcuts show site names, skip error pages and are hidden in private tabs. Spell check says long-press.

## 1.11.7
- "Smoother scrolling" is on by default and uses GeckoView's own SurfaceView, which scrolls much smoother on weak phones. Turn it off in Settings if pages or tab previews look wrong.

## 1.11.7-beta.3
- Beta: "Smoother scrolling" is off by default again, because it showed blank pages on some phones (Redmi 12, Android 15). Turning it on later needs a restart.

## 1.11.7-beta.2
- Beta: "Smoother scrolling" (draws pages directly on screen) is on by default again, with a fix for blank pages after opening menus. Turn it off in Settings if pages look blank.

## 1.11.7-beta.1
- Beta: caps page drawing to 60 Hz on Android 15+ to fix laggy scrolling on 120 Hz phones.

## 1.11.6
- Beta: hidden scroll diagnostics (tap "Build" 5 times in About) showing GPU, render path and an fps / slow frame overlay. Used to track down laggy scrolling on some phones.

## 1.11.5
- Fixes pages showing blank in 1.11.4. "Smoother scrolling" is off again by default and was reset for everyone.

## 1.11.4
- "Smoother scrolling" is now on by default, to fix slow scrolling on weaker phones. Tab previews may turn blank; you can turn it off in settings (restart the browser to apply).

## 1.11.3
- Chat files can be up to 5 GB (was 5 MB). Files are streamed, so large files no longer fill memory.
- New setting "Smoother scrolling" (gesture settings) for slow phones. It draws pages directly on screen; tab previews may turn blank. Restart the browser to apply.

## 1.11.2
- The start page logo is now the "l" of "Lodica".
- The start page of a private tab shows the incognito mark.

## 1.11.1
- No changes on Android in this release (desktop tab strip fix).

## 1.11.0
- Install as app: a chip offers to install a site that has a web app manifest. Installed web apps set to fullscreen run with no system bars.
- Page fullscreen (video, games) now hides the status and navigation bars. Swipe from the edge to peek.
- Select an equation like 3x - 24 = -6 and the answer shows above it: x = 6. Works for one unknown, linear or quadratic, and for 3(x+1) = 12.
- Address bar auto-hides on local files. Long-press the bar to hide it, long-press where it sat to bring it back. Editing and find always show it.
- Tab previews are saved to disk, so cards are not blank after a restart or after a tab is unloaded. Private tabs are never saved.
- Background tabs idle for 5 minutes are unloaded and at most 3 live sessions are kept, so passive CPU and memory drop.
- Opening an IP address with no scheme now uses the plain web scheme.
- New switch to turn off autocorrect in the search bar. Dropdown and keyboard alignment fixes.
- Double-click on the address path selects only path and query, so Backspace leaves the bare domain.
- Desktop: .docx files open in an editor. Edit text in place and save back as a real .docx.

## 1.10.0
- Beta tester mode: tap the logo in Settings > Updates 7 times to unlock a Beta tester switch that also offers pre-releases.
- New tabs open as the rightmost tab. Drag a tab to move it. The order is saved.
- Faster, fresher tab previews: a preview is captured when a page loads and when you leave a tab.
- Smoother scrolling on Android: less work per frame, and nothing is drawn under Settings or the tab overview.

## 1.9.2
- Search, shortcut and sites widgets keep round corners at any size.
- Chat text can be selected and copied.
- Tab overview: new-tab tile at the end of the list, private tabs have their own style.
- Start page + button reads "Add shortcut". The keyboard shows reliably in the address bar.

## 1.9.1
- Desktop: fixed the app reporting version 1.8.2 and offering the update again.

## 1.9.0
- Linux: no more "no system keyring available" error. The token is stored encrypted in the profile folder.
- Pop-up windows from a page open as real windows.
- Chat: earlier messages stay yours after you change your display name.
- Start page: round + button, Auto shortcuts switch. Android search widget opens a new tab on the last visited site.
- Tests run on every build and must pass before a release.

## 1.8.2

- Updates from GitHub releases, checksum verified.
- Spell check and auto-correct, ten languages, mix allowed.
- Select a math expression to see its answer.
- Server chat outbox: messages wait while the server is down and send when it is back.
- Lighter background work.

## 1.8.1

- Removed autofilled password stays removed.
- Extension popups open (Settings > Extensions > Open).

## 1.8.0.2

- Search theme passed in the URL (th parameter); new tab page redesigned; Settings page icons and Danger zone.

## 1.8.0.1

- Search page applies the app theme before first paint via theme.js and themeapply.js; helper extension version 1.8.1.

## 1.8.0
- Settings redesigned: grouped home with find, a page per topic, slide-in pages, same page names and order as desktop.
- Lodica Search uses the new logo and the app theme.
- Authenticator: asks which code to use the first time a site needs one, then fills it automatically. "Don't use" can be undone per site in the Authenticator screen.

## 1.7.9
- Fixes the update loop: the 1.7.8 APK still reported 1.7.7. Install 1.7.9.
- Lodica Search rebuilt: the app fetches results itself.

## 1.7.8
- Settings shows whether the phone is linked to your server.
- Search re-checks the link before saying a server is needed.

## 1.7.7
- Removed device-gate enrollment; use the website enrollment page instead.
- Search error now tells you to link a server in Settings.

## 1.7.6
- Search: never jumps to another engine by itself; shows an error with a link instead.

## 1.7.5
- Search: results no longer flip to DuckDuckGo a moment after they appear.
- Chat: the cursor resyncs when the relay restarts and message ids reset (1.7.4).

## 1.7.3
- New logo everywhere: launcher icon, in-app logo, start page, widget and the desktop window and taskbar icon. The logo follows your theme: the body takes the theme's text colour and the middle bar takes the accent colour, and it updates when you change theme.
- Search: the start page and address bar no longer fall back to DuckDuckGo when Lodica Search is your engine and Google is the fallback.
- Chat: notifications for new chat messages now arrive on Android in the background, not only the test notification.
- Mobile: desktop-only sites switch to a mobile-friendly layout automatically.
- Downloads (Android): the Downloads page now lists current downloads with progress and everything you downloaded with the browser, and opens or removes them.
- Widget: the logo changes colour with the app theme.
- Linux: a Flatpak package is built alongside the AppImage.

## 1.7.2
- Settings: reorganised into tabs and sub-tabs on both apps. Mobile now opens on a grouped list of pages and has a back button inside each page; desktop opens on Search. The find box still works.
- Chat: new messages now raise a notification (a message that mentions you no longer gets filtered out of it).
- Own domains: the address bar shows the name you typed, not the address it redirects to.
- Search on Lodica from the start page now uses Lodica when it is your default engine; Google (or your fallback) is used only when the server cannot be reached.
- App icon: the kite follows the theme colours (all ten built-in themes), not only the dark or light background.
- Android patch notes for 1.7.1 are now included in the app.

## 1.7.1
- Fix crash when opening settings (and anything that opens them, such as chat): the settings find index read the tab list before it was created.

## 1.7.0
- Settings: reorganised so identical settings sit in the same section on Android and desktop, plus a find box.
- Redirect domain display now shows only the originating domain.
- AI answers: a "Generate an AI answer" button appears where the answer would be, unless "Always generate AI answers" is on (off by default).
- Lodica Search is used by default when a server is linked; new fallback search engine setting for when it is unavailable. The relay favours recent results.
- Authenticator (Android): import a Google Authenticator export from a screenshot of its QR code.
- Chat notifications: fixed missing notifications for the shared name, added a test button, chat service starts on resume.
- Tab previews on the tabs page work again (texture view backend).
- Launcher icon follows the light and dark theme.

## 1.6.5
- Server chat: direct messages no longer leak into other chats, file upload, instant notifications (optional foreground service).
- Redirect domain display (Settings, off by default): shows the originating domain with a marker for the real host; lock and security stay on the real site.
- Authenticator: import a Google Authenticator export (`otpauth-migration://` link, pasted or opened from a camera app), preview and confirm.
- App name and identity set for notifications and the taskbar.
- Logo and start page follow the theme; short kite intro on startup (honors reduced motion).
- Android: address bar fix, NDEFReader stub (GeckoView has no Web NFC; pages get NotSupportedError), chat notification permissions (POST_NOTIFICATIONS, battery exemption prompt, "Instant chat messages" toggle).

## 1.6.4
- Server chat: "+" shows a list of available users to pick for a private chat (devices that used chat or opened it recently). Needs the relay redeployed.
- Notifications on mobile now ask for permission at first start (without it chat and update notifications never showed). Chat notifications check about every 15 minutes.
- DNS rules also work natively when the helper extension fails to redirect.
- Menu: only your pinned quick settings show. "More" shows everything; tap or long-press an item to pin or unpin it.

## 1.6.3
- Fix the chat crash on Android 16 (message time was formatted with a null context while drawing).

## 1.6.2
- Search from the start page and the search widget uses the search engine chosen in Settings, not always DuckDuckGo.
- Settings, DNS: entries like `go.ogle` to `Google.com` are accepted. Add a rule in a sheet with a domain field and a redirect field; any number of rules can be added and removed.
- The start page has quick sites like the desktop. Long-press a tile to remove it.
- Sending a chat message no longer crashes the app (network and list-scroll failures are caught).
- Notifications for a new browser version and for new chat messages. They are checked about every 15 minutes in the background, and a tap opens Settings or the chat.
- Private chats with one device and group chats. In Server chat use "+" to open a private chat by device name or a group by group name. Chats others start with your device name appear by themselves.
- Three home-screen widgets: search bar, shortcuts (new tab, chat, inbox, settings) and quick sites.

## 1.6.1
- Android: fixes the Settings screen of 1.6.0, where the rows of a tab were drawn on top of each other.
- Desktop: new look. Settings has an icon sidebar and rows grouped in rounded cards, toggles and chips animate, theme tiles no longer show an oval selection ring, dialogs and sheets have softer corners and shadows, the tab switcher cards lift on hover, and the Server chat menu entry has its own icon.

## 1.6.0
- Android: Appearance page redone like the desktop one. Round theme swatches, a live mini-browser preview that follows the theme, round buttons for the start page background (none, gradient, colour, image) and a preview of the background with its dim and blur.
- Typing in the Lodica Search box now uses the search engine chosen in Settings. Lodica Search is only used when it is the chosen engine (Android and desktop).
- Android: settings redone. Every row has an icon, sections are quieter, and the tabs fade into each other. Items that appeared under two tabs are now in one place: search suggestions sit with Search, AI chats with AI, server chat with Mail, and the "Tabs on PC" header is now "Sync".
- Android: the flat look replaces the purple-pink gradients on the start page wordmark and the page-load bar.
- Android: tapping the address bar no longer shows the open-tabs strip above it.
- Lodica Search keeps its results, the AI answer and your scroll position when you go back from a page, instead of searching again (Android and desktop). Results appear before the theme and AI state arrive.
- Android: if you skipped server setup, Settings now offers it at the top of General and under VPS, and choosing Lodica Search without a server starts the setup.
- Includes everything from 1.5.2 (authenticator, server chat, offline-server fallback, sign-in tracking-protection pause).
- Not tested on a real device.

## 1.5.2
- Android: built-in authenticator (Settings > Identity & mail). Add a 2FA secret or otpauth:// link; the current code is filled into verification-code fields on that site and can be copied.
- Android: server chat, one shared room for everyone linked to the same server (needs the updated relay). Messages are not end-to-end encrypted and are kept 24 hours.
- Android: when the server is offline, VPS routing is skipped and Lodica Search falls back to Google until it answers again.
- Android: sign-in pages (login, signin, sso, auth, oauth) load without tracking protection so their scripts keep working.
- Android: a login field you empty by hand is no longer refilled with the saved value.
- Android: the address bar has a button that moves the cursor to the end of a long URL.
- Android: the tab switcher skips blank page captures and no longer hangs if a capture never answers.
- Typing a link into the in-page search bar opens it directly instead of searching (Android and desktop).
- Not tested on a real device.

## 1.5.1
- Android: "Own domain names" is more forgiving. It accepts "name target", "name=target", "name, target", "name -> target", hosts-file order ("192.168.1.10 nas.home") and "# comments". Before, any line that did not match exactly two space-separated words was dropped without a message.
- Android: saving a custom DNS server now also re-applies DNS over HTTPS mode in the running browser.
- Desktop has no own-DNS feature, so nothing changed there. Only the version number moved to stay in step.
- Not tested on a real device. I could not reproduce the original failure, so this fixes the likely causes.

## 1.5.0
Desktop and Android now share the same version number.
- Desktop: the start page background no longer shows only half. The header is transparent on the home page.
- Desktop: add a start page shortcut straight from the page, no edit mode needed. Hover a shortcut to remove it.
- Desktop: "Hide automatic shortcuts" moved into Settings > Start page shortcuts.
- Desktop: picking an image or gradient background shows a preview before you apply it. Images you used before are kept in a gallery, and you can remove them from it.
- Desktop: vertical tabs show only the site icon by default. Drag the divider wider to see full tab titles, narrower to go back to icons.
- Android: you choose what each gesture does (edge swipes, four-finger swipes, address bar swipes) in Settings > Controls, with a reset button.
- Desktop keybinds were already editable in Settings > Keybinds & controls.
- Not tested on a real device. The Windows build is untested.

## 1.4.2 (Android)

- New: custom DNS. In Settings, Custom DNS, map your own names (for example `.home` or `*.lab.me`) to a host, IP or URL. They work only inside Lodica and load directly, not through the VPS. You can also set your own DNS over HTTPS server.
- Changed: server setup is copy and paste only. Assuming wildcard DNS (`*.yourdomain`) already points to the server, you copy one command, run it on the server and paste the token. The DNS and port steps are gone and the installer only warns about DNS.
- Changed: no domain is built in any more. Nothing is preset until you link your server.
- Fixed: a generated or suggested password is no longer filled into password fields. Only saved logins are filled, and the dummy-mail sign-up flow fills a password only when you use it.

## 1.4.1 (Android)

- Fixed: the app crashing on launch or when the screen was rotated, caused by a second browser engine being created after a failed start. A failing optional startup step (ad blocker, helper, extensions) is now logged and skipped instead of taking the app down.

## 1.4.0 (Android)

New: first-run setup screen. Choose to use Lodica without a server, or with your own: it shows the exact install command, DNS records, ports and token steps, filled in with your domain, then tests and links the app. Re-run it from Settings, Identity & mail.
Change: the server domain is no longer fixed to example.com. The helper extension and settings follow the domain you enter.
Fix: the crash report now also records the error text for crashes after the engine starts.

## 1.3.3 (Android)

New: after a crash, the next launch shows a crash report with a Copy button, so the cause can be found. Tap Continue to open the browser as usual.

## 1.3.2 (Android)

New: patch notes are now inside the app. Open Settings, then About, then "What's new".

## 1.3.1 (Android)
- Fix: the app closed right after opening on 1.3.0. Easy view is removed again until the cause is found. Everything else is the same as 1.2.0.

## 1.3.0 (Android)
- Easy view for desktop-only sites. On a touch screen, pages that have no mobile layout show a small "Easy view" button in the bottom-right corner. Tap it to fit the page to your screen, make text readable, stop sideways scrolling and make buttons easier to tap. Tap "Original view" to undo. Your choice is remembered per site.
- Not tested on a real device yet.
- Still to come: Chromium/Firefox engine switch.

## 1.2.0
- Extensions. Settings > General > Extensions.
  - Desktop: paste a Chrome Web Store link or extension ID to install it. Electron supports only part of the Chrome extension API, so some extensions will not work fully.
  - Android: search Firefox Add-ons and install with one tap. You see the permissions first.
  - Turn extensions on or off, or remove them, in the same place.
- Not tested on a real device yet. Firefox add-ons cannot run on desktop, and the Chrome Web Store cannot be used on Android.
- Still to come: Chromium/Firefox engine switch, built-in PDF editor, desktop-site mobile mode.

## 1.1.0
- Search home page: add your own quick-access sites, remove any tile, and turn off the automatic "most visited" tiles.
- Search page now uses your browser theme.
- Search box has a clear (X) button.
- Make your own theme (four colours) with a live preview. It syncs to your other devices.
- "Use dummy mail" appears only on sign-up pages. You can hide it for a specific site.
- The two dark-mode settings are now one ("Dark pages").
- Search works without a server (falls back to DuckDuckGo).
- Android: the home-screen search widget follows your theme and has its own hint text and shape.
- Not done yet: Chromium/Firefox engine switch, extension store, built-in PDF editor, desktop-site mobile mode.
