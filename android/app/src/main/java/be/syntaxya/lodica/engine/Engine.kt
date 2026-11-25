package be.syntaxya.lodica.engine

import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.mozilla.geckoview.ContentBlocking
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.WebExtension
import org.mozilla.geckoview.WebExtensionController

/** Owns the single GeckoRuntime. Only ever touched from the main process UI. */
object Engine {
    private const val TAG = "LodicaEngine"
    @Volatile private var rt: GeckoRuntime? = null
    var ublock: WebExtension? by mutableStateOf(null)
        private set
    /** True once loading uBlock Origin has failed, so Settings stops saying "loading". */
    var ublockFailed by mutableStateOf(false)
        private set

    val ready: Boolean get() = rt != null

    private fun dohUri() = Prefs.dnsServer.ifBlank { "https://mozilla.cloudflare-dns.com/dns-query" }

    /** Applies the user's own DNS server to the running engine. */
    fun applyDns() {
        val s = rt?.settings ?: return
        s.setTrustedRecursiveResolverMode(GeckoRuntimeSettings.TRR_MODE_FIRST)
        s.setTrustedRecursiveResolverUri(dohUri())
    }

    fun runtime(ctx: Context): GeckoRuntime =
        rt ?: synchronized(this) { rt ?: create(ctx.applicationContext).also { rt = it } }

    private fun create(ctx: Context): GeckoRuntime {
        be.syntaxya.lodica.CrashLog.install(ctx)
        Prefs.init(ctx)
        Secret.init(ctx)
        Vault.init(ctx)
        Meter.init(ctx)
        Playback.init(ctx)
        History.init(ctx)
        Relay.init(ctx)
        Emojis.init(ctx)
        Notifier.schedule(ctx)
        ChatService.start(ctx)
        PcTabs.init(ctx)
        Memory.init(ctx)
        Ai.init(ctx)
        Chats.init()
        Chats.onChange = { PcTabs.changed() }
        Notebook.init(ctx)
        Notebook.onChange = { PcTabs.changed() }

        val blocking = ContentBlocking.Settings.Builder()
            .cookieBehavior(ContentBlocking.CookieBehavior.ACCEPT_FIRST_PARTY_AND_ISOLATE_OTHERS)
            .cookieBehaviorPrivateMode(ContentBlocking.CookieBehavior.ACCEPT_FIRST_PARTY_AND_ISOLATE_OTHERS)
            .emailTrackerBlockingPrivateMode(true)
            .queryParameterStrippingPrivateBrowsingEnabled(true)
            .safeBrowsing(ContentBlocking.SafeBrowsing.DEFAULT)
            .build()
        tune(blocking)

        val settings = GeckoRuntimeSettings.Builder()
            .contentBlocking(blocking)
            .globalPrivacyControlEnabled(true)
            .loginAutofillEnabled(true)
            .locales(Prefs.language.accept)
            .preferredColorScheme(colorScheme())
            .allowInsecureConnections(insecurePolicy())
            .trustedRecursiveResolverMode(GeckoRuntimeSettings.TRR_MODE_FIRST)
            .trustedRecursiveResolverUri(dohUri())
            .aboutConfigEnabled(false)
            .consoleOutput(false)
            .remoteDebuggingEnabled(false)
            .doubleTapZoomingEnabled(true)
            .inputAutoZoomEnabled(false)
            .webManifest(true)
            .extensionsProcessEnabled(true)
            .build()

        val runtime = try {
            GeckoRuntime.create(ctx, settings)
        } catch (e: IllegalStateException) {
            // A runtime already exists in this process (earlier startup failed part-way): reuse it.
            GeckoRuntime.getDefault(ctx)
        }
        // Publish at once: a throw below must not leave rt null, or a relaunch would create a second runtime.
        rt = runtime
        step("fingerprinting") {
            val on = Prefs.mode != Mode.FAST
            runtime.settings.setFingerprintingProtection(on)
            runtime.settings.setFingerprintingProtectionPrivateBrowsing(on)
        }
        // Set again after the protection flags: the page colour scheme must follow the Dark pages switch.
        step("colorScheme") { runtime.settings.setPreferredColorScheme(colorScheme()) }
        step("autocomplete") { runtime.autocompleteStorageDelegate = Vault }
        step("notifications") { SiteNotify.init(ctx); runtime.webNotificationDelegate = SiteNotify }

        step("ublock") { ublockMode(runtime) }
        step("helper") { Helper.install(ctx, runtime) }
        step("extensions") { Extensions.init(ctx) }
        // GeckoView installs its own crash handler while starting; wrap it so Java crashes are still recorded.
        val h = android.os.Handler(android.os.Looper.getMainLooper())
        for (ms in longArrayOf(0, 1000, 4000)) h.postDelayed({ be.syntaxya.lodica.CrashLog.install(ctx) }, ms)
        return runtime
    }

