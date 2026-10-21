package be.syntaxya.lodica.engine

import android.content.Context
import android.util.Log
import org.mozilla.geckoview.ContentBlocking
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.WebExtension

/** Owns the single GeckoRuntime. Only ever touched from the main process UI. */
object Engine {
    private const val TAG = "LodicaEngine"
    @Volatile private var rt: GeckoRuntime? = null
    var ublock: WebExtension? = null
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
        Vault.init(ctx)
        Meter.init(ctx)
        Playback.init(ctx)
        History.init(ctx)
        Relay.init(ctx)
        Notifier.schedule(ctx)
        ChatService.start(ctx)
        PcTabs.init(ctx)
        Memory.init(ctx)
        Ai.init(ctx)
        Chats.init()
        Chats.onChange = { PcTabs.changed() }

        val blocking = ContentBlocking.Settings.Builder()
            .antiTracking(ContentBlocking.AntiTracking.STRICT)
            .enhancedTrackingProtectionLevel(ContentBlocking.EtpLevel.STRICT)
            .cookieBehavior(ContentBlocking.CookieBehavior.ACCEPT_FIRST_PARTY_AND_ISOLATE_OTHERS)
            .cookieBehaviorPrivateMode(ContentBlocking.CookieBehavior.ACCEPT_FIRST_PARTY_AND_ISOLATE_OTHERS)
            .strictSocialTrackingProtection(true)
            .cookiePurging(true)
            .emailTrackerBlockingPrivateMode(true)
            .queryParameterStrippingEnabled(true)
            .queryParameterStrippingPrivateBrowsingEnabled(true)
            .bounceTrackingProtectionMode(ContentBlocking.BounceTrackingProtectionMode.BOUNCE_TRACKING_PROTECTION_MODE_ENABLED)
            .safeBrowsing(ContentBlocking.SafeBrowsing.DEFAULT)
            .build()

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
            runtime.settings.setFingerprintingProtection(true)
            runtime.settings.setFingerprintingProtectionPrivateBrowsing(true)
        }
        step("autocomplete") { runtime.autocompleteStorageDelegate = Vault }

        step("ublock") { runtime.webExtensionController
            .ensureBuiltIn("resource://android/assets/extensions/ubo/", "uBlock0@raymondhill.net")
            .accept({ ext ->
                if (ext == null) return@accept
                ublock = ext
                runtime.webExtensionController.setAllowedInPrivateBrowsing(ext, true)
            }, { e -> Log.w(TAG, "uBlock Origin failed to load", e) }) }
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
        if (Prefs.darkPages) GeckoRuntimeSettings.COLOR_SCHEME_DARK else GeckoRuntimeSettings.COLOR_SCHEME_SYSTEM

    private fun insecurePolicy() =
        if (Prefs.httpsOnly) GeckoRuntimeSettings.HTTPS_ONLY else GeckoRuntimeSettings.HTTPS_ONLY_PRIVATE

    /** Push pref changes into a live runtime. No-op before the runtime exists. */
    fun applyPrefs() {
        val r = rt ?: return
        r.settings.setPreferredColorScheme(colorScheme())
        r.settings.setAllowInsecureConnections(insecurePolicy())
        if (!r.settings.locales.contentEquals(Prefs.language.accept)) r.settings.setLocales(Prefs.language.accept)
    }
}
