package be.syntaxya.lodica.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp

/**
 * Costume characters: the small SVG subset the relay hands out (flat shapes on a 64x64 canvas).
 * Only the shapes below are read and anything else is skipped, so a bad string draws nothing.
 */
object CostumeSvg {
    class Item(val path: Path, val fill: Color?, val stroke: Color?, val width: Float, val cap: StrokeCap, val join: StrokeJoin)

    private val tag = Regex("""<\s*([a-zA-Z]+)((?:\s+[a-zA-Z:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*/?\s*>""")
    private val attr = Regex("""([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""")

    private fun color(v: String?, default: Color?, alpha: Float): Color? {
        if (v == null) return default?.copy(alpha = alpha)
        if (v == "none") return null
        val h = v.removePrefix("#")
        val full = if (v.startsWith("#") && h.length == 3) h.map { "$it$it" }.joinToString("") else h
        val n = if (v.startsWith("#") && full.length == 6) full.toLongOrNull(16) else null
        return n?.let { Color((0xFF000000 or it).toInt()).copy(alpha = alpha) } ?: default?.copy(alpha = alpha)
    }

    private fun points(v: String): List<Offset> {
        val n = v.split(Regex("[\\s,]+")).filter { it.isNotEmpty() }.mapNotNull { it.toFloatOrNull() }
        return (0 until n.size / 2).map { Offset(n[it * 2], n[it * 2 + 1]) }
    }

    fun parse(svg: String): List<Item> {
        if (svg.length > 6000) return emptyList()
        val out = ArrayList<Item>()
        for (m in tag.findAll(svg)) {
            if (out.size >= 40) break
            val name = m.groupValues[1].lowercase()
            val a = HashMap<String, String>()
            for (x in attr.findAll(m.groupValues[2])) a[x.groupValues[1]] = x.groupValues[2].ifEmpty { x.groupValues[3] }.trim()
            fun f(k: String) = a[k]?.toFloatOrNull()
            val p = runCatching {
                val path = Path()
                when (name) {
                    "circle" -> { val r = f("r") ?: return@runCatching null; val cx = f("cx") ?: 0f; val cy = f("cy") ?: 0f; path.addOval(Rect(cx - r, cy - r, cx + r, cy + r)) }
                    "ellipse" -> { val rx = f("rx") ?: return@runCatching null; val ry = f("ry") ?: return@runCatching null; val cx = f("cx") ?: 0f; val cy = f("cy") ?: 0f; path.addOval(Rect(cx - rx, cy - ry, cx + rx, cy + ry)) }
                    "rect" -> {
                        val w = f("width") ?: return@runCatching null; val h = f("height") ?: return@runCatching null
                        val x = f("x") ?: 0f; val y = f("y") ?: 0f
                        val rx = f("rx") ?: f("ry") ?: 0f; val ry = f("ry") ?: rx
                        path.addRoundRect(RoundRect(Rect(x, y, x + w, y + h), CornerRadius(rx, ry)))
                    }
                    "line" -> { path.moveTo(f("x1") ?: return@runCatching null, f("y1") ?: return@runCatching null); path.lineTo(f("x2") ?: return@runCatching null, f("y2") ?: return@runCatching null) }
                    "polygon", "polyline" -> {
                        val pts = points(a["points"] ?: return@runCatching null)
                        if (pts.size < 2) return@runCatching null
                        path.moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { path.lineTo(it.x, it.y) }
                        if (name == "polygon") path.close()
                    }
                    "path" -> PathParser().parsePathString(a["d"] ?: return@runCatching null).toPath(path)
                    else -> return@runCatching null
                }
                path
            }.getOrNull() ?: continue
            val op = (a["opacity"]?.toFloatOrNull() ?: 1f).coerceIn(0f, 1f)
            val fo = (a["fill-opacity"]?.toFloatOrNull() ?: 1f).coerceIn(0f, 1f)
            val fill = if (name == "line") null else color(a["fill"], Color.Black, op * fo)
            val stroke = color(a["stroke"], null, op)
            val cap = when (a["stroke-linecap"]) { "round" -> StrokeCap.Round; "square" -> StrokeCap.Square; else -> StrokeCap.Butt }
            val join = when (a["stroke-linejoin"]) { "round" -> StrokeJoin.Round; "bevel" -> StrokeJoin.Bevel; else -> StrokeJoin.Miter }
            out.add(Item(p, fill, stroke, (f("stroke-width") ?: 1f).coerceIn(0f, 12f), cap, join))
        }
        return out
    }
}

/** A costume character drawn from [svg], [size] square. Nothing is drawn when the text holds no usable shape. */
@Composable
fun CostumeArt(svg: String, size: Dp, modifier: Modifier = Modifier) {
    val items = remember(svg) { CostumeSvg.parse(svg) }
    Canvas(modifier.size(size)) {
        scale(this.size.width / 64f, Offset.Zero) {
            for (i in items) {
                i.fill?.let { drawPath(i.path, it) }
                i.stroke?.let { if (i.width > 0f) drawPath(i.path, it, style = Stroke(i.width, cap = i.cap, join = i.join)) }
            }
        }
    }
}
