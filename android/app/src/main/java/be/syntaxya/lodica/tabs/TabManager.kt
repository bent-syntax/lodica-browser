package be.syntaxya.lodica.tabs

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.ContentBlocking
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.ContentDelegate.ContextElement
import org.mozilla.geckoview.GeckoSession.PermissionDelegate.ContentPermission
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.WebResponse
import be.syntaxya.lodica.engine.Downloads
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.engine.Helper
import be.syntaxya.lodica.engine.History
import be.syntaxya.lodica.engine.PcTabs
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.ui.Prompts

data class ContextMenuRequest(val tab: Tab, val element: ContextElement)

/**
 * Owns every tab and GeckoSession. Lives in the process (not the activity) so pages survive
 * rotation and activity recreation. At most [MAX_LIVE] sessions stay open; older background
 * tabs keep only their serialized state and reopen on demand.
 */
object TabManager {
    const val HOME = "about:blank"
    private const val MAX_LIVE = 3
    private const val IDLE_UNLOAD_MS = 5 * 60_000L
    private const val MAX_CLOSED = 25
    private const val MAX_ARCHIVED = 200
    private const val DAY_MS = 86_400_000L
    private val WEB_SCHEMES = setOf(
        "http", "https", "about", "data", "blob", "javascript", "file",
        "moz-extension", "resource", "view-source",
    )

    val tabs = mutableStateListOf<Tab>()
    val archived = mutableStateListOf<TabRecord>()
    var current by mutableStateOf<Tab?>(null); private set
    var contextMenu by mutableStateOf<ContextMenuRequest?>(null)
    var fullscreen by mutableStateOf(false); private set
    var canUndo by mutableStateOf(false); private set

    /** Toolbar hook: (dy, y) for the current tab. */
    var onScroll: ((dy: Int, y: Int) -> Unit)? = null

    private lateinit var app: Context
    private val main = Handler(Looper.getMainLooper())

    private val LOGIN_PATH = Regex("(^|[/._-])(log-?in|sign-?in|signon|sso|auth(enticate)?|oauth2?)([/._-]|$)", RegexOption.IGNORE_CASE)

    /** True for http(s) pages whose host or path looks like a sign-in step (login, signin, sso, auth, oauth). */
    private fun isLoginUrl(url: String): Boolean {
        val u = Uri.parse(url)
        if (u.scheme != "https" && u.scheme != "http") return false
        return LOGIN_PATH.containsMatchIn(u.host.orEmpty().substringBefore('.') + "/" + u.path.orEmpty())
    }
    private val live = LinkedHashSet<Tab>()
    private val closed = ArrayDeque<TabRecord>()

    private val runtime: GeckoRuntime get() = Engine.runtime(app)

    fun init(ctx: Context) {
        if (::app.isInitialized) return
        app = ctx.applicationContext
        TabStore.init(app)
        Thumbs.init(app)
        val snap = TabStore.load()
        archived.addAll(snap.archived)
        val cutoff = System.currentTimeMillis() - Prefs.autoArchiveDays * DAY_MS
        for (r in snap.tabs) {
            if (Prefs.autoArchiveDays > 0 && !r.private && r.lastUsed < cutoff && r.id != snap.currentId) archived.add(0, r)
            else tabs.add(Tab.from(r))
        }
        trimArchive()
        // Private tabs restored after the app was closed wait behind the lock.
        tabs.forEach { if (it.private) it.locked = true }
        val start = tabs.firstOrNull { it.id == snap.currentId } ?: tabs.lastOrNull()
        if (start != null) select(start) else open(HOME)
        Thumbs.restore(tabs.toList(), tabs.map { it.id }.toSet() + archived.map { it.id })
    }

    // ---- tab lifecycle -------------------------------------------------------------------

    fun open(url: String, private: Boolean = false, select: Boolean = true, parent: Tab? = null): Tab {
        val tab = Tab(private = private, url = url, desktop = parent?.desktop ?: Prefs.desktopDefault)
        val at = tabs.size
        // A new private tab shares cookies with the others, so it waits behind the same lock.
        if (private && privateLocked) tab.locked = true
        tabs.add(at, tab)
        if (select) select(tab) else { ensureSession(tab); save() }
        return tab
    }

