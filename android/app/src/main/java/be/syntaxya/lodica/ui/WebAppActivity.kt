package be.syntaxya.lodica.ui

import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.WebResponse
import be.syntaxya.lodica.engine.Downloads
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.engine.Playback
import be.syntaxya.lodica.engine.WebApps
import be.syntaxya.lodica.ui.theme.Graphite
import be.syntaxya.lodica.ui.theme.LodicaTheme

/**
 * Toolbar-less web-app mode (#27). Started by an installed wrapper APK with its package in `pkg`; each wrapper
 * gets its own document task, so it shows up as a separate app in recents. Only the site's own origin loads
 * here: other web links open in Lodica and non-web schemes go to the matching app.
 */
class WebAppActivity : HostActivity() {
    private lateinit var session: GeckoSession
    private var origin = ""
    private var canGoBack = false
    private var fullscreen by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Engine.runtime(this)
        Prompts.init(this)
        val pkg = intent.getStringExtra("pkg").orEmpty()
        val url = startUrl(intent) ?: run { finish(); return }
        origin = originOf(url)
        val label = WebApps.record(this, pkg)?.label ?: Uri.parse(url).host.orEmpty()
        @Suppress("DEPRECATION")
        setTaskDescription(ActivityManager.TaskDescription(label, WebApps.icon(this, pkg)))

        session = GeckoSession(
            GeckoSessionSettings.Builder()
                .useTrackingProtection(true)
                .suspendMediaWhenInactive(false)
                .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
                .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
                .build()
        )
        session.promptDelegate = Prompts
        session.permissionDelegate = Prompts
        session.mediaSessionDelegate = Playback
        session.navigationDelegate = Nav()
        session.contentDelegate = Content()
        session.open(Engine.runtime(this))
        session.loadUri(url)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreen -> session.exitFullScreen()
                    canGoBack -> session.goBack()
                    else -> finish()
                }
            }
        })

        val bg = Graphite.toArgb()
        setContent {
            LodicaTheme {
                Box(
                    Modifier.fillMaxSize().background(Graphite)
                        .then(if (fullscreen) Modifier else Modifier.systemBarsPadding().imePadding())
                ) {
                    AndroidView(
                        factory = { c ->
                            GeckoView(c).apply {
                                setViewBackend(GeckoView.BACKEND_TEXTURE_VIEW)
                                coverUntilFirstPaint(bg)
                                setSession(this@WebAppActivity.session)
                            }
                        },
                        onRelease = { it.releaseSession() },
                        modifier = Modifier.fillMaxSize(),
                    )
                    PromptDialogs(Prompts.queue.firstOrNull { it.session === session })
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (!::session.isInitialized) return
        val url = startUrl(intent) ?: return
        if (originOf(url) == origin) session.loadUri(url)
    }

    override fun onDestroy() {
        if (::session.isInitialized) {
            Prompts.dropFor(session)
            session.close()
        }
        super.onDestroy()
    }

    /** The stored record wins; the extra is only trusted when it is plain http(s). */
    private fun startUrl(i: Intent): String? {
        val pkg = i.getStringExtra("pkg").orEmpty()
        WebApps.record(this, pkg)?.url?.let { return it }
        return i.getStringExtra("url")?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
    }

    private fun originOf(url: String): String = Uri.parse(url).let { "${it.scheme}://${it.host}" }

    private fun openInLodica(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).setClass(this, MainActivity::class.java))
    }

    private fun launchExternal(url: String) {
        val i = runCatching {
            if (url.startsWith("intent:")) Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            else Intent(Intent.ACTION_VIEW, Uri.parse(url))
        }.getOrNull() ?: return
        i.component = null
        i.selector = null
        i.addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { startActivity(i) } catch (_: ActivityNotFoundException) {
            i.getStringExtra("browser_fallback_url")
                ?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
                ?.let { openInLodica(it) }
        } catch (_: SecurityException) {}
    }

    private fun setSystemBars(hidden: Boolean) {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (hidden) {
            c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.hide(WindowInsetsCompat.Type.systemBars())
        } else c.show(WindowInsetsCompat.Type.systemBars())
    }

    private inner class Nav : GeckoSession.NavigationDelegate {
        override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) { this@WebAppActivity.canGoBack = canGoBack }

        override fun onLoadRequest(
            session: GeckoSession,
            request: GeckoSession.NavigationDelegate.LoadRequest,
        ): GeckoResult<AllowOrDeny> {
            val uri = request.uri
            val web = uri.startsWith("https://") || uri.startsWith("http://")
            return when {
                web && originOf(uri) == origin -> GeckoResult.allow()
                web -> { openInLodica(uri); GeckoResult.deny() }
                uri.startsWith("about:") || uri.startsWith("data:") || uri.startsWith("blob:") -> GeckoResult.allow()
                else -> { launchExternal(uri); GeckoResult.deny() }
            }
        }

        override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
            if (uri.startsWith("https://") || uri.startsWith("http://")) openInLodica(uri)
            return null
        }
    }

    private inner class Content : GeckoSession.ContentDelegate {
        override fun onExternalResponse(session: GeckoSession, response: WebResponse) {
            Downloads.save(applicationContext, response, false)
        }

        override fun onFullScreen(session: GeckoSession, fullScreen: Boolean) {
            fullscreen = fullScreen
            setSystemBars(fullScreen)
        }

        override fun onCloseRequest(session: GeckoSession) { finish() }
    }
}
