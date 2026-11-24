package app.toque.ui.screens

import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import app.toque.TimeSync
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.core.recipes.CommunityRecipes
import app.toque.core.recipes.UserRecipes
import app.toque.ui.Icon
import app.toque.ui.MainActivity
import app.toque.ui.Screen
import app.toque.ui.Ui
import java.text.SimpleDateFormat
import java.util.Date

class HomeScreen(a: MainActivity) : Screen(a) {
    // Pas de titre sur l'accueil : la barre du haut ne garde que l'état de la machine et l'heure.
    override val title = ""
    private lateinit var clock: TextView
    private lateinit var date: TextView
    private lateinit var greeting: TextView
    private lateinit var favGrid: LinearLayout
    private var favShown = ""
    private lateinit var resumeCard: LinearLayout
    private lateinit var resumeText: TextView
    private lateinit var knobChip: LinearLayout
    private var unsub: (() -> Unit)? = null
    private val tick = object : Runnable {
        override fun run() {
            refreshClock()
            view.postDelayed(this, 10_000)
        }
    }

    override fun build(): View {
        val root = Ui.horizontal(c, Gravity.TOP)
        root.setPadding(Ui.u(28), Ui.u(10), Ui.u(24), Ui.u(24))

        val left = Ui.vertical(c)
        greeting = Ui.text(c, "", 24f, Ui.TEXT2, Ui.LIGHT)
        left.addView(greeting, Ui.lp(t = 8))
        clock = Ui.text(c, "", 132f, Ui.TEXT, Ui.THIN)
        left.addView(clock, Ui.lp(t = 2))
        date = Ui.text(c, "", 22f, Ui.TEXT2, Ui.LIGHT)
        left.addView(date, Ui.lp(t = 2))

        // Rappel tant que le bouton rotatif n'est ni réglé ni vu en marche.
        knobChip = Ui.chip(c, tr("Bouton rotatif à régler"), Icon.Kind.WARNING, Ui.WARN, 0x33FFC14D, 18f)
        knobChip.isClickable = true
        knobChip.setOnClickListener { a.push(KnobSetupScreen(a)) }
        left.addView(knobChip, Ui.lp(Ui.WRAP, Ui.WRAP, t = 12))

        resumeCard = Ui.horizontal(c)
        resumeCard.setPadding(Ui.u(22), Ui.u(16), Ui.u(18), Ui.u(16))
        resumeCard.background = Ui.pressable(Ui.round(Ui.ACCENT_DIM, 24f), 24f)
        resumeCard.addView(Icon(c, Icon.Kind.PLAY, Ui.ACCENT), LinearLayout.LayoutParams(Ui.u(26), Ui.u(26)).apply { rightMargin = Ui.u(14) })
        resumeText = Ui.ellipsize(Ui.text(c, "", 19f, Ui.TEXT, Ui.MEDIUM), 2)
        resumeCard.addView(resumeText, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        // Zone de toucher plus grande que l'icône (au doigt, sur la carte).
        val cancel = android.widget.FrameLayout(c)
        cancel.addView(Icon(c, Icon.Kind.CLOSE, Ui.TEXT2), Ui.flp(Ui.u(24), Ui.u(24), Gravity.CENTER))
        cancel.background = Ui.pressable(Ui.round(0, 28f), 28f)
        cancel.isClickable = true
        cancel.contentDescription = tr("Abandonner la recette")
        cancel.setOnClickListener { abandonGuided() }
        resumeCard.addView(cancel, LinearLayout.LayoutParams(Ui.u(56), Ui.u(56)).apply { leftMargin = Ui.u(8) })
        resumeCard.isClickable = true
        resumeCard.setOnClickListener {
            val r = a.app.recipes.getAdjusted(a.prefs.guidedRecipe)
            if (r != null) a.push(CookScreen(a, r, a.prefs.guidedStep)) else { a.prefs.guidedRecipe = ""; refresh() }
        }
        left.addView(resumeCard, Ui.lp(Ui.MATCH, Ui.WRAP, t = 16))
        root.addView(left, LinearLayout.LayoutParams(0, Ui.MATCH, 0.42f).apply { rightMargin = Ui.u(28) })

        // Accueil simplifié : à droite les recettes favorites (le reste est dans le menu latéral).
        val right = Ui.vertical(c)
        right.addView(Ui.text(c, tr("Favoris").uppercase(I18n.locale), 15f, Ui.TEXT2, Ui.MEDIUM).apply { letterSpacing = 0.08f }, Ui.lp(t = 12, b = 10))
        favGrid = Ui.vertical(c)
        right.addView(favGrid, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        root.addView(right, LinearLayout.LayoutParams(0, Ui.MATCH, 0.58f))
        return root
    }

    private fun tileLp(gap: Boolean) = LinearLayout.LayoutParams(0, Ui.MATCH, 1f).apply { if (gap) rightMargin = Ui.u(16) }

    private fun tile(icon: Icon.Kind, title: String, sub: String = "", hasSub: Boolean = true, onClick: () -> Unit): Pair<LinearLayout, TextView> {
        // Tuile centrée : grande pastille d'icône, titre et sous-titre dessous. La pastille est à la
        // même hauteur dans toutes les tuiles, quel que soit le texte (une ou deux lignes, avec ou
        // sans sous-titre) : espace fixe au-dessus, texte accroché sous la pastille.
        val t = Ui.vertical(c, Gravity.CENTER_HORIZONTAL)
        t.setPadding(Ui.u(8), Ui.u(14), Ui.u(8), Ui.u(14))
        t.background = Ui.pressable(Ui.round(Ui.SURFACE, 26f, Ui.STROKE, 1f), 26f)
        t.addView(View(c), LinearLayout.LayoutParams(1, 0, 2f))
        val badge = android.widget.FrameLayout(c)
        badge.background = Ui.round(Ui.ACCENT_DIM, 44f)
        badge.addView(Icon(c, icon, Ui.ACCENT), Ui.flp(Ui.u(46), Ui.u(46), Gravity.CENTER))
        t.addView(badge, LinearLayout.LayoutParams(Ui.u(84), Ui.u(84)))
        val text = Ui.vertical(c, Gravity.CENTER_HORIZONTAL or Gravity.TOP)
        text.addView(Ui.text(c, title, 20f, Ui.TEXT, Ui.MEDIUM).apply { gravity = Gravity.CENTER }, Ui.lp(Ui.WRAP, Ui.WRAP, t = 12))
        val s = Ui.ellipsize(Ui.text(c, sub, 15f, Ui.TEXT2).apply { gravity = Gravity.CENTER }, 2)
        if (hasSub) text.addView(s, Ui.lp(Ui.WRAP, Ui.WRAP, t = 4))
        t.addView(text, LinearLayout.LayoutParams(Ui.MATCH, 0, 3f))
        t.isClickable = true
        t.setOnClickListener { onClick() }
        return t to s
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
        renderFavorites()
        knobChip.visibility = if (a.prefs.knobReady) View.GONE else View.VISIBLE
        val guided = a.prefs.guidedRecipe
        var title = if (guided.isEmpty()) null else repo.index.entries.firstOrNull { it.id == guided }?.title
        // L'ancienne recette Lidl de rinçage n'est plus proposée en reprise (le rinçage est un mode).
        if (title != null && app.toque.core.machine.Programs.isRinseRecipe(title)) {
            a.prefs.guidedRecipe = ""
            title = null
        }
        resumeCard.visibility = if (title != null) View.VISIBLE else View.GONE
        if (title != null) resumeText.text = tr("Reprendre « %s » — étape %d", title, a.prefs.guidedStep + 1)
    }

    /** Jusqu'à 4 favoris en cartes (photo et titre) ; au-delà, « Tous les favoris ». */
    private fun renderFavorites() {
        val repo = a.app.recipes
        val favs = repo.index.entries.filter { it.favorite }
        val key = favs.joinToString(",") { it.id } + repo.loaded
        if (key == favShown) return
        favShown = key
        favGrid.removeAllViews()
        if (favs.isEmpty()) {
            favGrid.addView(Ui.text(c, if (!repo.loaded) tr("Chargement…")
                else tr("Aucun favori pour l'instant.\nTouchez l'étoile d'une recette pour l'ajouter."), 18f, Ui.TEXT2)
                .apply { setLineSpacing(0f, 1.2f) }, Ui.lp(t = 8))
            return
        }
        val shown = favs.take(4)
        for (r in 0 until 2) {
            val row = Ui.horizontal(c)
            for (k in 0 until 2) {
                val e = shown.getOrNull(r * 2 + k)
                val lp = LinearLayout.LayoutParams(0, Ui.MATCH, 1f).apply { if (k == 0) rightMargin = Ui.u(16) }
                if (e == null) { row.addView(View(c), lp); continue }
                val card = Ui.vertical(c)
                card.background = Ui.pressable(Ui.round(Ui.SURFACE, 22f), 22f)
                card.clipToOutline = true
                card.outlineProvider = object : android.view.ViewOutlineProvider() {
                    override fun getOutline(view: View, outline: android.graphics.Outline) =
                        outline.setRoundRect(0, 0, view.width, view.height, Ui.uf(22f))
                }
                val box = android.widget.FrameLayout(c)
                box.background = Ui.gradient(Ui.placeholderColors(e.title), 0f)
                val img = android.widget.ImageView(c).apply { scaleType = android.widget.ImageView.ScaleType.CENTER_CROP }
                box.addView(img, Ui.flp())
                app.toque.ui.ImageLoader.load(img, repo.imageFile(e.image), Ui.u(300))
                card.addView(box, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
                val t = Ui.ellipsize(Ui.text(c, e.title, 17f, Ui.TEXT, Ui.MEDIUM), 1)
                t.setPadding(Ui.u(14), Ui.u(10), Ui.u(14), Ui.u(12))
                card.addView(t, Ui.lp())
                card.isClickable = true
                card.setOnClickListener { repo.get(e.id)?.let { a.push(RecipeScreen(a, it)) } }
                row.addView(card, lp)
            }
            favGrid.addView(row, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f).apply { if (r == 0) bottomMargin = Ui.u(16) })
        }
        if (favs.size > 4) favGrid.addView(Ui.button(c, tr("Tous les favoris (%d)", favs.size), Ui.Style.GHOST, Icon.Kind.STAR, height = 48, textSize = 16f) {
            a.push(RecipesScreen(a, favorites = true))
        }, Ui.lp(Ui.WRAP, Ui.WRAP, t = 10))
    }

    override fun onShow() {
        refreshClock()
        refresh()
        unsub = a.app.recipes.onChange { refresh() }
        a.updates.onChange = { refresh() }
        view.removeCallbacks(tick)
        view.postDelayed(tick, 10_000)
    }

    override fun onHide() {
        unsub?.invoke()
        a.updates.onChange = null
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
