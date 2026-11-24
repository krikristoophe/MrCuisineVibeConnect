package app.toque.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Thème et utilitaires de mise en page, à l'échelle d'un écran de référence 1024×600.
 * Couleurs de base (fond, texte…) du thème clair ; accent orange (voir [setAccent]).
 */
object Ui {
    /** Couleurs d'accent (Réglages › Couleur). La première est celle d'origine. */
    val ACCENTS = intArrayOf(
        0xFFFF8A3D.toInt(), // orange
        0xFFFFB547.toInt(), // safran
        0xFFE8D44D.toInt(), // citron
        0xFF8BD85F.toInt(), // pistache
        0xFF3DDCB0.toInt(), // menthe
        0xFF4FC3F7.toInt(), // ciel
        0xFF6E9BFF.toInt(), // bleuet
        0xFFB48CFF.toInt(), // lavande
        0xFFF2639A.toInt(), // framboise
        0xFFFF6F61.toInt(), // corail
    )

    // Thème clair uniquement (le thème sombre a été retiré).
    val BG = 0xFFF3F5F8.toInt()
    val SURFACE = 0xFFFFFFFF.toInt()
    val SURFACE2 = 0xFFEBEEF3.toInt()
    val SURFACE3 = 0xFFDEE3EB.toInt()
    val STROKE = 0xFFC5CDD9.toInt()
    val TEXT = 0xFF1A2332.toInt()
    val TEXT2 = 0xFF5A6578.toInt()
    val TEXT3 = 0xFF8B95A8.toInt()
    val SCRIM = 0x99000000.toInt()
    private val bgGradient = intArrayOf(0xFFF7F8FB.toInt(), 0xFFEEF1F6.toInt(), 0xFFE4E9F1.toInt())
    private val rippleColor = 0x22000000
    private val placeholders = intArrayOf(
        0xFFE8D5C4.toInt(), 0xFFC5DDD4.toInt(), 0xFFD4CDE4.toInt(), 0xFFE4CCD2.toInt(),
        0xFFC8D5E4.toInt(), 0xFFE0DBC4.toInt(), 0xFFC9DEC9.toInt(), 0xFFE4D4C4.toInt(),
    )

    const val COOL = 0xFF5CC8FF.toInt()
    const val OK = 0xFF3DDC97.toInt()
    const val WARN = 0xFFFFC14D.toInt()
    const val DANGER = 0xFFFF5A5F.toInt()

    var ACCENT = ACCENTS[0]
        private set
    var ACCENT_DIM = 0x33FF8A3D
        private set
    /** Texte posé sur l'accent (boutons primaires, puces sélectionnées). */
    var ON_ACCENT = 0xFF1A0E05.toInt()
        private set

    fun setAccent(color: Int) {
        val c = if (color in ACCENTS) color else ACCENTS[0]
        ACCENT = c
        ACCENT_DIM = (c and 0x00FFFFFF) or 0x33000000
        fun dark(ch: Int) = (((c shr ch) and 0xFF) * 0.12f).toInt() shl ch
        ON_ACCENT = (0xFF shl 24) or dark(16) or dark(8) or dark(0)
    }

