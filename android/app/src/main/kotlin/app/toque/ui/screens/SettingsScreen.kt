package app.toque.ui.screens

import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.ScrollView
import android.widget.TextView
import app.toque.TimeSync
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.core.i18n.trKey
import app.toque.core.time.ZoneLookup
import app.toque.recipes.RecipeFiles
import app.toque.core.recipes.UserRecipes
import app.toque.ui.Icon
import app.toque.ui.MainActivity
import app.toque.ui.Screen
import app.toque.ui.Ui

class SettingsScreen(a: MainActivity) : Screen(a) {
    private companion object {
        /** Rubrique ouverte : gardée quand les réglages sont reconstruits (changement de langue). */
        var lastTab = Tab.CLAUDIMIX
    }

    override val title = tr("Réglages")
    private lateinit var timeText: TextView
    private val claudimix = ClaudimixPanel(a)
    private var shown = false
    private var settingTime = false

    /** Rubriques du menu latéral : une seule est affichée à droite, sans défilement de toute la page. */
    private enum class Tab(val fr: String, val icon: Icon.Kind) {
        CLAUDIMIX(trKey("Claudimix"), Icon.Kind.LINK),
        RECIPES(trKey("Recettes"), Icon.Kind.BOOK),
        DISPLAY(trKey("Écran et langue"), Icon.Kind.GLOBE),
        TIME(trKey("Date et heure"), Icon.Kind.CLOCK),
        TOOLS(trKey("Outils"), Icon.Kind.SETTINGS),
    }

    private val pages = HashMap<Tab, LinearLayout>()
    private val navRows = HashMap<Tab, LinearLayout>()
    private lateinit var pageScroll: ScrollView

