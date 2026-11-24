package app.toque.ui

import android.view.View
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Défilement au bouton rotatif, fluide même quand on tourne vite : chaque cran ajoute de la
 * distance à parcourir, et la vue la rattrape image par image (un quart du reste à chaque image).
 * Les crans s'additionnent sans relancer d'animation, donc sans à-coups.
 *
 * [scrollBy] fait défiler la vue de n pixels (ScrollView.scrollBy, AbsListView.scrollListBy…).
 */
class KnobScroll(private val view: View, private val stepPx: Int, private val scrollBy: (Int) -> Unit) {
    private var remaining = 0f
    private var running = false

    private val frame = object : Runnable {
        override fun run() {
            val move = remaining * 0.25f
            val px = if (abs(move) < 1f) remaining.roundToInt() else move.roundToInt()
            // Plus de place dans ce sens : on abandonne le reste au lieu de pousser contre le bord.
            val dir = if (px > 0) 1 else -1
            if (px == 0 || !view.canScrollVertically(dir)) {
                remaining = 0f
                running = false
                return
            }
            scrollBy(px)
            remaining -= px
            if (abs(remaining) < 0.5f) {
                remaining = 0f
                running = false
            } else view.postOnAnimation(this)
        }
    }

    /** Un cran (+1 vers le bas, −1 vers le haut). */
    fun nudge(delta: Int) {
        // Changement de sens : on repart de zéro, la vue suit tout de suite le nouveau sens.
        if (remaining != 0f && (remaining > 0) != (delta > 0)) remaining = 0f
        remaining += delta * stepPx
        if (!running) {
            running = true
            view.postOnAnimation(frame)
        }
    }
}
