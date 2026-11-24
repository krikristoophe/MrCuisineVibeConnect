package app.toque.ui.screens

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import app.toque.claudimix.ClaudimixApi
import app.toque.core.claudimix.QrMatrix
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.ui.Icon
import app.toque.ui.MainActivity
import app.toque.ui.Ui
import java.text.SimpleDateFormat
import java.util.Date

/**
 * Réglages › Claudimix. Non relié : un code d'appairage (QR code et code en clair), interrogé
 * toutes les 3 s et renouvelé à son expiration. Relié : le foyer, l'état de la connexion, la synchro
 * des recettes et « Dissocier ». Ne parle au service que pendant qu'il est affiché ([setActive]).
 */
class ClaudimixPanel(private val a: MainActivity) {
    private val c: Context get() = a
    private val cx get() = a.app.claudimix
    private val main = Handler(Looper.getMainLooper())
    val view: LinearLayout = Ui.vertical(a)
    private var active = false
    private var pairing: ClaudimixApi.Pairing? = null
    private var pairingUntil = 0L
    /** Numéro de la demande en cours : une réponse arrivée après un changement d'état est ignorée. */
    private var generation = 0
    private var unsub: (() -> Unit)? = null

    private lateinit var qr: QrView
    private lateinit var code: TextView
    private lateinit var pairState: TextView
    private lateinit var retry: View
    private var linkedShown: Boolean? = null
    private var status: TextView? = null
    private var syncText: TextView? = null
    private var syncBtn: View? = null

    private val pollTick = Runnable { poll() }
    private val refreshTick = object : Runnable {
        override fun run() {
            refreshLinked()
            main.postDelayed(this, 5_000)
        }
    }

    /** Page visible (rubrique ouverte, Réglages affichés) : appairage et rafraîchissements tournent. */
    fun setActive(on: Boolean) {
        if (on == active) return
        active = on
        generation++
        main.removeCallbacks(pollTick)
        main.removeCallbacks(refreshTick)
        unsub?.invoke()
        unsub = null
        if (!on) return
        unsub = cx.onChange { if (active) render() }
        render()
    }

    private fun render() {
        val linked = cx.linked
        if (linkedShown != linked) {
            linkedShown = linked
            view.removeAllViews()
            main.removeCallbacks(pollTick)
            main.removeCallbacks(refreshTick)
            generation++
            if (linked) buildLinked() else buildPairing()
        }
        if (linked) refreshLinked() else if (pairing == null || System.currentTimeMillis() > pairingUntil) newCode()
    }

    // ------------------------------------------------------------------ non relié