    override fun build(): View {
        // Menu à gauche, posé sur le fond (comme la page Recettes) ; contenu à droite dans une carte.
        val root = Ui.horizontal(c, Gravity.TOP)
        Ui.screenPadding(root, titled = true)
        val nav = Ui.vertical(c)
        root.addView(nav, LinearLayout.LayoutParams(Ui.u(250), Ui.MATCH).apply { rightMargin = Ui.u(18) })
        val card = Ui.card(c, 24f)
        card.setPadding(Ui.u(28), Ui.u(22), Ui.u(28), Ui.u(10))
        val pane = Ui.vertical(c)
        pageScroll = Ui.scroll(c, pane)
        card.addView(pageScroll, Ui.lp(Ui.MATCH, Ui.MATCH))
        root.addView(card, LinearLayout.LayoutParams(0, Ui.MATCH, 1f))
        for (t in Tab.values()) {
            val page = Ui.vertical(c)
            page.setPadding(0, 0, 0, Ui.u(18))
            pane.addView(page, Ui.lp())
            pages[t] = page
            val row = Ui.horizontal(c)
            row.setPadding(Ui.u(18), 0, Ui.u(18), 0)
            row.addView(Icon(c, t.icon, Ui.ACCENT), LinearLayout.LayoutParams(Ui.u(26), Ui.u(26)).apply { rightMargin = Ui.u(14) })
            row.addView(Ui.text(c, tr(t.fr), 19f, Ui.TEXT, Ui.MEDIUM))
            row.isClickable = true
            row.setOnClickListener { show(t) }
            nav.addView(row, Ui.lp(Ui.MATCH, Ui.u(64), b = 6))
            navRows[t] = row
        }
        pages.getValue(Tab.CLAUDIMIX).addView(claudimix.view, Ui.lp())
        val recipesPage = pages.getValue(Tab.RECIPES)
        val displayPage = pages.getValue(Tab.DISPLAY)
        val timePage = pages.getValue(Tab.TIME)
        val toolsPage = pages.getValue(Tab.TOOLS)

        // ---- Langue (titre bilingue : trouvable quelle que soit la langue affichée)
        val language = section(displayPage, "Langue · Language", Icon.Kind.GLOBE)
        val options = listOf(I18n.AUTO to tr("Automatique (langue du système)")) + I18n.languages.map { it.code to it.name }
        language.addView(dropdown(options, a.prefs.language) { code ->
            a.prefs.language = code
            a.applyLanguage()
        }, Ui.lp(Ui.MATCH, Ui.u(58), t = 4))

        // ---- Écran
        val screen = section(displayPage, tr("Écran"), Icon.Kind.CLOCK, divider = true)
        val delays = listOf("0" to tr("Jamais")) + listOf(2, 5, 10, 15, 30).map { it.toString() to tr("Après %d min", it) }
        screen.addView(Ui.text(c, tr("Mise en veille"), 18f, Ui.TEXT))
        screen.addView(dropdown(delays, a.prefs.standbyMinutes.toString()) { m -> a.prefs.standbyMinutes = m.toInt() },
            Ui.lp(Ui.MATCH, Ui.u(58), t = 8))
        screen.addView(Ui.text(c, tr("Sans geste ni programme en cours, l'écran s'assombrit et n'affiche plus que l'heure. Touchez-le ou tournez le bouton pour reprendre ; le couvercle et la balance le réveillent aussi."),
            15f, Ui.TEXT3).apply { setLineSpacing(0f, 1.1f) }, Ui.lp(t = 8))
        val knob = listOf("normal" to tr("Normale"), "dim" to tr("Plus légère"), "off" to tr("Éteinte"))
        screen.addView(Ui.text(c, tr("Molette pendant la veille"), 18f, Ui.TEXT), Ui.lp(t = 12))
        screen.addView(dropdown(knob, a.prefs.standbyKnob) { a.prefs.standbyKnob = it },
            Ui.lp(Ui.MATCH, Ui.u(58), t = 8))

        // ---- Date et heure
        val time = section(timePage, tr("Date et heure"), Icon.Kind.CLOCK)
        val zones = listOf(ZoneLookup.AUTO to tr("Automatique (d'après la connexion Internet)")) +
            (ZoneLookup.COMMON + listOf(TimeSync.current(), a.prefs.timeZone))
                .filter { it != ZoneLookup.AUTO }.distinct().map { it to it.replace('_', ' ') }
        time.addView(dropdown(zones, a.prefs.timeZone) { z ->
            a.prefs.timeZone = z
            setClock()
        }, Ui.lp(Ui.MATCH, Ui.u(58), t = 4))
        timeText = Ui.text(c, "", 16f, Ui.TEXT2).apply { setLineSpacing(0f, 1.15f) }
        time.addView(timeText, Ui.lp(t = 10))
        time.addView(Ui.button(c, tr("Mettre à l'heure"), Ui.Style.SECONDARY, Icon.Kind.SYNC, height = 52) { setClock() },
            Ui.lp(Ui.WRAP, Ui.WRAP, t = 10))
        refreshTime()

        // ---- Mes recettes
        val mine = section(recipesPage, tr("Mes recettes"), Icon.Kind.EDIT)
        mine.addView(Ui.text(c, tr("Sauvegardez vos recettes, ou passez-les à un autre robot, avec le fichier %s du dossier Download.", UserRecipes.FILE_NAME),
            16f, Ui.TEXT2).apply { setLineSpacing(0f, 1.15f) })
        val files = Ui.horizontal(c)
        files.addView(Ui.button(c, tr("Exporter"), Ui.Style.SECONDARY, Icon.Kind.UPLOAD, height = 52) { recipeFiles(export = true) }, Ui.lp(Ui.WRAP, Ui.WRAP, r = 10))
        files.addView(Ui.button(c, tr("Importer"), Ui.Style.SECONDARY, Icon.Kind.DOWNLOAD, height = 52) { recipeFiles(export = false) })
        mine.addView(files, Ui.lp(t = 12))

        // ---- Outils
        val tools = section(toolsPage, tr("Outils"), Icon.Kind.SETTINGS)
        tools.addView(link(tr("Diagnostic de la base moteur")) { a.push(DiagnosticsScreen(a)) })
        tools.addView(link(tr("Bouton rotatif")) { a.push(KnobScreen(a)) })
        tools.addView(link(tr("Journal")) { a.push(LogScreen(a)) })
        tools.addView(link(tr("Paramètres Android")) { a.openAndroidSettings() })
        tools.addView(link(tr("Ouvrir l'appli d'origine")) { a.openVendorApp() })
        val version = try { a.packageManager.getPackageInfo(a.packageName, 0).versionName } catch (_: Exception) { "?" }
        tools.addView(Ui.text(c, tr("Toque %s · protocole d'après le Monsieur Cuisine Developer SDK (licence MIT). " +
            "Projet indépendant, non affilié à Lidl ni à SilverCrest.", version), 14f, Ui.TEXT3).apply { setLineSpacing(0f, 1.1f) }, Ui.lp(t = 12))
        a.prefs.robot.let { p -> p.credit?.let { who ->
            tools.addView(Ui.text(c, tr("%s : protocole d'après %s (licence MIT).", p.displayName, who), 14f, Ui.TEXT3)
                .apply { setLineSpacing(0f, 1.1f) }, Ui.lp(t = 4))
        } }

        show(lastTab)
        return root
    }