    fun select(tab: Tab) {
        val prev = current
        if (prev !== tab) {
            // The card of the tab being left, while it is still the one on screen.
            if (prev != null) be.syntaxya.lodica.ui.captureThumbnail(prev)
            prev?.session?.apply { setFocused(false); setActive(false) }
            current = tab
            // Leaving a private tab for a normal one locks private tabs again.
            if (prev != null && prev.private && !tab.private && !privateLocked) lockPrivate()
        }
        tab.lastUsed = System.currentTimeMillis()
        tab.scrollY = 0
        // A locked tab stays dark until unlockPrivate(); its old session, if any, keeps its cookies.
        if (tab.locked) { save(); return }
        val s = ensureSession(tab)
        s.setActive(true)
        s.setFocused(true)
        live.remove(tab); live.add(tab)
        unloadIdle()
        save()
    }

    /** Frees background pages untouched for a while (not playing media). Their saved state and thumbnail bring them back. */
    private fun unloadIdle() {
        val now = System.currentTimeMillis()
        val it = live.iterator()
        while (it.hasNext()) {
            val t = it.next()
            if (t === current || t.state == null || now - t.lastUsed < IDLE_UNLOAD_MS) continue
            it.remove()
            t.session?.close()
            t.session = null
        }
    }

    /** Hide every private tab until the next biometric check. Sessions stay alive so logins survive. */
    fun lockPrivate() {
        val priv = tabs.filter { it.private }
        if (priv.isEmpty()) return
        priv.forEach { it.locked = true }
        current?.takeIf { it.private }?.session?.apply { setFocused(false); setActive(false) }
    }

    /** One successful check unlocks all private tabs. */
    fun unlockPrivate() {
        tabs.forEach { if (it.private) it.locked = false }
        current?.let { select(it) }
    }

    val privateLocked get() = tabs.any { it.private && it.locked }

    fun close(tab: Tab) {
        val idx = tabs.indexOf(tab)
        if (idx < 0) return
        if (!tab.private) {
            closed.addFirst(tab.record())
            while (closed.size > MAX_CLOSED) closed.removeLast()
            canUndo = true
        }
        tabs.removeAt(idx)
        release(tab)
        if (current === tab) {
            current = null
            val next = tabs.getOrNull(idx - 1) ?: tabs.getOrNull(idx)
            if (next != null) select(next) else open(HOME)
        } else save()
    }

    /** Recently closed tabs, newest first. */
    fun recentlyClosed(): List<TabRecord> = closed.toList()

    fun reopen(r: TabRecord): Tab? {
        if (!closed.remove(r)) return null
        canUndo = closed.isNotEmpty()
        val tab = Tab.from(r.copy(lastUsed = System.currentTimeMillis()))
        tabs.add(tab)
        select(tab)
        return tab
    }

    fun undoClose(): Tab? {
        val r = closed.removeFirstOrNull() ?: return null
        canUndo = closed.isNotEmpty()
        val tab = Tab.from(r.copy(lastUsed = System.currentTimeMillis()))
        tabs.add(tab)
        select(tab)
        return tab
    }

    /** Closes every tab of the given kind (null = all). Private sessions leave no trace. */
    fun closeAll(private: Boolean? = null) {
        val victims = tabs.filter { private == null || it.private == private }
        victims.forEach { t ->
            if (!t.private) closed.addFirst(t.record())
            tabs.remove(t); release(t)
        }
        while (closed.size > MAX_CLOSED) closed.removeLast()
        canUndo = closed.isNotEmpty()
        if (current !in tabs) {
            current = null
            tabs.lastOrNull()?.let { select(it) } ?: open(HOME)
        } else save()
    }

    fun move(from: Int, to: Int) {
        if (from !in tabs.indices || to !in tabs.indices) return
        tabs.add(to, tabs.removeAt(from))
        save()
    }

    // ---- archive ---------------------------------------------------------------------------

    fun archive(tab: Tab) {
        if (tab.private) return close(tab)
        archived.add(0, tab.record())
        trimArchive()
        val idx = tabs.indexOf(tab)
        tabs.remove(tab); release(tab)
        if (current === tab) {
            current = null
            (tabs.getOrNull(idx - 1) ?: tabs.getOrNull(idx))?.let { select(it) } ?: open(HOME)
        } else save()
    }

    fun unarchive(r: TabRecord) {
        archived.remove(r)
        val tab = Tab.from(r.copy(lastUsed = System.currentTimeMillis()))
        tabs.add(tab)
        select(tab)
    }

    fun clearArchive() { archived.clear(); save() }

    private fun trimArchive() { while (archived.size > MAX_ARCHIVED) archived.removeAt(archived.lastIndex) }