    private fun buildPairing() {
        pairing = null
        view.addView(head(tr("Relier ce robot à Claudimix")))
        view.addView(Ui.text(c, tr("Claudimix rassemble les recettes, le menu de la semaine et la cuisson en direct de votre foyer. Le robot y prend ses recettes."),
            16f, Ui.TEXT2).apply { setLineSpacing(0f, 1.15f) }, Ui.lp(b = 16))
        val row = Ui.horizontal(c, Gravity.TOP)
        qr = QrView(c)
        // 41 modules de 8 px (marge comprise) : assez grand pour l'appareil photo d'un téléphone.
        row.addView(qr, LinearLayout.LayoutParams(Ui.u(328), Ui.u(328)).apply { rightMargin = Ui.u(22) })
        val side = Ui.vertical(c)
        side.addView(Ui.text(c, tr("Scannez ce code avec votre téléphone, ou tapez ce code dans l'appli Claudimix (Robot › Ajouter) :"),
            16f, Ui.TEXT2).apply { setLineSpacing(0f, 1.15f) })
        code = Ui.text(c, "", 34f, Ui.TEXT, Ui.MEDIUM).apply { letterSpacing = 0.12f }
        side.addView(code, Ui.lp(t = 14))
        pairState = Ui.text(c, "", 16f, Ui.TEXT2).apply { setLineSpacing(0f, 1.15f) }
        side.addView(pairState, Ui.lp(t = 14))
        retry = Ui.button(c, tr("Réessayer"), Ui.Style.SECONDARY, Icon.Kind.SYNC, height = 52) { newCode() }
        retry.visibility = View.GONE
        side.addView(retry, Ui.lp(Ui.WRAP, Ui.WRAP, t = 12))
        row.addView(side, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        view.addView(row)
    }

    private fun newCode() {
        val g = ++generation
        main.removeCallbacks(pollTick)
        pairing = null
        qr.matrix = null
        code.text = "…"
        pairState.setTextColor(Ui.TEXT2)
        pairState.text = tr("Demande d'un code…")
        retry.visibility = View.GONE
        cx.pairStart { r ->
            if (g != generation || !active) return@pairStart
            val p = r.getOrNull()
            val m = p?.let { QrMatrix.parse(it.qr) }
            if (p == null || m == null) {
                pairState.setTextColor(Ui.WARN)
                pairState.text = tr("Claudimix injoignable : vérifiez le Wi-Fi.")
                code.text = ""
                retry.visibility = View.VISIBLE
                return@pairStart
            }
            pairing = p
            pairingUntil = System.currentTimeMillis() + p.expiresInSec * 1000L - 5_000L
            qr.matrix = m
            code.text = p.code.chunked(4).joinToString(" ")
            pairState.text = tr("En attente de la confirmation dans l'appli…")
            main.postDelayed(pollTick, POLL_MS)
        }
    }

    private fun poll() {
        val p = pairing ?: return
        if (!active) return
        if (System.currentTimeMillis() > pairingUntil) { newCode(); return }
        val g = generation
        cx.pairPoll(p.pollToken) { r ->
            if (g != generation || !active) return@pairPoll
            when (val v = r.getOrNull()) {
                is ClaudimixApi.Poll.Paired -> a.toast(tr("Robot relié au foyer « %s »", v.household), Ui.OK)  // render() suit (onChange)
                ClaudimixApi.Poll.Expired -> newCode()
                // En attente, ou réseau coupé un instant : on redemande dans 3 s.
                else -> main.postDelayed(pollTick, POLL_MS)
            }
        }
    }

    // ------------------------------------------------------------------ relié

    private fun buildLinked() {
        view.addView(head(tr("Claudimix")))
        view.addView(Ui.text(c, tr("Foyer : %s", cx.household.ifBlank { "?" }), 20f, Ui.TEXT, Ui.MEDIUM))
        status = Ui.text(c, "", 16f, Ui.TEXT2).apply { setLineSpacing(0f, 1.15f) }
        view.addView(status, Ui.lp(t = 8))
        view.addView(Ui.text(c, tr("Le robot envoie son état en direct au foyer, reçoit ses recettes de Claudimix (au démarrage puis toutes les heures) et affiche les repas du jour sur l'accueil."),
            15f, Ui.TEXT3).apply { setLineSpacing(0f, 1.1f) }, Ui.lp(t = 12))
        syncText = Ui.text(c, "", 16f, Ui.TEXT).apply { setLineSpacing(0f, 1.15f) }
        view.addView(syncText, Ui.lp(t = 16))
        val buttons = Ui.horizontal(c)
        syncBtn = Ui.button(c, tr("Synchroniser"), Ui.Style.PRIMARY, Icon.Kind.SYNC, height = 56) { cx.syncRecipes(); refreshLinked() }
        buttons.addView(syncBtn, Ui.lp(Ui.WRAP, Ui.WRAP, r = 12))
        buttons.addView(Ui.button(c, tr("Dissocier"), Ui.Style.GHOST, Icon.Kind.CLOSE, height = 56) {
            a.confirm(tr("Dissocier le robot"), tr("Le robot oublie le foyer « %s » : plus d'état en direct, de recettes reçues ni de repas du jour. Les recettes déjà sur le robot restent.", cx.household),
                tr("Dissocier"), danger = true, icon = Icon.Kind.CLOSE) { cx.unlink() }
        })
        view.addView(buttons, Ui.lp(t = 12))
        main.postDelayed(refreshTick, 5_000)
    }

    private fun refreshLinked() {
        val st = status ?: return
        val last = cx.lastContactMs
        val err = cx.lastError
        val ago = (System.currentTimeMillis() - last) / 1000
        when {
            err != null -> { st.setTextColor(Ui.WARN); st.text = tr("Hors ligne : %s", err) }
            last == 0L -> { st.setTextColor(Ui.TEXT2); st.text = tr("Connexion…") }
            ago < 90 -> { st.setTextColor(Ui.OK); st.text = tr("Connecté · dernier échange il y a %d s", ago.toInt()) }
            else -> { st.setTextColor(Ui.TEXT2); st.text = tr("Dernier échange il y a %d min", (ago / 60).toInt()) }
        }
        val repo = a.app.recipes
        val line = when {
            cx.syncing -> tr("Synchronisation des recettes…")
            cx.lastSyncMessage.isNotEmpty() -> cx.lastSyncMessage
            a.prefs.claudimixSyncMs > 0 -> tr("Dernière synchro le %s", SimpleDateFormat(tr("dd/MM à HH:mm"), I18n.locale).format(Date(a.prefs.claudimixSyncMs)))
            else -> tr("Jamais synchronisé")
        }
        syncText?.text = line + "\n" + if (repo.loaded) tr("%d recettes dans Toque", repo.count) else tr("Chargement des recettes…")
        syncBtn?.let { Ui.setButtonEnabled(it, !cx.syncing) }
    }

    private fun head(title: String): View {
        val h = Ui.horizontal(c)
        h.addView(Icon(c, Icon.Kind.LINK, Ui.ACCENT), LinearLayout.LayoutParams(Ui.u(24), Ui.u(24)).apply { rightMargin = Ui.u(10) })
        h.addView(Ui.text(c, title, 21f, Ui.TEXT, Ui.MEDIUM))
        h.layoutParams = Ui.lp(b = 10)
        return h
    }

    private companion object {
        const val POLL_MS = 3_000L
    }
}

/** QR code dessiné module par module : noir sur blanc, carré, la marge est dans la matrice. */
class QrView(c: Context) : View(c) {
    private val black = Paint().apply { color = Color.BLACK; isAntiAlias = false }
    var matrix: Array<BooleanArray>? = null
        set(v) {
            field = v
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        val m = matrix
        canvas.drawColor(Color.WHITE)
        if (m == null) return
        val n = m.size
        // Modules de taille entière (pas de flou), centrés.
        val cell = minOf(width, height) / n
        if (cell <= 0) return
        val ox = (width - cell * n) / 2f
        val oy = (height - cell * n) / 2f
        for (y in 0 until n) for (x in 0 until n) if (m[y][x]) {
            canvas.drawRect(ox + x * cell, oy + y * cell, ox + (x + 1) * cell, oy + (y + 1) * cell, black)
        }
    }
}