    /** Affiche une rubrique : sa page à droite, sa ligne surlignée dans le menu. */
    private fun show(t: Tab) {
        lastTab = t
        claudimix.setActive(shown && t == Tab.CLAUDIMIX)
        for ((k, page) in pages) page.visibility = if (k == t) View.VISIBLE else View.GONE
        for ((k, row) in navRows) row.background = Ui.pressable(Ui.round(if (k == t) Ui.ACCENT_DIM else 0, 18f), 18f)
        pageScroll.scrollTo(0, 0)
    }

    /** Un groupe de réglages dans la page : titre et contenu, séparé du précédent par un filet. */
    private fun section(parent: LinearLayout, title: String, icon: Icon.Kind, divider: Boolean = false): LinearLayout {
        if (divider) parent.addView(View(c).apply { setBackgroundColor(Ui.SURFACE2) }, Ui.lp(Ui.MATCH, Ui.u(1), t = 18, b = 18))
        val group = Ui.vertical(c)
        val head = Ui.horizontal(c)
        head.addView(Icon(c, icon, Ui.ACCENT), LinearLayout.LayoutParams(Ui.u(24), Ui.u(24)).apply { rightMargin = Ui.u(10) })
        head.addView(Ui.text(c, title, 21f, Ui.TEXT, Ui.MEDIUM))
        group.addView(head, Ui.lp(b = 10))
        parent.addView(group, Ui.lp())
        return group
    }