    // ---- navigation ------------------------------------------------------------------------

    fun load(input: String, tab: Tab? = current) {
        val url = Prefs.resolve(input)
        val t = tab ?: open(url)
        t.url = url
        t.crashed = false
        ensureSession(t).loadUri(url)
    }

    /**
     * Turns tracking and fingerprinting protection off (or back on) for the tab's site, then reloads.
     * For sites whose anti-fraud checks reject hardened browsers. Returns false before the page reported in.
     */
    fun toggleTrust(tab: Tab): Boolean {
        val p = tab.trackPerm ?: return false
        val v = if (tab.trusted) ContentPermission.VALUE_DENY else ContentPermission.VALUE_ALLOW
        val sc = runtime.storageController
        if (p.privateMode) sc.setPrivateBrowsingPermanentPermission(p, v) else sc.setPermission(p, v)
        tab.trusted = v == ContentPermission.VALUE_ALLOW
        tab.session?.reload()
        return true
    }

    /**
     * Compatibility mode for the tab's site: no fingerprinting protection and no user-agent spoof, so bot
     * challenges (Cloudflare, Akamai, GoDaddy) see a plain Firefox. Reuses the per-site tracking exemption.
     */
    fun setCompat(tab: Tab, on: Boolean) {
        val host = tab.host.removePrefix("www.").ifBlank { return }
        Prefs.setCompat(host, on)
        tab.trackPerm?.let { p ->
            val v = if (on) ContentPermission.VALUE_ALLOW else ContentPermission.VALUE_DENY
            val sc = runtime.storageController
            if (p.privateMode) sc.setPrivateBrowsingPermanentPermission(p, v) else sc.setPermission(p, v)
            tab.trusted = on
        }
        tab.session?.settings?.userAgentOverride = agentFor(tab)
        tab.session?.reload()
    }

    /** The user-agent override for a tab: desktop mode and compatibility mode keep Gecko's own string. */
    private fun agentFor(tab: Tab): String? = if (tab.desktop || Prefs.isCompat(tab.host)) null else Prefs.userAgent.value

    /** Re-applies the chosen user agent to every open tab and reloads them. */
    fun applyUserAgent() {
        for (t in tabs) {
            val s = t.session ?: continue
            s.settings.userAgentOverride = agentFor(t)
            s.reload()
        }
    }

    fun setDesktop(tab: Tab, on: Boolean) {
        tab.desktop = on
        tab.session?.settings?.apply {
            userAgentMode = if (on) GeckoSessionSettings.USER_AGENT_MODE_DESKTOP else GeckoSessionSettings.USER_AGENT_MODE_MOBILE
            viewportMode = if (on) GeckoSessionSettings.VIEWPORT_MODE_DESKTOP else GeckoSessionSettings.VIEWPORT_MODE_MOBILE
            userAgentOverride = agentFor(tab)
        }
        tab.session?.reload()
        save()
    }

    fun exitFullscreen() { current?.session?.exitFullScreen() }

    fun save() {
        TabStore.save(tabs, current, archived)
        PcTabs.changed()
    }

    // ---- sessions --------------------------------------------------------------------------

    /** Returns the tab's session, opening (and restoring) it if needed. Evicts old sessions. */
    fun ensureSession(tab: Tab): GeckoSession {
        tab.session?.let { return it }
        val s = newSession(tab)
        tab.session = s
        s.open(runtime)
        val restored = tab.state?.let { runCatching { GeckoSession.SessionState.fromString(it) }.getOrNull() }
        if (restored != null) s.restoreState(restored) else s.loadUri(tab.url)
        live.remove(tab); live.add(tab)
        evict()
        return s
    }

    private fun evict() {
        val it = live.iterator()
        while (live.size > MAX_LIVE && it.hasNext()) {
            val t = it.next()
            if (t === current) continue
            it.remove()
            t.session?.close()
            t.session = null
        }
    }

    private fun release(tab: Tab) {
        live.remove(tab)
        tab.session?.close()
        tab.session = null
    }