    val LIGHT: Typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
    val THIN: Typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL)
    val REGULAR: Typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    val MEDIUM: Typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    val BOLD: Typeface = Typeface.create("sans-serif", Typeface.BOLD)

    /** Facteur d'échelle : 1 unité = 1 px sur un écran 1024×600. */
    var scale = 1f

    fun init(widthPx: Int, heightPx: Int) {
        val w = maxOf(widthPx, heightPx)
        val h = minOf(widthPx, heightPx)
        scale = minOf(w / 1024f, h / 600f)
    }

    fun u(v: Float): Int = Math.round(v * scale)
    fun u(v: Int): Int = Math.round(v * scale)
    fun uf(v: Float): Float = v * scale

    fun round(color: Int, radius: Float, strokeColor: Int = 0, strokeWidth: Float = 0f): GradientDrawable =
        GradientDrawable().apply {
            // Le rayon avant la couleur : sous Android 6, setCornerRadius ne recalcule pas l'opacité.
            // Dans l'autre ordre, la forme se dit opaque sur tout son rectangle, et l'effet d'appui
            // dont elle est le masque (voir pressable) éclaire un carré au lieu du bouton arrondi.
            setCornerRadius(uf(radius))
            setColor(color)
            if (strokeWidth > 0) setStroke(u(strokeWidth), strokeColor)
        }

    fun pressable(base: Drawable, radius: Float, ripple: Int = rippleColor): Drawable =
        RippleDrawable(ColorStateList.valueOf(ripple), base, round(Color.WHITE, radius))

    fun text(c: Context, s: CharSequence = "", size: Float = 18f, color: Int = TEXT, face: Typeface = REGULAR): TextView =
        TextView(c).apply {
            text = s
            setTextSize(TypedValue.COMPLEX_UNIT_PX, uf(size))
            setTextColor(color)
            typeface = face
            includeFontPadding = false
        }

    /** Texte d'une seule ligne, rapetissé de [size] jusqu'à [min] pour tenir dans sa largeur (jamais de retour à la ligne). */
    fun fitText(c: Context, size: Float, min: Float, color: Int = TEXT, face: Typeface = REGULAR): TextView =
        object : TextView(c) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
                val avail = View.MeasureSpec.getSize(widthMeasureSpec) - paddingLeft - paddingRight
                if (View.MeasureSpec.getMode(widthMeasureSpec) != View.MeasureSpec.UNSPECIFIED && avail > 0) {
                    val p = android.graphics.Paint(paint)
                    var px = uf(size)
                    p.textSize = px
                    val s = text.toString()
                    while (px > uf(min) && p.measureText(s) > avail) { px -= 1f; p.textSize = px }
                    if (px != textSize) setTextSize(TypedValue.COMPLEX_UNIT_PX, px)
                }
                super.onMeasure(widthMeasureSpec, heightMeasureSpec)
            }

            override fun onTextChanged(text: CharSequence?, start: Int, lengthBefore: Int, lengthAfter: Int) {
                super.onTextChanged(text, start, lengthBefore, lengthAfter)
                requestLayout()
            }
        }.apply {
            setTextSize(TypedValue.COMPLEX_UNIT_PX, uf(size))
            setTextColor(color)
            typeface = face
            includeFontPadding = false
            setSingleLine()
            ellipsize = TextUtils.TruncateAt.END
        }

    fun ellipsize(t: TextView, lines: Int = 1): TextView {
        t.maxLines = lines
        t.ellipsize = TextUtils.TruncateAt.END
        return t
    }

    fun vertical(c: Context, gravity: Int = Gravity.START): LinearLayout = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        setGravity(gravity)
    }

    fun horizontal(c: Context, gravity: Int = Gravity.CENTER_VERTICAL): LinearLayout = LinearLayout(c).apply {
        orientation = LinearLayout.HORIZONTAL
        setGravity(gravity)
    }

    fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, weight: Float = 0f,
           l: Int = 0, t: Int = 0, r: Int = 0, b: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(w, h, weight).apply { setMargins(u(l), u(t), u(r), u(b)) }

    fun flp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.MATCH_PARENT,
            gravity: Int = Gravity.NO_GRAVITY): FrameLayout.LayoutParams = FrameLayout.LayoutParams(w, h, gravity)

    const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    fun pad(v: View, all: Int): View {
        v.setPadding(u(all), u(all), u(all), u(all))
        return v
    }

    fun pad(v: View, h: Int, vert: Int): View {
        v.setPadding(u(h), u(vert), u(h), u(vert))
        return v
    }

    fun scroll(c: Context, child: View): ScrollView = ScrollView(c).apply {
        isFillViewport = true
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        addView(child)
    }

    fun spacer(c: Context, w: Int = 0, h: Int = 0, weight: Float = 0f): View =
        View(c).apply { layoutParams = LinearLayout.LayoutParams(if (w == 0 && weight > 0) 0 else u(w), u(h), weight) }

    fun divider(c: Context): View = View(c).apply {
        background = ColorDrawable(STROKE)
        layoutParams = LinearLayout.LayoutParams(MATCH, maxOf(1, u(1)))
    }

    enum class Style { PRIMARY, SECONDARY, DANGER, GHOST, COOL }

    /** Bouton arrondi avec icône facultative. */
    fun button(c: Context, label: String, style: Style = Style.SECONDARY, icon: Icon.Kind? = null,
               height: Int = 64, textSize: Float = 20f, onClick: (View) -> Unit): LinearLayout {
        val (bg, fg) = when (style) {
            Style.PRIMARY -> ACCENT to ON_ACCENT
            Style.SECONDARY -> SURFACE3 to TEXT
            Style.DANGER -> DANGER to Color.WHITE
            Style.GHOST -> Color.TRANSPARENT to TEXT2
            Style.COOL -> COOL to 0xFF04131C.toInt()
        }
        val row = horizontal(c, Gravity.CENTER)
        row.minimumHeight = u(height)
        row.setPadding(u(22), 0, u(22), 0)
        val base = if (style == Style.GHOST) round(Color.TRANSPARENT, height / 2f, STROKE, 1.5f) else round(bg, height / 2f)
        row.background = pressable(base, height / 2f)
        if (icon != null) {
            row.addView(Icon(c, icon, fg), LinearLayout.LayoutParams(u(textSize * 1.3f), u(textSize * 1.3f)).apply {
                if (label.isNotEmpty()) rightMargin = u(10)
            })
        }
        if (label.isNotEmpty()) row.addView(text(c, label, textSize, fg, MEDIUM))
        row.isClickable = true
        row.isFocusable = true
        row.setOnClickListener { onClick(it) }
        return row
    }

    fun setButtonEnabled(b: View, enabled: Boolean) {
        b.isEnabled = enabled
        b.alpha = if (enabled) 1f else 0.35f
    }

    /** Pastille d'information (icône + texte). */
    fun chip(c: Context, label: String, icon: Icon.Kind? = null, color: Int = TEXT2, bg: Int = SURFACE2, size: Float = 16f): LinearLayout {
        val row = horizontal(c, Gravity.CENTER_VERTICAL)
        row.setPadding(u(12), u(6), u(14), u(6))
        row.background = round(bg, 40f)
        if (icon != null) row.addView(Icon(c, icon, color), LinearLayout.LayoutParams(u(size * 1.2f), u(size * 1.2f)).apply { rightMargin = u(6) })
        row.addView(text(c, label, size, color, MEDIUM))
        return row
    }

    fun chipText(chip: LinearLayout): TextView = chip.getChildAt(chip.childCount - 1) as TextView

    /** Puce sélectionnable (filtres, choix). */
    fun toggleChip(c: Context, label: String, selected: Boolean, onClick: () -> Unit): TextView {
        val t = text(c, label, 17f, if (selected) ON_ACCENT else TEXT, MEDIUM)
        t.setPadding(u(18), u(10), u(18), u(10))
        t.background = pressable(if (selected) round(ACCENT, 40f) else round(SURFACE2, 40f, STROKE, 1f), 40f)
        t.isClickable = true
        t.setOnClickListener { onClick() }
        return t
    }

    fun card(c: Context, radius: Float = 24f, color: Int = SURFACE): LinearLayout = vertical(c).apply {
        background = round(color, radius)
        setPadding(u(20), u(18), u(20), u(18))
    }

    fun clock(ms: Long): String {
        val s = (ms + 999) / 1000
        return if (s >= 3600) String.format("%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
        else String.format("%02d:%02d", s / 60, s % 60)
    }

    fun duration(seconds: Int): String = when {
        seconds < 60 -> "$seconds s"
        seconds % 60 == 0 -> "${seconds / 60} min"
        else -> "${seconds / 60} min ${seconds % 60} s"
    }

    /** Couleur liée à une température : froid -> bleu, tiède -> orange, chaud -> rouge. */
    fun tempColor(c: Int): Int = when {
        c >= 90 -> DANGER
        c >= 60 -> ACCENT
        c >= 40 -> WARN
        else -> COOL
    }

    /** Couleur de repli stable pour une vignette de recette sans photo. */
    fun placeholderColors(seed: String): IntArray {
        val i = Math.abs(seed.hashCode()) % placeholders.size
        val a = placeholders[i]
        val b = placeholders[(i + 3) % placeholders.size]
        return intArrayOf(a, b)
    }

    fun initials(title: String): String {
        val words = title.split(' ', '-', '\'').filter { it.length > 2 }
        return words.take(2).joinToString("") { it.first().uppercaseChar().toString() }.ifEmpty { title.take(1).uppercase() }
    }

    /** Fond de l'appli : dégradé selon le thème. */
    fun background(): GradientDrawable =
        GradientDrawable(GradientDrawable.Orientation.TL_BR, bgGradient.copyOf())

    fun gradient(colors: IntArray, radius: Float): GradientDrawable =
        GradientDrawable(GradientDrawable.Orientation.TL_BR, colors).apply { setCornerRadius(uf(radius)) }
}