    private fun toggle(label: String, initial: Boolean, onChange: (Boolean) -> Unit): LinearLayout {
        val row = Ui.horizontal(c)
        row.addView(Ui.text(c, label, 18f, Ui.TEXT), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        var state = initial
        // Interrupteur : piste arrondie, pastille à gauche (non) ou à droite (oui).
        val sw = android.widget.FrameLayout(c)
        val knob = View(c)
        sw.addView(knob, Ui.flp(Ui.u(34), Ui.u(34), Gravity.CENTER_VERTICAL))
        sw.setPadding(Ui.u(5), 0, Ui.u(5), 0)
        fun paint() {
            sw.background = Ui.round(if (state) Ui.ACCENT else Ui.SURFACE3, 22f, if (state) Ui.ACCENT else Ui.STROKE, 1f)
            knob.background = Ui.round(if (state) Ui.ON_ACCENT else Ui.TEXT2, 17f)
            (knob.layoutParams as android.widget.FrameLayout.LayoutParams).gravity =
                Gravity.CENTER_VERTICAL or (if (state) Gravity.END else Gravity.START)
            knob.requestLayout()
            sw.contentDescription = if (state) tr("Oui") else tr("Non")
        }
        paint()
        val flip = { _: View -> state = !state; paint(); onChange(state) }
        sw.setOnClickListener(flip)
        row.setOnClickListener(flip)   // toute la ligne est touchable, pas seulement l'interrupteur
        row.minimumHeight = Ui.u(52)
        row.addView(sw, LinearLayout.LayoutParams(Ui.u(76), Ui.u(44)).apply { leftMargin = Ui.u(14) })
        return row
    }

    private fun link(label: String, onClick: () -> Unit): LinearLayout {
        val row = Ui.horizontal(c)
        row.setPadding(0, Ui.u(14), 0, Ui.u(14))
        row.addView(Ui.text(c, label, 18f, Ui.TEXT), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        row.addView(Icon(c, Icon.Kind.CHEVRON, Ui.TEXT3), LinearLayout.LayoutParams(Ui.u(20), Ui.u(20)))
        row.background = Ui.pressable(Ui.round(0, 8f), 8f)
        row.isClickable = true
        row.setOnClickListener { onClick() }
        return row
    }

    /** Menu déroulant : la valeur choisie, et la liste qui s'ouvre en dessous. */
    private fun dropdown(options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit): View {
        val box = Ui.horizontal(c)
        box.setPadding(Ui.u(16), 0, Ui.u(14), 0)
        box.background = Ui.pressable(Ui.round(Ui.SURFACE2, 16f, Ui.STROKE, 1f), 16f)
        var current = selected
        fun labelOf(code: String) = options.firstOrNull { it.first == code }?.second ?: options.first().second
        val label = Ui.text(c, labelOf(current), 19f, Ui.TEXT)
        box.addView(label, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        box.addView(Icon(c, Icon.Kind.CHEVRON, Ui.TEXT2).apply { rotation = 90f }, LinearLayout.LayoutParams(Ui.u(22), Ui.u(22)))
        box.isClickable = true
        // Poser le doigt hors de la liste la ferme, y compris sur la case elle-même, qui reçoit aussi cet
        // appui : il faut s'en souvenir, sinon le même appui la rouvre aussitôt.
        var shown: PopupWindow? = null
        var boxDownAt = 0L
        var closedByDownAt = -1L
        box.setOnTouchListener { _, e ->
            if (e.actionMasked == MotionEvent.ACTION_DOWN) boxDownAt = e.downTime
            false
        }
        box.setOnClickListener {
            shown?.let {
                if (it.isShowing) {
                    it.dismiss()
                    return@setOnClickListener
                }
            }
            if (closedByDownAt == boxDownAt) {
                closedByDownAt = -1L
                return@setOnClickListener
            }
            val list = Ui.vertical(c)
            list.setPadding(0, Ui.u(6), 0, Ui.u(6))
            val scroll = ScrollView(c).apply {
                addView(list)
                background = Ui.round(Ui.SURFACE3, 16f, Ui.STROKE, 1f)
            }
            val height = if (options.size > 7) Ui.u(400) else ViewGroup.LayoutParams.WRAP_CONTENT
            val popup = PopupWindow(scroll, box.width, height, false)
            for ((code, name) in options) {
                val row = Ui.text(c, name, 19f, if (code == current) Ui.ACCENT else Ui.TEXT)
                row.setPadding(Ui.u(16), Ui.u(14), Ui.u(16), Ui.u(14))
                row.background = Ui.pressable(Ui.round(0, 0f), 0f)
                row.isClickable = true
                row.setOnClickListener {
                    popup.dismiss()
                    if (code != current) {
                        // Le choix s'affiche tout de suite (avant, il fallait rouvrir les réglages).
                        current = code
                        label.text = labelOf(code)
                        onPick(code)
                    }
                }
                list.addView(row, Ui.lp(Ui.MATCH, Ui.WRAP))
            }
            popup.setBackgroundDrawable(ColorDrawable(0))
            popup.isOutsideTouchable = true
            popup.setTouchInterceptor { _, e ->
                if (e.actionMasked == MotionEvent.ACTION_OUTSIDE) closedByDownAt = e.downTime
                false
            }
            popup.setOnDismissListener { if (shown === popup) shown = null }
            popup.elevation = Ui.uf(8f)
            popup.showAsDropDown(box, 0, Ui.u(6))
            shown = popup
        }
        return box
    }

    private fun recipeFiles(export: Boolean) {
        a.withStorage { ok ->
            if (!ok) { a.toast(tr("Accès au dossier Download refusé"), Ui.WARN); return@withStorage }
            Thread {
                val files = RecipeFiles(a.app.recipes, a.app.log)
                val r = if (export) files.export() else files.import()
                view.post { a.toast(r.message, if (r.ok) Ui.OK else Ui.WARN) }
            }.start()
        }
    }

    private fun refreshTime(message: String? = null) {
        val zone = TimeSync.current()
        val mode = if (a.prefs.timeZone == ZoneLookup.AUTO) tr("automatique") else tr("choisi à la main")
        timeText.text = tr("Il est %s · fuseau %s (%s)", TimeSync.clock(), zone.replace('_', ' '), mode) +
            (message?.let { "\n" + it } ?: "")
    }

    private fun setClock() {
        if (settingTime) return
        settingTime = true
        timeText.text = tr("Réglage de l'heure…")
        Thread {
            val r = try {
                TimeSync(a, a.prefs, a.app.log).run()
            } catch (e: Exception) {
                TimeSync.Result(false, TimeSync.current(), e.message ?: e.toString())
            }
            a.runOnUiThread {
                settingTime = false
                refreshTime(if (r.ok) null else r.message)
                if (r.ok) a.toast(r.message, Ui.OK)
            }
        }.start()
    }

    override fun onShow() {
        shown = true
        claudimix.setActive(lastTab == Tab.CLAUDIMIX)
    }

    override fun onHide() {
        shown = false
        claudimix.setActive(false)
    }

}
