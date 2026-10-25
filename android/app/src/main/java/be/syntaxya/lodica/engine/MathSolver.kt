package be.syntaxya.lodica.engine

import java.math.BigDecimal
import java.math.MathContext
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.sqrt

private typealias F2 = (Double, Double) -> Double

/** Math answer for selected text: "12*(3+4)" gives "84", "3x - 24 = -6" gives "x = 6". Port of calc and solve in the helper extension's content.js. Keep in step. */
object MathSolver {
    private class Bad : Exception()

    fun answer(text: String): String? = solve(text) ?: calc(text)

    private val ci = RegexOption.IGNORE_CASE

    /** JS String(Number(v.toPrecision(p))) for the ranges used here. */
    private fun num(v: Double, p: Int): String {
        if (v == 0.0) return "0"
        if (abs(v) < 1e-6) return String.format(java.util.Locale.ROOT, "%.${p - 1}e", v).replace(Regex("e([+-])0*(\\d)"), "e$1$2").replaceFirst(Regex("\\.?0+e"), "e")
        return BigDecimal(v).round(MathContext(p)).stripTrailingZeros().toPlainString()
    }

    /** 0.75 gives "3/4", 2.5 gives "5/2"; irrational or large-denominator values stay decimal. Port of mathFrac in desktop/ui/js/mathsolve.js. Keep in step. */
    fun frac(n: Double, prec: Int = 12): String {
        if (n.isNaN() || n.isInfinite()) return n.toString()
        val dec = num(n, prec)
        val d = dec.toDoubleOrNull() ?: return dec
        if (d == Math.rint(d) || abs(n) >= 1e9) return dec
        val x = abs(n)
        var h0 = 0.0; var h1 = 1.0; var k0 = 1.0; var k1 = 0.0; var y = x
        for (i in 0 until 24) {
            val a = Math.floor(y)
            val h = a * h1 + h0; val k = a * k1 + k0
            h0 = h1; h1 = h; k0 = k1; k1 = k
            if (k1 > 1000) return dec
            if (abs(x - h1 / k1) < 1e-9 * maxOf(1.0, x)) {
                return if (k1 == 1.0) dec else (if (n < 0) "-" else "") + h1.toLong() + "/" + k1.toLong()
            }
            val f = y - a
            if (f < 1e-12) break
            y = 1 / f
        }
        return dec
    }

