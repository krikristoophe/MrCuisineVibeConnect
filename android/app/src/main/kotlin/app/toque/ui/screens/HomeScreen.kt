package app.toque.ui.screens

import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import app.toque.TimeSync
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.core.recipes.SearchIndex
import app.toque.ui.Icon
import app.toque.ui.ImageLoader
import app.toque.ui.MainActivity
import app.toque.ui.Screen
import app.toque.ui.Ui
import java.text.SimpleDateFormat
import java.util.Date

/**
 * Accueil à la manière du Thermomix TM7 : sur toute la largeur, une page qui défile. En haut le
 * bonjour, l'heure et la date (qui partent au défilement), à côté la recette en cours ; dessous des
 * rangées de recettes qui défilent de gauche à droite : les favoris, puis les recettes cuisinées
 * récemment. Le reste (programmes, balance, réglages…) est dans le menu latéral.
 */
class HomeScreen(a: MainActivity) : Screen(a) {
    override val title = ""
    private lateinit var clock: TextView
    private lateinit var date: TextView
    private lateinit var greeting: TextView
    private lateinit var resumeBox: FrameLayout
    private lateinit var knobChip: LinearLayout
    private lateinit var favSection: LinearLayout
    private lateinit var favRow: LinearLayout
    private lateinit var favEmpty: TextView
    private lateinit var recentSection: LinearLayout
    private lateinit var recentRow: LinearLayout
    private var favShown = ""
    private var recentShown = ""
    private var resumeShown = ""
    private var unsub: (() -> Unit)? = null
    private val tick = object : Runnable {
        override fun run() {
            refreshClock()
            view.postDelayed(this, 10_000)
        }
    }

    override fun build(): View {
        val page = Ui.vertical(c)
        Ui.screenPadding(page, titled = false)

        // En-tête : bonjour, heure, date à gauche ; la recette en cours à droite.
        val head = Ui.horizontal(c, Gravity.CENTER_VERTICAL)
        val time = Ui.vertical(c)
        greeting = Ui.text(c, "", 22f, Ui.TEXT2, Ui.LIGHT)
        time.addView(greeting)
        clock = Ui.text(c, "", 78f, Ui.TEXT, Ui.THIN)
        time.addView(clock, Ui.lp(Ui.WRAP, Ui.WRAP, t = 0))
        date = Ui.text(c, "", 18f, Ui.TEXT2, Ui.LIGHT)
        time.addView(date)
        head.addView(time, Ui.lp(Ui.WRAP, Ui.WRAP, l = 4))
        resumeBox = FrameLayout(c)
        head.addView(resumeBox, LinearLayout.LayoutParams(0, Ui.WRAP, 1f).apply { leftMargin = Ui.u(28) })
        page.addView(head)

        // Rappel tant que le bouton rotatif n'est ni réglé ni vu en marche.
        knobChip = Ui.chip(c, tr("Bouton rotatif à régler"), Icon.Kind.WARNING, Ui.WARN, 0x33FFC14D, 18f)
        knobChip.isClickable = true
        knobChip.setOnClickListener { a.push(KnobSetupScreen(a)) }
        page.addView(knobChip, Ui.lp(Ui.WRAP, Ui.WRAP, t = 12))

        favSection = section(tr("Favoris"))
        favRow = favSection.getChildAt(1) as LinearLayout
        favEmpty = Ui.text(c, "", 18f, Ui.TEXT2).apply { setLineSpacing(0f, 1.2f) }
        favSection.addView(favEmpty)
        page.addView(favSection, Ui.lp(t = 26))
        recentSection = section(tr("Cuisinées récemment"))
        recentRow = recentSection.getChildAt(1) as LinearLayout
        page.addView(recentSection, Ui.lp(t = 26))
        scroll = Ui.scroll(c, page)
        return scroll
    }

    private lateinit var scroll: android.widget.ScrollView

    private val knob by lazy { app.toque.ui.KnobScroll(scroll, Ui.u(130)) { scroll.scrollBy(0, it) } }

    /** La molette du robot fait défiler l'accueil, en douceur (voir KnobScroll). */
    override fun onKnob(delta: Int): Boolean {
        knob.nudge(delta)
        return true
    }

    /** Une section titrée : ses recettes en grille de 4 colonnes (remplie par [fill]). */
    private fun section(title: String): LinearLayout {
        val s = Ui.vertical(c)
        s.addView(Ui.text(c, title, 20f, Ui.TEXT, Ui.MEDIUM), Ui.lp(b = 12))
        s.addView(Ui.vertical(c), Ui.lp())
        return s
    }