    private fun newSession(tab: Tab): GeckoSession {
        val settings = GeckoSessionSettings.Builder()
            .usePrivateMode(tab.private)
            .useTrackingProtection(true)
            .suspendMediaWhenInactive(false)
            .userAgentMode(if (tab.desktop) GeckoSessionSettings.USER_AGENT_MODE_DESKTOP else GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
            .viewportMode(if (tab.desktop) GeckoSessionSettings.VIEWPORT_MODE_DESKTOP else GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
            .apply { agentFor(tab)?.let { userAgentOverride(it) } }
            .build()
        return GeckoSession(settings).also { attach(tab, it) }
    }

    private fun attach(tab: Tab, s: GeckoSession) {
        s.navigationDelegate = Nav(tab)
        s.progressDelegate = Progress(tab)
        s.contentDelegate = Content(tab)
        s.contentBlockingDelegate = Blocking(tab)
        s.scrollDelegate = Scroll(tab)
        s.mediaSessionDelegate = be.syntaxya.lodica.engine.Playback
        s.promptDelegate = Prompts
        s.permissionDelegate = Prompts
        Helper.attach(tab, s)
    }

    private fun recover(tab: Tab, crashed: Boolean) {
        live.remove(tab)
        tab.session = null
        tab.loading = false
        tab.crashed = crashed
        // A killed (OOM) tab silently comes back; a crashed one waits for the user to tap reload.
        if (!crashed && current === tab) main.post { if (tab in tabs) select(tab) }
    }

    fun reviveCrashed(tab: Tab) {
        tab.crashed = false
        select(tab)
    }

    // ---- delegates -------------------------------------------------------------------------

    private class Nav(val tab: Tab) : GeckoSession.NavigationDelegate {
        override fun onLocationChange(
            session: GeckoSession,
            url: String?,
            perms: MutableList<org.mozilla.geckoview.GeckoSession.PermissionDelegate.ContentPermission>,
            hasUserGesture: Boolean,
        ) {
            url ?: return
            // A restore briefly reports about:blank; don't let it clobber the saved URL.
            if (url == "about:blank" && tab.url != "about:blank") return
            if (url.substringBefore('#') != tab.url.substringBefore('#')) { tab.manifest = null; tab.icons = emptyList() }
            val from = tab.navStart?.let { Uri.parse(it).host.orEmpty().removePrefix("www.") }.orEmpty()
            val to = Uri.parse(url).host.orEmpty().removePrefix("www.")
            tab.origin = if (from.isNotEmpty() && to.isNotEmpty() && from != to && url.startsWith("http")) from else ""
            tab.navStart = null
            tab.url = url
            tab.trackPerm = perms.firstOrNull { it.permission == GeckoSession.PermissionDelegate.PERMISSION_TRACKING }
            tab.trusted = tab.trackPerm?.value == ContentPermission.VALUE_ALLOW
            if (Prefs.isCompat(tab.host)) {
                tab.trackPerm?.takeIf { !tab.trusted }?.let { p ->
                    val sc = runtime.storageController
                    if (p.privateMode) sc.setPrivateBrowsingPermanentPermission(p, ContentPermission.VALUE_ALLOW)
                    else sc.setPermission(p, ContentPermission.VALUE_ALLOW)
                    tab.trusted = true
                    // The page already loaded with fingerprinting protection; load it again without.
                    if (Prefs.isForcedCompat(tab.host)) main.post { session.reload() }
                }
            }
            agentFor(tab).let { if (session.settings.userAgentOverride != it) session.settings.userAgentOverride = it }
            // Sign-in pages load without tracking protection so their auth scripts are not broken; it comes back after.
            val wantTp = !isLoginUrl(url)
            if (session.settings.useTrackingProtection != wantTp) {
                session.settings.useTrackingProtection = wantTp
                if (!wantTp) main.post { session.reload() }
            }
            if (!tab.private) History.visit(url)
            save()
        }

        override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) { tab.canBack = canGoBack }
        override fun onCanGoForward(session: GeckoSession, canGoForward: Boolean) { tab.canFwd = canGoForward }

        override fun onLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<AllowOrDeny>? {
            val scheme = request.uri.substringBefore(':', "").lowercase()
            if (scheme in WEB_SCHEMES) {
                // Set the user agent before a top-level load reaches a compat site (Google sign-in), not after.
                if (request.target == GeckoSession.NavigationDelegate.TARGET_WINDOW_CURRENT) {
                    if (!request.isRedirect) tab.navStart = request.uri
                    val host = Uri.parse(request.uri).host.orEmpty().removePrefix("www.")
                    val ua = if (tab.desktop || Prefs.isCompat(host)) null else Prefs.userAgent.value
                    if (session.settings.userAgentOverride != ua) session.settings.userAgentOverride = ua
                    // Minecraft Classic refuses to start without a keyboard: give it the desktop page and input model.
                    if (!tab.desktop && (host == "minecraft.net" || host.endsWith(".minecraft.net"))) {
                        tab.desktop = true
                        session.settings.userAgentMode = GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
                        session.settings.viewportMode = GeckoSessionSettings.VIEWPORT_MODE_DESKTOP
                        session.settings.userAgentOverride = null
                    }
                }
                return null
            }
            launchExternal(session, request.uri)
            return GeckoResult.deny()
        }

        override fun onSubframeLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<AllowOrDeny>? {
            val scheme = request.uri.substringBefore(':', "").lowercase()
            // Frames may not launch apps on their own.
            return if (scheme in WEB_SCHEMES) null else GeckoResult.deny()
        }

        override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
            val child = Tab(private = tab.private, url = uri, desktop = tab.desktop)
            val s = newSession(child)
            child.session = s
            val at = tabs.indexOf(tab).let { if (it < 0) tabs.size else it + 1 }
            tabs.add(at, child)
            live.add(child)
            main.post { if (child in tabs) { select(child); evict() } }
            return GeckoResult.fromValue(s)
        }
    }