    /** With [raw] the result is a plain decimal (used by solve); otherwise fractions are shown. */
    fun calc(src: String, raw: Boolean = false): String? {
        var s = src.trim().replace(Regex("\\s*=\\s*\\??\\s*$"), "")
        if (s.isEmpty() || s.length > 200 || !Regex("\\d").containsMatchIn(s)) return null
        s = s.replace(Regex("[×·⋅]"), "*").replace("÷", "/").replace(Regex("[−–—]"), "-").replace(' ', ' ')
        s = s.replace(Regex("(?<=[\\d)])\\s*x\\s*(?=[\\d(])", ci), "*").replace("**", "^")
        if (!Regex("^[\\d\\s.,+\\-*/^%()a-z]+$", ci).matches(s)) return null
        if (Regex("^\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}$").matches(s) || Regex("^\\+?[\\d\\s()-]{7,}$").matches(s) && !Regex("[+*/^%]").containsMatchIn(s)) return null
        if (!Regex("[+\\-*/^%]|sqrt|pi", ci).containsMatchIn(s)) return null
        if (Regex("^-?[\\d.,]+(?:\\s*-\\s*[\\d.,]+)$").matches(s) && !Regex("\\s").containsMatchIn(s)) return null
        // 1,234.5 and 1.234,5 both read as one number; a lone comma is a decimal comma
        s = s.replace(Regex("\\d[\\d.,]*")) { m ->
            val n = m.value
            val c = n.lastIndexOf(','); val d = n.lastIndexOf('.')
            when {
                c < 0 -> n
                d >= 0 -> if (c > d) n.replace(".", "").replace(",", ".") else n.replace(",", "")
                Regex("^\\d{1,3}(,\\d{3})+$").matches(n) -> n.replace(",", "")
                else -> n.replace(",", ".")
            }
        }
        val t = Regex("\\d+\\.?\\d*|\\.\\d+|sqrt|pi|[+\\-*/^%()]|\\s+", ci).findAll(s).map { it.value }.toList()
        if (t.joinToString("") != s) return null
        val tk = t.filter { it.isNotBlank() }
        var i = 0
        var ops = 0
        fun peek() = tk.getOrNull(i)
        lateinit var expr: () -> Double
        lateinit var unary: () -> Double
        fun atom(): Double {
            val x = tk.getOrNull(i++) ?: throw Bad()
            if (x == "(") { val v = expr(); if (tk.getOrNull(i++) != ")") throw Bad(); return v }
            if (x.equals("sqrt", true)) { ops++; return sqrt(atom()) }
            if (x.equals("pi", true)) return Math.PI
            if (x[0].isDigit() || x[0] == '.') return x.toDouble()
            throw Bad()
        }
        fun post(): Double {
            var v = atom()
            while (peek() == "%") { i++; v /= 100; ops++ }
            return v
        }
        fun power(): Double {
            val b = post()
            if (peek() == "^") { i++; val e = unary(); ops++; return b.pow(e) }
            return b
        }
        unary = {
            when (peek()) {
                "-" -> { i++; -unary() }
                "+" -> { i++; unary() }
                else -> power()
            }
        }
        fun term(): Double {
            var v = unary()
            while (peek() == "*" || peek() == "/") { val o = tk[i++]; val r = unary(); v = if (o == "*") v * r else v / r; ops++ }
            return v
        }
        expr = {
            var v = term()
            while (peek() == "+" || peek() == "-") { val o = tk[i++]; val r = term(); v = if (o == "+") v + r else v - r; ops++ }
            v
        }
        val v = try { expr().also { if (i != tk.size) return null } } catch (e: Bad) { return null }
        if (ops == 0 || v.isNaN() || v.isInfinite()) return null
        if (abs(v) >= 1e15 || (v != 0.0 && abs(v) < 1e-9)) return String.format(java.util.Locale.ROOT, "%.6e", v).replace(Regex("e([+-])0*(\\d)"), "e$1$2").replaceFirst(Regex("\\.?0+e"), "e")
        return if (raw) num(v, 12) else frac(v, 12)
    }

