package app.toque.core.claudimix

import app.toque.core.i18n.tr
import app.toque.core.machine.JobState
import app.toque.core.machine.Snapshot

/**
 * Ce que l'écran de cuisson guidée montre en ce moment (voir web/API-ROBOT.md, « État en temps
 * réel ») : la recette, l'étape et ce qu'elle attend de la personne.
 */
data class Cooking(
    val recipeId: String,
    val title: String,
    /** Étape affichée, à partir de 0. */
    val index: Int,
    val total: Int,
    val text: String,
    /** Texte de l'étape suivante (null à la dernière). */
    val next: String?,
    /** Pesée demandée par l'étape (g), 0 sans pesée. */
    val weighGrams: Int = 0,
    val weighLabel: String = "",
    /** Réglage machine de l'étape (« 5 min · 100 °C · vitesse 1 »), null pour une étape à lire seulement. */
    val machine: String? = null,
    /** Le réglage de cette étape a déjà tourné. */
    val stepDone: Boolean = false,
    /** L'écran de cuisson est affiché (sinon : recette en cours vue d'ailleurs, sans action attendue). */
    val onScreen: Boolean = true,
)

/** Calcul pur de l'état envoyé à Claudimix (testé dans le cœur, sans Android ni réseau). */
object RobotReport {
    const val RUNNING_INTERVAL_MS = 3_000L
    const val IDLE_INTERVAL_MS = 60_000L
    /** Une action doit rester la même ce temps-là avant d'être envoyée (pas de notification fugace entre deux étapes enchaînées). */
    const val ACTION_SETTLE_MS = 2_000L
    /** Durée pendant laquelle « finished » reste l'état affiché après une fin de recette. */
    const val FINISHED_KEEP_MS = 10 * 60_000L

    fun status(s: Snapshot, finished: Boolean): String = when {
        s.hasFault -> "error"
        s.turboActive || s.state == JobState.RUNNING || s.state == JobState.STARTING || s.state == JobState.STOPPING -> "running"
        s.state == JobState.PAUSED -> "paused"
        finished -> "finished"
        else -> "idle"
    }

    /** Ce que l'écran de cuisson attend de la personne, ou null (programme en cours, rien à faire). */
    fun action(s: Snapshot, c: Cooking?): String? {
        if (c == null || !c.onScreen || s.hasFault) return null
        if (s.state == JobState.PAUSED) return if (s.lidOpen) tr("Fermez le couvercle pour reprendre") else tr("Programme en pause")
        if (s.busy) return null
        if (c.weighGrams > 0) return tr("Pesez %d g", c.weighGrams) + if (c.weighLabel.isNotBlank()) " · ${c.weighLabel}" else ""
        if (c.machine != null && !c.stepDone) return tr("Lancez l'étape : %s", c.machine)
        if (c.machine == null && c.text.isNotBlank()) return c.text.take(240)
        return null
    }

    /**
     * Corps de POST /api/robot/state. [cooking] : recette guidée en cours (null : aucune) ;
     * [action] : déjà stabilisée par l'appelant (voir [ACTION_SETTLE_MS]).
     */
    fun body(s: Snapshot, cooking: Cooking?, finished: Cooking?, action: String?): Map<String, Any?> {
        val status = status(s, finished != null)
        val shown = cooking ?: finished
        val m = LinkedHashMap<String, Any?>()
        m["status"] = status
        m["recipe"] = shown?.let { linkedMapOf("id" to it.recipeId, "title" to it.title) }
        m["step"] = cooking?.let {
            linkedMapOf("index" to it.index + 1, "total" to it.total, "text" to it.text.take(400), "next" to it.next?.take(400))
        }
        val active = s.jobActive && (s.state == JobState.RUNNING || s.state == JobState.STARTING || s.state == JobState.PAUSED || s.state == JobState.STOPPING)
        m["remainingSec"] = if (active) ((s.remainingMs + 999) / 1000).toInt() else null
        m["tempC"] = if (s.hasSample) s.actualTempC else null
        m["speed"] = if (active) s.jobSpeed else if (s.hasSample) s.speedLevel else null
        m["reverse"] = if (active) s.jobReverse else null
        m["weightG"] = if (s.hasSample) s.weightG else null
        m["lidClosed"] = if (s.hasSample) !s.lidOpen else null
        m["action"] = action
        m["error"] = if (s.hasFault) s.faultMessage.ifBlank { s.faultCode } else null
        return m
    }

    /**
     * Ce qui, en changeant, justifie un envoi tout de suite (statut, recette, étape, action,
     * couvercle, réglage) ; le temps restant, la température et le poids attendent le prochain envoi.
     */
    fun signature(body: Map<String, Any?>): String =
        listOf("status", "recipe", "step", "action", "lidClosed", "speed", "reverse", "error").joinToString("|") { "${body[it]}" }

    fun intervalMs(status: String): Long = if (status == "running" || status == "paused") RUNNING_INTERVAL_MS else IDLE_INTERVAL_MS
}

/** Matrice du QR code reçue de pair/start : une chaîne de 0/1 par ligne, carrée. Null si elle est invalide. */
object QrMatrix {
    fun parse(rows: List<String>): Array<BooleanArray>? {
        val n = rows.size
        if (n < 21 || n > 200) return null
        if (rows.any { it.length != n || it.any { ch -> ch != '0' && ch != '1' } }) return null
        return Array(n) { y -> BooleanArray(n) { x -> rows[y][x] == '1' } }
    }
}

/** Une page de GET /api/robot/recipes. */
class RecipePage<R>(val recipes: List<R>, val deleted: List<String>, val next: Long?, val until: Long)

/**
 * Pages de recettes depuis [since] : rappelle avec `since = next` tant que `next` n'est pas null,
 * enregistre chaque page avec [save] avant de demander la suivante, et rend le `until` de la
 * dernière page (le prochain `since`). Une erreur de [fetch] remonte : ce qui est enregistré reste.
 */
object RecipePager {
    const val MAX_PAGES = 200

    fun <R> run(since: Long, fetch: (Long) -> RecipePage<R>, save: (RecipePage<R>, cursor: Long) -> Unit): Long {
        var cursor = since
        var pages = 0
        while (true) {
            val p = fetch(cursor)
            val next = p.next
            if (next != null && next > cursor) {
                save(p, next)
                cursor = next
                // Garde-fou : la suite viendra à la prochaine synchro.
                if (++pages >= MAX_PAGES) return cursor
                continue
            }
            // Fin (ou `next` qui n'avance pas) : on reprendra à `until`.
            val end = maxOf(cursor, p.until)
            save(p, end)
            return end
        }
    }
}
