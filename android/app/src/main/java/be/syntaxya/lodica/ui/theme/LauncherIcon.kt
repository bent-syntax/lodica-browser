package be.syntaxya.lodica.ui.theme

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/** Switches the launcher entry between the dark and the light icon so the app logo follows the theme. */
object LauncherIcon {
    fun apply(ctx: Context, dark: Boolean) {
        val pm = ctx.packageManager
        fun set(name: String, on: Boolean) {
            val cn = ComponentName(ctx.packageName, "be.syntaxya.lodica.ui.$name")
            val want = if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            if (pm.getComponentEnabledSetting(cn) != want) pm.setComponentEnabledSetting(cn, want, PackageManager.DONT_KILL_APP)
        }
        // Enable the new entry first so there is never a moment without a launcher icon.
        if (dark) { set("LauncherDark", true); set("LauncherLight", false) }
        else { set("LauncherLight", true); set("LauncherDark", false) }
    }
}
