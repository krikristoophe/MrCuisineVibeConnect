package app.toque.ui

import android.graphics.drawable.InsetDrawable
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import app.toque.core.i18n.tr
import app.toque.core.machine.Snapshot
import app.toque.core.recipes.Rinse
import app.toque.ui.screens.CookScreen
import app.toque.ui.screens.ManualScreen
import app.toque.ui.screens.ProgramsScreen
import app.toque.ui.screens.RecipeScreen
import app.toque.ui.screens.RecipesScreen
import app.toque.ui.screens.ScaleScreen
import app.toque.ui.screens.SettingsScreen

/**
 * Menu latéral (essai, à la manière du Thermomix TM7) : un rail fin d'icônes à la place de la barre
 * du haut, pour garder toute la hauteur de l'écran. Retour en haut, les rubriques principales au
 * milieu, et en bas une grille qui ouvre les autres (programmes, balance, rinçage, réglages).
 * Seule alerte affichée : le couvercle ouvert, et le bol chaud.
 */
class SideRail(private val a: MainActivity) : LinearLayout(a) {
    private enum class Section { HOME, SEARCH, RECIPES, MANUAL, MORE, NONE }

    private val back = Icon(a, Icon.Kind.BACK, Ui.TEXT)
    private val items = LinkedHashMap<Section, Icon>()
    private val lid = Icon(a, Icon.Kind.LID, Ui.WARN)
    private val hot = Ui.text(a, "", 15f, Ui.DANGER, Ui.MEDIUM)

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        // Marge à gauche : le cadre du robot cache le bord de l'écran.
        setPadding(Ui.u(14), Ui.u(14), 0, Ui.u(14))
        back.background = InsetDrawable(Ui.pressable(Ui.round(Ui.SURFACE2, 24f, Ui.STROKE, 1f), 24f), Ui.u(4))
        back.setPadding(Ui.u(14), Ui.u(14), Ui.u(14), Ui.u(14))
        back.setOnClickListener { a.back() }
        back.contentDescription = tr("Retour")
        addView(back, LayoutParams(Ui.u(56), Ui.u(56)))
        addView(View(a), LayoutParams(1, 0, 1f))
        item(Section.HOME, Icon.Kind.HOME, tr("Accueil")) { a.home() }
        item(Section.SEARCH, Icon.Kind.SEARCH, tr("Rechercher une recette…")) { open(RecipesScreen(a, focusSearch = true)) }
        item(Section.RECIPES, Icon.Kind.BOOK, tr("Recettes")) { open(RecipesScreen(a)) }
        item(Section.MANUAL, Icon.Kind.POT, tr("Cuisson manuelle")) { open(ManualScreen(a)) }
        item(Section.MORE, Icon.Kind.GRID, tr("Plus")) { more() }
        addView(View(a), LayoutParams(1, 0, 1f))
        addView(hot, Ui.lp(Ui.WRAP, Ui.WRAP, b = 6))
        addView(lid, LayoutParams(Ui.u(30), Ui.u(30)))
        lid.visibility = View.GONE
        hot.visibility = View.GONE
    }

    /** Une rubrique : repart de l'accueil puis ouvre l'écran (pas d'empilement sans fin). */
    private fun open(s: Screen) {
        a.closeOverlay()
        a.home()
        a.push(s)
    }

    private fun item(s: Section, kind: Icon.Kind, label: String, onClick: () -> Unit) {
        val icon = Icon(a, kind, Ui.TEXT2)
        icon.setPadding(Ui.u(16), Ui.u(16), Ui.u(16), Ui.u(16))
        icon.contentDescription = label
        icon.isClickable = true
        icon.setOnClickListener { onClick() }
        addView(icon, LayoutParams(Ui.u(58), Ui.u(58)).apply { topMargin = Ui.u(6); bottomMargin = Ui.u(6) })
        items[s] = icon
    }

    /** Les autres rubriques, dans une petite grille. */
    private fun more() {
        val card = Ui.card(a, 28f, Ui.SURFACE2)
        card.setPadding(Ui.u(24), Ui.u(22), Ui.u(24), Ui.u(22))
        val row = Ui.horizontal(a)
        fun tile(kind: Icon.Kind, label: String, s: () -> Screen) {
            val t = Ui.vertical(a, Gravity.CENTER)
            t.background = Ui.pressable(Ui.round(Ui.SURFACE, 22f), 22f)
            t.setPadding(0, Ui.u(18), 0, Ui.u(16))
            val badge = android.widget.FrameLayout(a)
            badge.background = Ui.round(Ui.ACCENT_DIM, 30f)
            badge.addView(Icon(a, kind, Ui.ACCENT), Ui.flp(Ui.u(30), Ui.u(30), Gravity.CENTER))
            t.addView(badge, LayoutParams(Ui.u(60), Ui.u(60)))
            t.addView(Ui.text(a, label, 17f, Ui.TEXT, Ui.MEDIUM), Ui.lp(Ui.WRAP, Ui.WRAP, t = 10))
            t.isClickable = true
            t.setOnClickListener { open(s()) }
            row.addView(t, LayoutParams(0, Ui.WRAP, 1f).apply { if (row.childCount < 3) rightMargin = Ui.u(12) })
        }
        tile(Icon.Kind.KNEAD, tr("Programmes")) { ProgramsScreen(a) }
        tile(Icon.Kind.SCALE, tr("Balance")) { ScaleScreen(a) }
        tile(Icon.Kind.DROP, tr("Rinçage")) { CookScreen(a, Rinse.recipe(), 0) }
        tile(Icon.Kind.SETTINGS, tr("Réglages")) { SettingsScreen(a) }
        card.addView(row, Ui.lp())
        a.showOverlay(card, 720)
    }

    fun startClock() {}

    fun stopClock() {}

    /** Pile d'écrans en cours : Retour visible dès qu'on n'est plus à l'accueil, rubrique surlignée. */
    fun setStack(stack: List<Screen>) {
        back.visibility = if (stack.size > 1) View.VISIBLE else View.INVISIBLE
        val section = when (val root = stack.getOrNull(1)) {
            null -> Section.HOME
            is RecipesScreen, is RecipeScreen -> Section.RECIPES
            is ManualScreen -> Section.MANUAL
            is CookScreen -> if (root.title == Rinse.recipe().title) Section.MORE else Section.RECIPES
            is ProgramsScreen, is ScaleScreen, is SettingsScreen -> Section.MORE
            else -> Section.NONE
        }
        for ((s, icon) in items) {
            val on = s == section
            icon.background = if (on) Ui.round(Ui.ACCENT_DIM, 29f) else Ui.pressable(Ui.round(0, 29f), 29f)
            icon.color = if (on) Ui.ACCENT else Ui.TEXT2
        }
    }

    fun update(s: Snapshot) {
        lid.visibility = if (s.hasSample && s.lidOpen) View.VISIBLE else View.GONE
        val isHot = s.hasSample && s.actualTempC >= 50
        hot.visibility = if (isHot) View.VISIBLE else View.GONE
        if (isHot) hot.text = "${s.actualTempC}°"
    }
}