    /** "3x - 24 = -6" gives "x = 6"; one letter unknown, degree 1 or 2. */
    fun solve(src: String): String? {
        val s = src.trim().replace(Regex("[−–—]"), "-").replace(Regex("[×·⋅]"), "*").replace("÷", "/").replace("**", "^")
        if (s.length > 120 || s.count { it == '=' } != 1) return null
        val (l, r) = s.split("=")
        if (l.isBlank() || r.isBlank()) return null
        val vars = Regex("[a-z]", ci).findAll(s.replace(Regex("sqrt|pi", ci), "")).map { it.value.lowercase() }.toSet()
        if (vars.size != 1) return null
        val v = vars.first()
        if (!Regex("^[\\d\\s.,+\\-*/^%()a-z=]+$", ci).matches(s) || !Regex("\\d").containsMatchIn(s)) return null
        fun side(t: String, x: Int): String = t.replace(Regex("sqrt|pi", ci)) { "\u0000" + it.value.lowercase() + "\u0000" }
            .replace(Regex(v, ci), "\u0001")
            .replace(Regex("(?<=[\\d)])\\s*(?=\u0001)"), "*").replace(Regex("(?<=\u0001)\\s*(?=[\\d(])"), "*").replace(Regex("\u0001\\s*(?=\u0001)"), "\u0001*")
            .replace("\u0001", "($x)").replace("\u0000", "").replace(Regex("(?<=[\\d)])\\s*(?=\\()"), "*")
        fun f(x: Int): Double = calc("(" + side(l, x) + ")-(" + side(r, x) + ")", true)?.toDoubleOrNull() ?: Double.NaN
        val f0 = f(0); val f1 = f(1); val f2 = f(2); val f3 = f(3)
        if (listOf(f0, f1, f2, f3).any { it.isNaN() || it.isInfinite() }) return null
        val a = (f2 - 2 * f1 + f0) / 2; val b = f1 - f0 - a; val c = f0
        val tol = 1e-7 * (1 + abs(f0) + abs(f1) + abs(f2))
        if (abs(a * 9 + b * 3 + c - f3) > tol) return null
        val eps = 1e-9
        if (abs(a) < eps) {
            if (abs(b) < eps) return null
            return "$v = " + frac(-c / b, 10)
        }
        val d = b * b - 4 * a * c
        if (d < -eps) return null
        if (abs(d) <= eps) return "$v = " + frac(-b / (2 * a), 10)
        val q = sqrt(d); val x1 = (-b - q) / (2 * a); val x2 = (-b + q) / (2 * a)
        return "$v = " + frac(minOf(x1, x2), 10) + " or " + frac(maxOf(x1, x2), 10)
    }

    private val graphFns: Map<String, (Double) -> Double> = mapOf(
        "sin" to { v -> kotlin.math.sin(v) }, "cos" to { v -> kotlin.math.cos(v) }, "tan" to { v -> kotlin.math.tan(v) },
        "ln" to { v -> kotlin.math.ln(v) }, "log" to { v -> kotlin.math.log10(v) }, "exp" to { v -> kotlin.math.exp(v) },
        "abs" to { v -> abs(v) }, "sqrt" to { v -> sqrt(v) },
    )

    /** Function of x for "y = x^2", "f(x) = sin(x)", "4y = 3x + 6" (linear in y) or a bare expression in x, or null. Port of mathGraph in desktop/ui/js/mathsolve.js. Keep in step. */
    fun graph(src: String): ((Double) -> Double)? {
        var s = src.trim().lowercase().replace(Regex("[−–—]"), "-").replace(Regex("[×·⋅]"), "*").replace("÷", "/").replace("**", "^").replace("π", "pi")
        if (s.isEmpty() || s.length > 120) return null
        s = s.replace(Regex("^f\\s*\\(\\s*x\\s*\\)\\s*="), "y=")
        val parts = s.split("=")
        if (parts.size > 2) return null
        val used = HashSet<String>()
        // a bare expression in x is read as y = expression
        val l = side(if (parts.size == 2) parts[0] else "y", used) ?: return null
        val r = side(if (parts.size == 2) parts[1] else s, used) ?: return null
        if ("x" !in used || "y" !in used) return null
        val g = { x: Double, y: Double -> l(x, y) - r(x, y) }
        // only equations linear in y can be drawn as a function of x
        val g0 = g(1.3, 0.0); val g1 = g(1.3, 1.0); val g2 = g(1.3, 2.0)
        if ((g0 + g1 + g2).let { it.isNaN() || it.isInfinite() } || abs(g2 - 2 * g1 + g0) > 1e-9 * (1 + abs(g0) + abs(g1) + abs(g2))) return null
        return { x -> val a = g(x, 0.0); -a / (g(x, 1.0) - a) }
    }

