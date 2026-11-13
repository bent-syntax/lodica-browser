package be.syntaxya.lodica.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** Brief icon style: 24 grid, 1.75 stroke, round caps and joins, no fills. Paths match desktop/ui/js/icons.js. */
private fun stroked(name: String, d: String): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).addPath(
        pathData = addPathNodes(d),
        fill = null,
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 1.75f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ).build()

object LodicaIcons {
    /** Menu: vertical three dots. */
    val Remove: ImageVector by lazy { stroked("remove", "M5 12h14") }
    val Sliders: ImageVector get() = Settings
    val MoreVertical: ImageVector by lazy { stroked("more_vertical", ICONS_MORE) }
    val Close: ImageVector by lazy { stroked("close", "M6 6l12 12M18 6L6 18") }
    val Delete: ImageVector by lazy { stroked("delete", "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3") }
    val Add: ImageVector by lazy { stroked("add", "M12 5v14M5 12h14") }
    val Search: ImageVector by lazy { stroked("search", "M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0zM20.5 20.5 16 16") }
    val Ai: ImageVector by lazy { stroked("ai", "M10 4l1.8 4.7L16.5 10.5l-4.7 1.8L10 17l-1.8-4.7L3.5 10.5l4.7-1.8zM18 3v4M16 5h4M18 15v4M16 17h4") }
    val Lock: ImageVector by lazy { stroked("lock", "M6 11h12a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3") }
    val Shield: ImageVector by lazy { stroked("shield", "M12 3 5 6v5.5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z") }
    val History: ImageVector by lazy { stroked("history", "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8M12 7.5V12l3 2") }
    val Download: ImageVector by lazy { stroked("download", "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14") }
    val Globe: ImageVector by lazy { stroked("globe", "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z") }
    val Copy: ImageVector by lazy { stroked("copy", "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1") }
    val Private: ImageVector by lazy { stroked("private", "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4 4l16 16") }
    val Preview: ImageVector by lazy { stroked("preview", "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z") }
    val Share: ImageVector by lazy { stroked("share", "M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7") }
    val Reload: ImageVector by lazy { stroked("reload", "M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5") }
    val Palette: ImageVector by lazy { stroked("palette", "M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4-4-8-9-8zM6.9 11a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM9.4 7.5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM13.9 7.5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0z") }
    val Link: ImageVector by lazy { stroked("link", "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1") }
    val Key: ImageVector by lazy { stroked("key", "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM11 12l9-9M16 7l3 3M14 9l2 2") }
    val Back: ImageVector by lazy { stroked("back", "M19 12H5M11 5l-7 7 7 7") }
    val Forward: ImageVector by lazy { stroked("forward", "M5 12h14M13 5l7 7-7 7") }
    val Tabs: ImageVector by lazy { stroked("tabs", "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9.5h18M10 5v4.5") }
    val Play: ImageVector by lazy { stroked("play", "M7 4.5v15l12-7.5z") }
    val Pause: ImageVector by lazy { stroked("pause", "M8 5v14M16 5v14") }
    val Email: ImageVector by lazy { stroked("email", "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6.5L21 7") }
    val Check: ImageVector by lazy { stroked("check", "M5 12.5l4.5 4.5L19 7.5") }
    val Chat: ImageVector by lazy { stroked("chat", "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z") }
    val Lite: ImageVector by lazy { stroked("lite", "M13 3 5 13.5h6L10 21l8-10.5h-6z") }
    val Open: ImageVector by lazy { stroked("open", "M14 4h6v6M20 4 11 13M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5") }
    val Chevron: ImageVector by lazy { stroked("chevron", "M9 6l6 6-6 6") }
    val Warning: ImageVector by lazy { stroked("warning", "M12 3.5 2.5 20h19zM12 10v4.5M12 17.5v.01") }
    val Vpn: ImageVector by lazy { stroked("vpn", "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 16a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 8v.01M8 17v.01") }
    val Unarchive: ImageVector by lazy { stroked("unarchive", "M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M12 17v-6M9.5 13.5 12 11l2.5 2.5") }
    val Settings: ImageVector by lazy { stroked("settings", "M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4h4V5zM7 15v4h4v-4z") }
    val Speed: ImageVector by lazy { stroked("speed", "M4 18a9 9 0 1 1 16 0M12 14l4-5M12 14v.01") }
    val Phone: ImageVector by lazy { stroked("phone", "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2") }
    val ShieldOff: ImageVector by lazy { stroked("shieldOff", "M5 6v5.5c0 4.4 3 8.3 7 9.5 1.6-.5 3-1.4 4.2-2.7M9 4.4 12 3l7 3v5.5c0 1.2-.2 2.3-.6 3.4M3 3l18 18") }
    val Image: ImageVector by lazy { stroked("image", "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7.5 9a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0zM20 15l-4.5-4.5L6 20") }
    val Home: ImageVector by lazy { stroked("home", "M4 11.5 12 5l8 6.5M6 10v9h12v-9M10 19v-5h4v5") }
    val Folder: ImageVector by lazy { stroked("folder", "M3 6a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z") }
    val Smile: ImageVector by lazy { stroked("smile", "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5v.01M15 9.5v.01") }
    val Desktop: ImageVector by lazy { stroked("desktop", "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 21h8M12 17v4") }
    val Clip: ImageVector by lazy { stroked("clip", "M20 11.5 11.5 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8-8") }
    val Down: ImageVector by lazy { stroked("down", "M6 9l6 6 6-6") }
    val Up: ImageVector by lazy { stroked("up", "M6 15l6-6 6 6") }
    val Apps: ImageVector by lazy { stroked("apps", "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z") }
    val Inbox: ImageVector by lazy { stroked("inbox", "M3 13l3-8h12l3 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 13h5a4 4 0 0 0 8 0h5") }
    val Archive: ImageVector by lazy { stroked("archive", "M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4") }
    val Alarm: ImageVector by lazy { stroked("alarm", "M4.5 13a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0zM12 9v4l2.5 1.5M4 5 7 3M20 5l-3-2") }
    val Hd: ImageVector by lazy { stroked("hd", "M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9v6M8 12h3M11 9v6M14 9h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2z") }
    val Install: ImageVector by lazy { stroked("install", "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 8v6M9.5 11.5 12 14l2.5-2.5") }
    val Compat: ImageVector by lazy { stroked("compat", "M14.5 6.5a4 4 0 0 0-5.2 5.2L3.5 17.5a2 2 0 0 0 3 3l5.8-5.8a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.3-.6-.6-2.3z") }
    val MoreH: ImageVector by lazy { stroked("moreH", "M5 11.4a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 1 0 0 -1.2zM12 11.4a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 1 0 0 -1.2zM19 11.4a0.6 0.6 0 1 0 0 1.2a0.6 0.6 0 1 0 0 -1.2z") }
    val Edit: ImageVector by lazy { stroked("edit", "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4") }
    val Reader: ImageVector by lazy { stroked("reader", "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 12.5h8M8 16h5") }
    val Data: ImageVector by lazy { stroked("data", "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z") }
    val Find: ImageVector by lazy { stroked("find", "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9.3 13.5a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0zM13.2 15.2 15 17") }
}

private const val ICONS_MORE = "M11.4 5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM11.4 12a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0zM11.4 19a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0z"