    /** Carte de recette : photo, titre sur deux lignes, note et durée. */
    private fun card(e: SearchIndex.Entry): View {
        val repo = a.app.recipes
        val card = Ui.vertical(c)
        val box = FrameLayout(c)
        box.background = Ui.gradient(Ui.placeholderColors(e.title), 18f)
        val img = ImageView(c).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        box.addView(img, Ui.flp())
        box.clipToOutline = true
        box.outlineProvider = object : android.view.ViewOutlineProvider() {
            override fun getOutline(view: View, outline: android.graphics.Outline) =
                outline.setRoundRect(0, 0, view.width, view.height, Ui.uf(18f))
        }
        ImageLoader.load(img, repo.imageFile(e.image), Ui.u(260))
        card.addView(box, LinearLayout.LayoutParams(Ui.MATCH, Ui.u(150)))
        val t = Ui.ellipsize(Ui.text(c, e.title, 17f, Ui.TEXT, Ui.MEDIUM).apply { setLineSpacing(0f, 1.05f) }, 2)
        t.minLines = 2
        card.addView(t, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).apply { topMargin = Ui.u(10); leftMargin = Ui.u(2); rightMargin = Ui.u(2) })
        val meta = Ui.horizontal(c)
        meta.addView(Ui.text(c, if (e.ratingCount > 0) "★ " + String.format(I18n.locale, "%.1f", e.rating) else "", 14f, Ui.TEXT2),
            LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        if (e.totalMinutes > 0) meta.addView(Ui.text(c, Ui.minutes(e.totalMinutes), 14f, Ui.TEXT2))
        card.addView(meta, LinearLayout.LayoutParams(Ui.MATCH, Ui.WRAP).apply { topMargin = Ui.u(6); leftMargin = Ui.u(2); rightMargin = Ui.u(2) })
        card.background = Ui.pressable(Ui.round(0, 18f), 18f)
        card.isClickable = true
        card.setOnClickListener { repo.get(e.id)?.let { a.push(RecipeScreen(a, it)) } }
        return card
    }

    /** Remplit une grille de 4 colonnes, ligne par ligne. */
    private fun fill(grid: LinearLayout, entries: List<SearchIndex.Entry>) {
        grid.removeAllViews()
        for ((r, chunk) in entries.chunked(4).withIndex()) {
            val row = Ui.horizontal(c, Gravity.TOP)
            for (k in 0 until 4) {
                val lp = LinearLayout.LayoutParams(0, Ui.WRAP, 1f).apply { if (k < 3) rightMargin = Ui.u(16) }
                val e = chunk.getOrNull(k)
                row.addView(if (e != null) card(e) else View(c), lp)
            }
            grid.addView(row, Ui.lp(t = if (r == 0) 0 else 20))
        }
    }

    private fun refreshClock() {
        // Heure et date masquées tant qu'elles ne sont pas réglées (voir TimeSync.showClock) ; la
        // place reste réservée pour que l'accueil ne saute pas quand elles apparaissent.
        val show = TimeSync.showClock(a)
        clock.visibility = if (show) View.VISIBLE else View.INVISIBLE
        date.visibility = if (show) View.VISIBLE else View.INVISIBLE
        clock.text = MainActivity.now()
        date.text = SimpleDateFormat(tr("EEEE d MMMM"), I18n.locale).format(Date()).replaceFirstChar { it.uppercaseChar() }
        val h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        greeting.text = when (h) {
            in 5..11 -> tr("Bonjour")
            in 12..17 -> tr("Bon après-midi")
            else -> tr("Bonsoir")
        }
    }

    private fun refresh() {
        val repo = a.app.recipes
        knobChip.visibility = if (a.prefs.knobReady) View.GONE else View.VISIBLE
        val byId = repo.index.entries.associateBy { it.id }

        val favs = repo.index.entries.filter { it.favorite }
        val favKey = favs.joinToString(",") { it.id } + repo.loaded
        if (favKey != favShown) {
            favShown = favKey
            fill(favRow, favs)
            favEmpty.visibility = if (favs.isEmpty()) View.VISIBLE else View.GONE
            favEmpty.text = if (!repo.loaded) tr("Chargement…")
                else tr("Aucun favori pour l'instant.\nTouchez l'étoile d'une recette pour l'ajouter.")
        }

        val recent = repo.recentIds(12).mapNotNull { byId[it] }.filter { !app.toque.core.machine.Programs.isRinseRecipe(it.title) }
        val recentKey = recent.joinToString(",") { it.id }
        if (recentKey != recentShown) {
            recentShown = recentKey
            fill(recentRow, recent)
        }
        recentSection.visibility = if (recent.isEmpty()) View.GONE else View.VISIBLE

        renderResume()
    }