    /** A failing optional step is logged and skipped so the browser still opens. */
    private fun step(name: String, block: () -> Unit) {
        runCatching(block).onFailure {
            Log.e(TAG, "startup step failed: $name", it)
            be.syntaxya.lodica.CrashLog.note("Startup step '$name' failed", it)
        }
    }

    private fun colorScheme() =
        if (Prefs.darkPages || Prefs.forceDark) GeckoRuntimeSettings.COLOR_SCHEME_DARK else GeckoRuntimeSettings.COLOR_SCHEME_LIGHT

    private fun insecurePolicy() =
        if (Prefs.httpsOnly) GeckoRuntimeSettings.HTTPS_ONLY else GeckoRuntimeSettings.HTTPS_ONLY_PRIVATE

    /** Strict tracking rules unless the mode is Fast. Works on a built and on a live settings object. */
    private fun tune(b: ContentBlocking.Settings) {
        val strict = Prefs.mode != Mode.FAST
        b.setAntiTracking(if (strict) ContentBlocking.AntiTracking.STRICT else ContentBlocking.AntiTracking.DEFAULT)
        b.setEnhancedTrackingProtectionLevel(if (strict) ContentBlocking.EtpLevel.STRICT else ContentBlocking.EtpLevel.DEFAULT)
        b.setStrictSocialTrackingProtection(strict)
        b.setCookiePurging(strict)
        b.setQueryParameterStrippingEnabled(strict)
        b.setBounceTrackingProtectionMode(if (strict) ContentBlocking.BounceTrackingProtectionMode.BOUNCE_TRACKING_PROTECTION_MODE_ENABLED
            else ContentBlocking.BounceTrackingProtectionMode.BOUNCE_TRACKING_PROTECTION_MODE_DISABLED)
    }

    /** uBlock Origin stays installed; Fast mode only disables it, so switching back needs no download or reinstall. */
    private fun ublockMode(runtime: GeckoRuntime) {
        val wc = runtime.webExtensionController
        wc.ensureBuiltIn("resource://android/assets/extensions/ubo/", "uBlock0@raymondhill.net")
            .then { ext ->
                if (ext == null) return@then GeckoResult.fromValue<WebExtension>(null)
                val on = Prefs.mode != Mode.FAST
                when {
                    on && !ext.metaData.enabled -> wc.enable(ext, WebExtensionController.EnableSource.APP)
                    !on && ext.metaData.enabled -> wc.disable(ext, WebExtensionController.EnableSource.APP)
                    else -> GeckoResult.fromValue(ext)
                }
            }
            .accept({ ext ->
                if (ext == null) { ublockFailed = true; return@accept }
                ublockFailed = false
                ublock = if (ext.metaData.enabled) ext else null
                if (ublock != null) wc.setAllowedInPrivateBrowsing(ext, true)
            }, { e -> ublockFailed = true; Log.w(TAG, "uBlock Origin failed to load", e) })
    }

    /** Applies a new Mode to the running engine. */
    fun applyMode() {
        val r = rt ?: return
        step("mode") {
            tune(r.settings.contentBlocking)
            val on = Prefs.mode != Mode.FAST
            r.settings.setFingerprintingProtection(on)
            r.settings.setFingerprintingProtectionPrivateBrowsing(on)
            ublockMode(r)
        }
    }

    /** Push pref changes into a live runtime. No-op before the runtime exists. */
    fun applyPrefs() {
        val r = rt ?: return
        r.settings.setPreferredColorScheme(colorScheme())
        r.settings.setAllowInsecureConnections(insecurePolicy())
        if (!r.settings.locales.contentEquals(Prefs.language.accept)) r.settings.setLocales(Prefs.language.accept)
    }
}