    private fun launchExternal(session: GeckoSession, uri: String) {
        val intent = runCatching {
            if (uri.startsWith("intent:")) Intent.parseUri(uri, Intent.URI_INTENT_SCHEME)
            else Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        }.getOrNull() ?: return
        // Never let a page target a specific (possibly private) component.
        intent.component = null
        intent.selector = null
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            app.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            intent.getStringExtra("browser_fallback_url")
                ?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
                ?.let { session.loadUri(it) }
        } catch (_: SecurityException) {
        }
    }

    private class Progress(val tab: Tab) : GeckoSession.ProgressDelegate {
        override fun onPageStart(session: GeckoSession, url: String) {
            tab.loading = true
            tab.progress = 5
            tab.blocked = 0
            tab.crashed = false
        }

        override fun onPageStop(session: GeckoSession, success: Boolean) {
            tab.loading = false
            tab.progress = 100
            // Let the page paint, then keep its card fresh so background tabs never show an empty logo.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (current === tab) be.syntaxya.lodica.ui.captureThumbnail(tab)
            }, 1500)
        }

        override fun onProgressChange(session: GeckoSession, progress: Int) { tab.progress = progress }

        override fun onSecurityChange(session: GeckoSession, info: GeckoSession.ProgressDelegate.SecurityInformation) {
            tab.secure = info.isSecure || tab.url.startsWith("about:")
        }

        override fun onSessionStateChange(session: GeckoSession, state: GeckoSession.SessionState) {
            if (state.isEmpty()) return // pre-restore empty state would wipe history
            tab.state = state.toString()
            save()
        }
    }

    private class Content(val tab: Tab) : GeckoSession.ContentDelegate {
        override fun onTitleChange(session: GeckoSession, title: String?) {
            tab.title = title.orEmpty()
            if (!tab.private && !title.isNullOrBlank()) History.title(tab.url, title)
            save()
        }

        override fun onCloseRequest(session: GeckoSession) = close(tab)

        override fun onFullScreen(session: GeckoSession, fullScreen: Boolean) {
            if (tab === current) fullscreen = fullScreen
        }

        override fun onContextMenu(session: GeckoSession, screenX: Int, screenY: Int, element: ContextElement) {
            contextMenu = ContextMenuRequest(tab, element)
        }

        override fun onExternalResponse(session: GeckoSession, response: WebResponse) = Downloads.save(app, response, tab.private)

        override fun onWebAppManifest(session: GeckoSession, manifest: org.json.JSONObject) { tab.manifest = manifest }

        override fun onCrash(session: GeckoSession) = recover(tab, crashed = true)
        override fun onKill(session: GeckoSession) = recover(tab, crashed = false)
    }

    private class Blocking(val tab: Tab) : ContentBlocking.Delegate {
        override fun onContentBlocked(session: GeckoSession, event: ContentBlocking.BlockEvent) { tab.blocked++ }
    }

    private class Scroll(val tab: Tab) : GeckoSession.ScrollDelegate {
        override fun onScrollChanged(session: GeckoSession, scrollX: Int, scrollY: Int) {
            val dy = scrollY - tab.scrollY
            tab.scrollY = scrollY
            if (tab === current) onScroll?.invoke(dy, scrollY)
        }
    }
}