    /** Recette en cours : photo, titre, progression, Reprendre et une croix pour l'abandonner. */
    private fun renderResume() {
        val repo = a.app.recipes
        val guided = a.prefs.guidedRecipe
        var entry = if (guided.isEmpty()) null else repo.index.entries.firstOrNull { it.id == guided }
        // L'ancienne recette Lidl de rinçage n'est plus proposée en reprise (le rinçage est un mode).
        if (entry != null && app.toque.core.machine.Programs.isRinseRecipe(entry.title)) {
            a.prefs.guidedRecipe = ""
            entry = null
        }
        val key = if (entry == null) "" else "${entry.id}|${a.prefs.guidedStep}"
        if (key == resumeShown) return
        resumeShown = key
        resumeBox.removeAllViews()
        if (entry == null) return
        val total = repo.get(entry.id)?.steps?.size ?: 0
        val step = a.prefs.guidedStep + 1

        val card = Ui.horizontal(c)
        card.background = Ui.round(Ui.SURFACE, 22f)
        card.setPadding(Ui.u(12), Ui.u(12), Ui.u(14), Ui.u(12))
        val box = FrameLayout(c)
        box.background = Ui.gradient(Ui.placeholderColors(entry.title), 16f)
        val img = ImageView(c).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        box.addView(img, Ui.flp())
        box.clipToOutline = true
        box.outlineProvider = object : android.view.ViewOutlineProvider() {
            override fun getOutline(view: View, outline: android.graphics.Outline) =
                outline.setRoundRect(0, 0, view.width, view.height, Ui.uf(16f))
        }
        ImageLoader.load(img, repo.imageFile(entry.image), Ui.u(120))
        card.addView(box, LinearLayout.LayoutParams(Ui.u(92), Ui.u(92)).apply { rightMargin = Ui.u(16) })

        val info = Ui.vertical(c)
        info.addView(Ui.text(c, tr("En cours").uppercase(I18n.locale), 13f, Ui.ACCENT, Ui.MEDIUM).apply { letterSpacing = 0.08f })
        info.addView(Ui.ellipsize(Ui.text(c, entry.title, 19f, Ui.TEXT, Ui.MEDIUM)), Ui.lp(t = 4))
        val prog = Ui.horizontal(c)
        val bar = FrameLayout(c)
        bar.background = Ui.round(Ui.SURFACE2, 3f)
        val fillBar = View(c)
        fillBar.background = Ui.round(Ui.ACCENT, 3f)
        bar.addView(fillBar, FrameLayout.LayoutParams(0, Ui.MATCH))
        bar.post {
            val f = if (total > 0) step.toFloat() / total else 0f
            fillBar.layoutParams = FrameLayout.LayoutParams((bar.width * f.coerceIn(0f, 1f)).toInt(), Ui.MATCH)
        }
        prog.addView(bar, LinearLayout.LayoutParams(0, Ui.u(6), 1f).apply { rightMargin = Ui.u(10) })
        prog.addView(Ui.text(c, if (total > 0) tr("Étape %d sur %d", step, total) else tr("Étape %d", step), 14f, Ui.TEXT2))
        info.addView(prog, Ui.lp(t = 8))
        card.addView(info, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))

        card.addView(Ui.button(c, tr("Reprendre"), Ui.Style.PRIMARY, Icon.Kind.PLAY, height = 52, textSize = 18f) {
            val r = repo.getAdjusted(a.prefs.guidedRecipe)
            if (r != null) a.push(CookScreen(a, r, a.prefs.guidedStep)) else { a.prefs.guidedRecipe = ""; refresh() }
        }, Ui.lp(Ui.WRAP, Ui.WRAP, l = 14))
        val cancel = FrameLayout(c)
        cancel.addView(Icon(c, Icon.Kind.CLOSE, Ui.TEXT2), Ui.flp(Ui.u(22), Ui.u(22), Gravity.CENTER))
        cancel.background = Ui.pressable(Ui.round(0, 24f), 24f)
        cancel.isClickable = true
        cancel.contentDescription = tr("Abandonner la recette")
        cancel.setOnClickListener { abandonGuided() }
        card.addView(cancel, LinearLayout.LayoutParams(Ui.u(48), Ui.u(48)).apply { leftMargin = Ui.u(4) })
        resumeBox.addView(card, Ui.flp(Ui.MATCH, Ui.WRAP))
    }

    override fun onShow() {
        refreshClock()
        refresh()
        unsub = a.app.recipes.onChange { refresh() }
        view.removeCallbacks(tick)
        view.postDelayed(tick, 10_000)
    }

    override fun onHide() {
        unsub?.invoke()
        view.removeCallbacks(tick)
    }

    /** Retire la recette en cours de l'accueil (sans toucher à un programme qui tourne). */
    private fun abandonGuided() {
        if (a.snapshot.busy) {
            a.toast(tr("Arrêtez d'abord le programme en cours"), Ui.WARN)
            return
        }
        a.confirm(tr("Abandonner la recette"), tr("Elle ne sera plus proposée sur l'accueil. Vous pourrez la recommencer depuis les recettes."),
            tr("Abandonner"), icon = Icon.Kind.CLOSE) {
            a.prefs.guidedRecipe = ""
            a.prefs.guidedStep = 0
            refresh()
        }
    }
}
