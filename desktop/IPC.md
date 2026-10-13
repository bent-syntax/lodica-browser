# Lodica desktop IPC contract (main <-> ui/)

Bridge (`preload/ui.js`, contextIsolation on):
- `window.lodica.invoke(cmd, ...args)` -> `ipcRenderer.invoke("ui", cmd, ...args)` -> Promise of the result.
- `window.lodica.on(event, fn)` -> listens to `ipcRenderer.on("ui-event", (_, event, data))`, calls `fn(data)`.
- Main side: `ui.handle(cmd, fn)` registers a command; one `ipcMain.handle("ui")` dispatches. `ui.push(event, data)` sends.
- Unknown command -> throws `Unknown command <cmd>`.

## Layout
- UI view = transparent WebContentsView. Mode "bar": bottom 58px of window. Mode "overlay": whole window.
- Page view = window minus bottom 58px. Renderer draws its own dim backdrop in overlay mode.
- `layout(mode)` mode "bar" | "overlay". Renderer calls "overlay" before showing any menu/sheet/switcher/prompt/suggestions/context menu, "bar" after closing the last one.
- Main pushes `overlay` {on:true} when it opens a prompt itself; renderer must then switch to overlay rendering.

## Commands (renderer -> main). Return value after `->`.
- `init` -> {prefs, engines, agents, languages, qualities, tab, tabs, version, chromium, ghostery, relay:{available}, ai, locked, pinSet}
- `go(text)`; `back`; `forward`; `reload`; `stop`; `home`; `osk` (open system on-screen keyboard)
- `tab.new({private?, url?, background?})` -> info; `tab.select(id)`; `tab.close(id)`; `tab.undoClose`; `tab.closeAll(private)`
- `tab.list` -> {tabs:[info + current:bool], archived:[info], closed:[{title,url}]} (`current` marks the selected tab; the open-tabs strip uses it); `tab.thumb(id)` -> dataURL|null
- `tab.archive(id)`; `tab.restore(id)`; `tab.deleteArchived(id)`; `tab.clearArchived`; `tab.reopen(index)` (recently closed)
- `find(text, forward)` (empty text clears); `find.stop`
- `suggest(text)` -> [{title,url}] (history + engine suggestions); `topSites` -> [{title,url}]
- `prefs.set(key, value)`
- `shield.toggle` (trust/untrust current host); `lite.toggle`; `compat.toggle`; `desktop.toggle`
- `share(url?, raw?)` (copies URL without `?query`, toast "Link copied"; `raw` keeps it intact); `copyLink(url)` (same stripping); `copy(text)`; `openExternal(url)`
- `email.fill` (helper.fill on current tab; also the top view's "Use dummy mail" button); `reader` -> {title,text}|null
- `relay.state` -> state; `relay.refresh`; `relay.delete(id)` -> bool; `relay.forget(address)` -> bool
- `remind.set(ts)` (current tab title/url) -> {ok, text}
- `video.speed(v)`; `video.quality(v|null)` (current host; null = default)
- `history.list(query)` -> [{url,title,time}]; `history.delete(url)`; `history.clear`
- `vault.state` -> {pinSet, unlocked}; `vault.setPin(pin)`; `vault.unlock(pin)` -> bool; `vault.list` -> [{origin,user,saved}]
- `vault.delete(origin,user)`; `vault.copy(origin,user)` (password to clipboard, cleared after 30s)
- `downloads.list` -> [{id,name,url,state,received,total,path,time}]; `downloads.open(id)`; `downloads.show(id)`
- `update.status` -> current update state (same shape as the `update` event); `update.check`; `update.download`; `update.cancel`; `update.install`. The relay is the only update source; no GitHub credential is held here.
- `downloads.cancel(id)`; `downloads.resume(id)`; `downloads.remove(id)`; `downloads.clear`
- `meter.list` -> [{host,blocked,saved}] + totals; `meter.reset`
- `ai.ask(q, ctx)` -> {text}|{error}; `ai.status` -> {status, connected, hasKey}; `ai.setKey(key)` -> status
- `ai.usage` -> {today:{r,i,o}, month:{r,i,o}, all:{r,i,o}}; `ai.resetUsage`; `ai.memory.get` -> [facts]; `ai.memory.set(text)`
- `ai.chats` -> [{id,title,updated,messages:[{role,text,t}]}]; `ai.chat.send(id|"", text)` -> {id,text}|{error} (empty id starts a chat); `ai.chat.delete(id)` -> remaining chats. Push event `ai.chats` carries the list after any change, including chats merged from the phone link.
- Search page messages (`lodica://search/` only): `suggest` {q} -> [strings]; `top` -> [{host,title}]; `icon` {host} -> data URL.
- `pctabs.link` -> url|null; `pctabs.reset` -> url; `pctabs.pair(text)` -> bool (adopt other device's link); `pctabs.remote` -> {owner,tabs:[{title,url}],updated}. Event `pctabs.remote {tabs,updated}`
- `webapps.install`; `webapps.list` -> [{id,name,url,icon}]; `webapps.open(id)`; `webapps.remove(id)`
- `ext.list` -> [{id,name,version,on}]; `ext.install(urlOrId)` -> {ok,list} or {ok:false,error}; `ext.toggle(id)` and `ext.remove(id)` -> list
- `privacy.clearSiteData`; `privacy.resetPermissions`
- `private.unlock(pin)` -> bool (vault PIN); `private.lock` (private tabs also lock on switching to a normal tab and on app close)
- `preview.open(url, rect{x,y,width,height})` (separate view over the UI view); `preview.close`; `preview.promote` (opens it as a tab)
- `prompt.answer(id, result)` (result: bool, or object for auth {user,pass,remember}, or string)
- `link.open(url, private?)`; `link.download(url)`
- `quit`; `devtools` (current tab)

## Events (main -> renderer, `lodica.on`)
- `tab` info of CURRENT tab: {id,url,display,title,loading,progress,canBack,canForward,private,host,https,blocked,
  trusted,lite,compat,desktop,emailForm,emailFocus,routed,audio,speed,quality,crashed,locked,home}
  - `display` = text for the address pill (search query for Lodica Search pages, else URL; "" on home).
  - `home` true when url is the start page (`lodica://search/search.html` without q, or about:blank).
- `tabs` {count, privateCount}
- `find` {cur, total}
- `toast` {text, action?, id?} (action label; renderer calls `prompt.answer(id,true)` when clicked)
- `prompt` {id, kind:"confirm"|"auth"|"pin"|"color"|"select", title, message, ok, cancel, extra?, options?}
- `context` {x, y, linkURL, srcURL, mediaType, selectionText, editable}
- `clipboard` {url}
- `mail` {site, link, alias}
- `prefs` full prefs object; `relay` state; `downloads` list; `ai` status
- `shortcut` name: "address" | "find" | "switcher" | "menu" | "escape"
- `sheet` {name, data} (main asks renderer to open a sheet, e.g. "reader", "inbox")
- `overlay` {on}
- `locked` {on} (private tabs locked/unlocked; pushed again on every tab switch that changes it)
- `update` {state: idle|checking|latest|available|downloading|ready|error, version?, name?, notes?, size?, file?, received?, path?, message?}

## Top view (ui/top.html)
- A second transparent view above the page (tab strip, open-tabs strip, "Use dummy mail" button). It uses the same preload bridge.
- `ui.push` sends every event to both the UI view and the top view. Both views may call any command.

## Notes
- Relay alias registry: aliases are mirrored on the relay server (`GET/POST /api/aliases`, `DELETE /api/aliases/<local>`, tombstones in `removed`), so mail to any alias reaches every browser using the same token. No new IPC command; `relay` events carry the merged state.
- `share` / `copyLink` strip `?` and everything after; `#fragment` is kept unless it sits behind the `?`.
- 1.1.0: `quick` (custom quick sites), `auto` (auto top sites on/off), `email.hide` (hide the dummy mail button per site) and `theme.custom` (save the custom theme) commands. The search page `state` message now carries `custom` and the theme colours.
