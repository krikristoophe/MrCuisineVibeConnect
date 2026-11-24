package app.toque.ui

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import app.toque.TimeSync
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.core.machine.Snapshot
import java.text.SimpleDateFormat
import java.util.Date

/**
 * Mise en veille, comme l'appli d'origine : après quelques minutes sans geste et sans programme
 * en cours, l'écran passe au noir avec l'heure, rétroéclairage au minimum. Le premier geste
 * (écran ou bouton rotatif) réveille sans rien déclencher ; le couvercle, la balance et les
 * évènements de la base réveillent aussi.
 */
class Standby(private val a: MainActivity, private val root: FrameLayout) {
    private val main = Handler(Looper.getMainLooper())
    private var lastInputMs = SystemClock.uptimeMillis()
    private var lastWeight = Int.MIN_VALUE
    private var lastLid: Boolean? = null
    private var view: FrameLayout? = null
    private var box: LinearLayout? = null
    private var clock: TextView? = null
    private var date: TextView? = null
    private var hot: TextView? = null
    private var running = false
    private var wokeMs = 0L

    val asleep: Boolean get() = view != null

    /** Sortie de veille (pas à l'arrêt de l'écran) : l'alerte de mise à jour regarde à ce moment-là. */
    var onWake: (() -> Unit)? = null

    private val check = object : Runnable {
        override fun run() {
            if (shouldSleep()) sleep()
            main.postDelayed(this, 10_000)
        }
    }

    private val tick = object : Runnable {
        override fun run() {
            refresh()
            main.postDelayed(this, 60_000)
        }
    }

    fun start() {
        if (running) return
        running = true
        lastInputMs = SystemClock.uptimeMillis()
        main.postDelayed(check, 10_000)
    }

    fun stop() {
        running = false
        main.removeCallbacks(check)
        wake()
    }

    /** Un geste de la personne : repousse la veille. Vrai si ce geste a servi à réveiller (ne pas le transmettre). */
    fun onInput(): Boolean {
        lastInputMs = SystemClock.uptimeMillis()
        if (!asleep) return false
        wake()
        wokeMs = SystemClock.uptimeMillis()
        return true
    }

    /** Bouton rotatif : un tour envoie plusieurs crans, on ignore aussi ceux qui suivent le réveil. */
    fun onKnob(): Boolean {
        if (onInput()) return true
        return SystemClock.uptimeMillis() - wokeMs < 800
    }

    /** Quelque chose se passe sur le robot : on réveille et on repousse la veille. */
    fun poke() {
        lastInputMs = SystemClock.uptimeMillis()
        wake()
    }

    fun onSnapshot(s: Snapshot) {
        val weightMoved = lastWeight != Int.MIN_VALUE && Math.abs(s.weightG - lastWeight) >= 20
        val lidMoved = lastLid != null && lastLid != s.lidOpen
        lastWeight = s.weightG
        lastLid = s.lidOpen
        if (s.busy || weightMoved || lidMoved) poke()
        else if (asleep) refresh()
    }

    private fun shouldSleep(): Boolean {
        val minutes = a.prefs.standbyMinutes
        if (minutes <= 0 || asleep || !running) return false
        if (a.snapshot.busy || a.current?.keepAwake == true) return false
        return SystemClock.uptimeMillis() - lastInputMs >= minutes * 60_000L
    }

    private fun sleep() {
        a.hideKeyboard()
        val v = FrameLayout(a)
        v.setBackgroundColor(0xFF000000.toInt())
        v.isClickable = true
        // Luminosité normale de l'écran en veille (avant : 2 %, l'heure ne se voyait plus) : heure
        // claire sur fond noir, à la même place et à la même taille que sur l'accueil (barre du
        // haut de 70, marges de l'accueil, ligne « Bonjour » gardée vide pour l'alignement).
        val b = Ui.vertical(a, Gravity.START)
        b.setPadding(Ui.u(28), Ui.u(70 + 10), 0, 0)
        b.addView(Ui.text(a, " ", 24f, 0, Ui.LIGHT), Ui.lp(Ui.WRAP, Ui.WRAP, t = 8))
        val t = Ui.text(a, "", 132f, 0xFFE6E9EE.toInt(), Ui.THIN)
        b.addView(t, Ui.lp(Ui.WRAP, Ui.WRAP, t = 2))
        // La date sous l'heure, comme sur l'accueil.
        val d = Ui.text(a, "", 22f, 0xFFB4BCC8.toInt(), Ui.LIGHT)
        b.addView(d, Ui.lp(Ui.WRAP, Ui.WRAP, t = 2))
        val h = Ui.text(a, "", 22f, Ui.WARN, Ui.MEDIUM)
        b.addView(h, Ui.lp(Ui.WRAP, Ui.WRAP, t = 6))
        b.addView(Ui.text(a, tr("Touchez l'écran pour reprendre"), 17f, 0xFF8B95A8.toInt()), Ui.lp(Ui.WRAP, Ui.WRAP, t = 18))
        v.addView(b, Ui.flp(Ui.WRAP, Ui.WRAP, Gravity.TOP or Gravity.START))
        root.addView(v, Ui.flp())
        view = v
        box = b
        clock = t
        date = d
        hot = h
        refresh()
        v.alpha = 0f
        v.animate().alpha(1f).setDuration(800).start()
        when (a.prefs.standbyKnob) {
            "dim" -> KnobLight.start(KnobLight.NIGHT_LEVEL)
            "off" -> KnobLight.start(0)
        }
        main.postDelayed(tick, 60_000)
    }

    private fun wake() {
        val v = view ?: return
        main.removeCallbacks(tick)
        v.animate().cancel()
        root.removeView(v)
        view = null
        box = null
        clock = null
        date = null
        hot = null
        brightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE)
        KnobLight.stop()
        if (running) onWake?.invoke()
    }

    private fun refresh() {
        val show = TimeSync.showClock(a)
        clock?.text = if (show) MainActivity.now() else ""
        date?.text = if (show) SimpleDateFormat(tr("EEEE d MMMM"), I18n.locale).format(Date()).replaceFirstChar { it.uppercaseChar() } else ""
        val temp = a.snapshot.actualTempC
        hot?.let {
            it.text = if (temp >= 50) tr("Bol chaud : %d °C", temp) else ""
            it.visibility = if (temp >= 50) View.VISIBLE else View.GONE
        }
    }

    private fun brightness(value: Float) {
        val lp = a.window.attributes
        lp.screenBrightness = value
        a.window.attributes = lp
    }
}