    /** x values where f crosses y = 0, found on -100..100. Port of graphRoots in desktop/ui/js/mathsolve.js. */
    fun graphRoots(f: (Double) -> Double): List<Double> {
        val out = ArrayList<Double>()
        val n = 2000; val lo = -100.0; val hi = 100.0
        var x0 = lo; var a = f(lo)
        for (i in 1..n) {
            val x1 = lo + (hi - lo) * i / n; val b = f(x1)
            if (a.isFinite() && b.isFinite() && (a == 0.0 || a * b < 0)) {
                var l = x0; var r = x1; var fl = a
                var k = 0
                while (k < 50 && a != 0.0) {
                    val m = (l + r) / 2; val fm = f(m)
                    if (fl * fm <= 0) r = m else { l = m; fl = fm }
                    k++
                }
                val x = if (a == 0.0) x0 else (l + r) / 2
                // a jump over zero (tan, 1/x) is not a crossing
                if (abs(f(x)) < 1e-6 * (1 + abs(a) + abs(b)) && out.none { abs(it - x) < 1e-6 }) out.add(x)
            }
            x0 = x1; a = b
        }
        return out
    }

    /** One side of an equation as a function of (x, y); [used] collects the variables met. */
    private fun side(s: String, used: MutableSet<String>): F2? {
        if (!Regex("^[\\d\\s.+\\-*/^()a-z]+$").matches(s)) return null
        val t = Regex("\\d+\\.?\\d*|\\.\\d+|[a-z]+|[+\\-*/^()]").findAll(s).map { it.value }.toList()
        if (t.joinToString("") != s.replace(Regex("\\s+"), "")) return null
        // 2x, 2(x+1), x(x+1) and )( read as a product
        val isVal = Regex("^[\\d.]|^[a-z]+$|^\\)$")
        val startsVal = Regex("^[\\d.]|^[a-z]+$|^\\($")
        val tk = ArrayList<String>()
        for (x in t) {
            val p = tk.lastOrNull()
            if (p != null && isVal.containsMatchIn(p) && p !in graphFns && startsVal.containsMatchIn(x)) tk.add("*")
            tk.add(x)
        }
        var i = 0
        fun peek() = tk.getOrNull(i)
        lateinit var expr: () -> F2
        lateinit var unary: () -> F2
        fun atom(): F2 {
            val w = tk.getOrNull(i++) ?: throw Bad()
            if (w == "(") { val f = expr(); if (tk.getOrNull(i++) != ")") throw Bad(); return f }
            if (w[0].isDigit() || w[0] == '.') { val n = w.toDoubleOrNull() ?: throw Bad(); return { _, _ -> n } }
            if (w == "x") { used.add("x"); return { x, _ -> x } }
            if (w == "y") { used.add("y"); return { _, y -> y } }
            if (w == "pi") return { _, _ -> Math.PI }
            if (w == "e") return { _, _ -> Math.E }
            val g = graphFns[w] ?: throw Bad()
            val a = atom()
            return { x, y -> g(a(x, y)) }
        }
        unary = unary@{
            if (peek() == "-") {
                i++
                val a = unary()
                val neg: F2 = { x, y -> -a(x, y) }
                return@unary neg
            }
            if (peek() == "+") { i++; return@unary unary() }
            val b = atom()
            if (peek() == "^") {
                i++
                val e = unary()
                val pw: F2 = { x, y -> b(x, y).pow(e(x, y)) }
                return@unary pw
            }
            b
        }
        fun term(): F2 {
            var f = unary()
            while (peek() == "*" || peek() == "/") {
                val o = tk[i++]; val a = f; val b = unary()
                val mul: F2 = { x, y -> a(x, y) * b(x, y) }
                val div: F2 = { x, y -> a(x, y) / b(x, y) }
                f = if (o == "*") mul else div
            }
            return f
        }
        expr = {
            var f = term()
            while (peek() == "+" || peek() == "-") {
                val o = tk[i++]; val a = f; val b = term()
                val add: F2 = { x, y -> a(x, y) + b(x, y) }
                val sub: F2 = { x, y -> a(x, y) - b(x, y) }
                f = if (o == "+") add else sub
            }
            f
        }
        return try { val f = expr(); if (i == tk.size) f else null } catch (e: Bad) { null }
    }
}
