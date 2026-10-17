package be.syntaxya.lodica.ui.theme

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/** Switches the launcher entry to the icon that matches the active theme: its background and its kite colours. */
object LauncherIcon {
    private val entries = mapOf(
        "dark" to "LauncherDark", "light" to "LauncherLight",
        "everforest_dark" to "LauncherEverforestDark", "everforest_light" to "LauncherEverforestLight",
        "nord" to "LauncherNord", "gruvbox" to "LauncherGruvbox", "catppuccin_mocha" to "LauncherCatppuccinMocha",
        "tokyo_night" to "LauncherTokyoNight", "rose_pine" to "LauncherRosePine", "solarized_dark" to "LauncherSolarizedDark",
    )

    private fun dist(a: Long, b: Long): Int {
        fun d(s: Int) = (((a shr s) and 0xFF) - ((b shr s) and 0xFF)).toInt().let { it * it }
        return d(16) + d(8) + d(0)
    }

    /** Built-in palette closest to the active one; a custom theme has no icon of its own. */
    private fun nearest(p: Palette): String =
        if (entries.containsKey(p.key)) p.key
        else Palettes.minBy { dist(it.bg, p.bg) + dist(it.accent, p.accent) }.key

    fun apply(ctx: Context, p: Palette) {
        val pm = ctx.packageManager
        val want = entries.getValue(nearest(p))
        fun set(name: String, on: Boolean) {
            val cn = ComponentName(ctx.packageName, "be.syntaxya.lodica.ui.$name")
            val state = if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            if (pm.getComponentEnabledSetting(cn) != state) pm.setComponentEnabledSetting(cn, state, PackageManager.DONT_KILL_APP)
        }
        // Enable the new entry first so there is never a moment without a launcher icon.
        set(want, true)
        for (n in entries.values) if (n != want) set(n, false)
    }
}
