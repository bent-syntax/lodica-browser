package be.syntaxya.lodica.ui.theme

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs

/** A holiday theme. It can be claimed from [WINDOW] days before to [WINDOW] days after the holiday; a claim stays for ever. */
class Holiday(val id: String, val label: String, val month: Int, val day: Int, val palette: Palette)

const val HOLIDAY_WINDOW = 7

val Holidays: List<Holiday> = listOf(
    Holiday("new-year", "New Year", 1, 1, Palette("new-year", "New Year", true, 0xFF0B0F2A, 0xFF151B45, 0xFF232B66, 0xFFFFD700, 0xFFFF4D8D, 0xFFF1F3FF, 0xFFA5ADE0)),
    Holiday("valentine", "Valentine's Day", 2, 14, Palette("valentine", "Valentine", true, 0xFF2A0F1C, 0xFF3A1527, 0xFF52203A, 0xFFFF5C8A, 0xFFFF3B5C, 0xFFFFE9F0, 0xFFE0A9BE)),
    Holiday("halloween", "Halloween", 10, 31, Palette("halloween", "Halloween", true, 0xFF120A1A, 0xFF1F1430, 0xFF33224A, 0xFFFF7A18, 0xFFFF4D6D, 0xFFF3E8FF, 0xFFB49BD1)),
    Holiday("christmas", "Christmas", 12, 25, Palette("christmas", "Christmas", true, 0xFF0B1F17, 0xFF123524, 0xFF1E4D35, 0xFFE63946, 0xFFFF6B6B, 0xFFF5F7F2, 0xFFA9C4B3)),
)

fun holiday(id: String): Holiday? = Holidays.firstOrNull { it.id == id }

/** Whole days from [today] to the nearest occurrence of [h] (negative once it has passed). */
fun daysTo(h: Holiday, today: LocalDate = LocalDate.now()): Long =
    (today.year - 1..today.year + 1).map { ChronoUnit.DAYS.between(today, LocalDate.of(it, h.month, h.day)) }.minByOrNull { abs(it) }!!

fun canClaim(id: String, today: LocalDate = LocalDate.now()): Boolean =
    holiday(id)?.let { abs(daysTo(it, today)) <= HOLIDAY_WINDOW } ?: false
