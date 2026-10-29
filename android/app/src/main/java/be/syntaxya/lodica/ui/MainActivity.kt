package be.syntaxya.lodica.ui

import android.app.PictureInPictureParams
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Rational
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import be.syntaxya.lodica.CrashLog
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import be.syntaxya.lodica.engine.History
import be.syntaxya.lodica.engine.TotpMigration
import be.syntaxya.lodica.engine.Engine
import be.syntaxya.lodica.engine.PcTabs
import be.syntaxya.lodica.engine.Prefs
import be.syntaxya.lodica.engine.Notifier
import be.syntaxya.lodica.engine.Relay
import be.syntaxya.lodica.tabs.TabManager
import be.syntaxya.lodica.tabs.TabStore
import be.syntaxya.lodica.ui.theme.LodicaTheme
import java.io.File

class MainActivity : HostActivity() {

    private var stoppedAt = 0L
    private var clipStamp = 0L
    private var showingReport = false

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        CrashLog.pending(this)?.let { showingReport = true; showCrashReport(it); return }
        Engine.runtime(this)
        Relay.loadSetup(this)
        Prompts.init(this)
        TabManager.init(this)
        if (savedInstanceState == null || intent?.action == SearchWidget.ACTION_SEARCH) handle(intent)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val tab = TabManager.current
                when {
                    TabManager.fullscreen -> TabManager.exitFullscreen()
                    Ui.back() -> Unit
                    tab?.canBack == true -> tab.session?.goBack()
                    else -> moveTaskToBack(true)
                }
            }
        })

        setContent {
            LaunchedEffect(TabManager.fullscreen) {
                val c = androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
                if (TabManager.fullscreen) {
                    c.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    c.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                } else c.show(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            }
            LodicaTheme { Intro { if (Relay.setupDone) LodicaRoot() else SetupScreen() } } }
    }

    /** Shown on the launch after a crash, before the engine starts, so the cause can be read and copied. */
    private fun showCrashReport(report: String) {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply { this.text = report; textSize = 12f; setTextIsSelectable(true) }
        val copy = Button(this).apply {
            this.text = "Copy report"
            setOnClickListener {
                (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager)
                    .setPrimaryClip(ClipData.newPlainText("Lodica crash report", report))
            }
        }
        val go = Button(this).apply {
            this.text = "Continue"
            setOnClickListener { CrashLog.clear(this@MainActivity); recreate() }
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 3, pad, pad)
            addView(TextView(this@MainActivity).apply { this.text = "Lodica crashed last time"; textSize = 18f })
            addView(ScrollView(this@MainActivity).apply { addView(text) }, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(copy)
            addView(go)
        }
        setContentView(col)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(i: Intent?) {
        i ?: return
        if (i.action == Relay.ACTION_MAIL) {
            Ui.menuOpen = false
            Relay.incoming = null
            Relay.selected = i.getStringExtra(Relay.EXTRA_MAIL)
            Ui.screen = Screen.Inbox
            return
        }
        if (i.action == Notifier.ACTION_OPEN) {
            Ui.menuOpen = false
            Ui.screen = if (i.getStringExtra(Notifier.EXTRA_TARGET) == Notifier.TARGET_CHAT) Screen.Room else Screen.Settings
            return
        }
        if (i.action == ShortcutsWidget.ACTION_SHORTCUT) {
            Ui.closeAll()
            when (i.getStringExtra(ShortcutsWidget.EXTRA_TO)) {
                "chat" -> Ui.screen = Screen.Room
                "inbox" -> Ui.screen = Screen.Inbox
                "settings" -> Ui.screen = Screen.Settings
                else -> { TabManager.open(TabManager.HOME); window.decorView.post { Ui.editing = true } }
            }
            return
        }
        if (i.action == SearchWidget.ACTION_SEARCH) {
            Ui.closeAll()
            // Always a fresh blank tab with the address bar focused, ready to type in.
            TabManager.open(TabManager.HOME)
            window.decorView.post { Ui.editing = true }
            return
        }
        if (i.action == Intent.ACTION_PROCESS_TEXT) {
            val text = i.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()?.trim().orEmpty()
            val url = URL.find(text)?.value ?: text.takeIf { it.isNotEmpty() }?.let(Prefs::resolve) ?: return
            Ui.menuOpen = false
            if (i.component?.className?.endsWith("PreviewAlias") == true) Ui.preview = url
            else { Ui.screen = Screen.Browser; TabManager.open(url) }
            return
        }
        if (i.action == Intent.ACTION_VIEW && TotpMigration.isLink(i.dataString.orEmpty())) {
            Ui.pendingMigration = i.dataString
            Ui.menuOpen = false
            Ui.screen = Screen.Settings
            return
        }
        val target = when (i.action) {
            Intent.ACTION_VIEW -> i.dataString?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
            Intent.ACTION_WEB_SEARCH -> i.getStringExtra(SearchManager.QUERY)?.let(Prefs::resolve)
            Intent.ACTION_SEND -> i.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() }?.let(Prefs::resolve)
            else -> null
        } ?: return
        Ui.screen = Screen.Browser
        Ui.menuOpen = false
        val cur = TabManager.current
        // Reuse an untouched start tab instead of piling up blanks.
        if (cur != null && cur.url == TabManager.HOME && !cur.private) TabManager.load(target, cur)
        else TabManager.open(target)
    }

    override fun onStart() {
        super.onStart()
        // Private tabs lock again after a minute away.
        if (stoppedAt != 0L && SystemClock.elapsedRealtime() - stoppedAt > LOCK_AFTER) TabManager.lockPrivate()
    }

    /**
     * Android only lets the focused app read the clipboard, so a link copied elsewhere is offered when
     * Lodica comes back. The description is checked first: reading it shows no "pasted" toast.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus || showingReport) return
        val cm = getSystemService(ClipboardManager::class.java) ?: return
        val desc = cm.primaryClipDescription ?: return
        if (!desc.hasMimeType("text/*")) return
        if (Build.VERSION.SDK_INT >= 26) {
            if (desc.timestamp == clipStamp) return
            clipStamp = desc.timestamp
        }
        val text = runCatching { cm.primaryClip?.getItemAt(0)?.text?.toString()?.trim() }.getOrNull() ?: return
        if (text == Ui.clipSeen) return
        Ui.clipSeen = text
        val url = URL.find(text)?.value?.takeIf { it.length >= text.length - 2 } ?: return
        if (url != TabManager.current?.url) Ui.clipLink = url
    }

    override fun onResume() {
        super.onResume()
        be.syntaxya.lodica.engine.Tilt.resume(this)
    }

    override fun onPause() {
        super.onPause()
        be.syntaxya.lodica.engine.Tilt.pause()
        // Keep the card of the page in view fresh, so it is not a bare logo after a restart.
        TabManager.current?.let { be.syntaxya.lodica.ui.captureThumbnail(it) }
    }

    override fun onStop() {
        super.onStop()
        be.syntaxya.lodica.ui.theme.LauncherIcon.flush(applicationContext)
        if (showingReport) return
        stoppedAt = SystemClock.elapsedRealtime()
        TabManager.save()
        TabStore.flushNow()
        PcTabs.flush()
    }

    override fun onDestroy() {
        Ui.gecko = null
        super.onDestroy()
    }

    /** Video playing fullscreen: drop into picture-in-picture when the user leaves. */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (TabManager.fullscreen && Build.VERSION.SDK_INT >= 26 &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        ) {
            runCatching { enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build()) }
        }
    }

    private companion object {
        const val LOCK_AFTER = 60_000L
        val URL = Regex("""https?://[^\s<>"']+""")
    }
}
