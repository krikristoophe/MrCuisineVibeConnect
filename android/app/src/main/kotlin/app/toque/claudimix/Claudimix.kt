package app.toque.claudimix

import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.Process
import app.toque.ToqueApp
import app.toque.core.claudimix.Cooking
import app.toque.core.claudimix.RecipePage
import app.toque.core.claudimix.RecipePager
import app.toque.core.claudimix.RobotReport
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.core.json.Json
import app.toque.core.machine.Snapshot
import app.toque.core.recipes.Recipe
import app.toque.core.recipes.RecipeCodec
import app.toque.core.recipes.RecipeSource
import app.toque.recipes.RecipePhotos
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.concurrent.Executors

/**
 * Le robot relié au service web Claudimix (web/API-ROBOT.md) : appairage par QR code, état en
 * temps réel (et commandes reçues en retour), recettes du foyer et repas du jour.
 *
 * Rien ici ne tourne sur le fil de l'interface ni ne touche au moteur : l'état part d'un fil à lui
 * (« toque-claudimix »), les recettes d'un autre, le reste (appairage, repas, favoris) d'un
 * troisième. Les erreurs réseau ne vont qu'au journal.
 */
class Claudimix(private val app: ToqueApp) {
    val api = ClaudimixApi(app)
    private val prefs get() = app.prefs
    private val repo get() = app.recipes
    private val log get() = app.log
    private val main = Handler(Looper.getMainLooper())
    private val worker: Handler = HandlerThread("toque-claudimix", Process.THREAD_PRIORITY_BACKGROUND).run { start(); Handler(looper) }
    private val syncExec = Executors.newSingleThreadExecutor { r -> Thread(r, "toque-claudimix-recettes").apply { priority = Thread.MIN_PRIORITY } }
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "toque-claudimix-io").apply { priority = Thread.NORM_PRIORITY - 1 } }
    private val listeners = ArrayList<() -> Unit>()
    private var started = false

    val linked: Boolean get() = prefs.claudimixLinked
    val household: String get() = prefs.claudimixHousehold

    /** Dernier contact réussi avec le service (ms), 0 : aucun depuis le démarrage. */
    @Volatile var lastContactMs = 0L
        private set
    /** Dernière erreur réseau (null : le dernier appel a réussi). */
    @Volatile var lastError: String? = null
        private set
    @Volatile var syncing = false
        private set
    @Volatile var lastSyncMessage = ""
        private set

    /** Prévient (sur le fil de l'interface) quand la liaison, la synchro ou les repas changent. */
    fun onChange(l: () -> Unit): () -> Unit {
        listeners += l
        return { listeners -= l }
    }

    private fun changed() = main.post { for (l in ArrayList(listeners)) l() }

    /** Lancé une fois par l'activité : écoute la machine, envoie l'état, synchronise les recettes. */
    fun start() {
        if (started) return
        started = true
        app.machine.onSnapshot { s -> onSnapshot(s) }
        if (linked) {
            kick(2_000)
            scheduleSync(20_000)
            refreshToday()
        }
    }

    // ------------------------------------------------------------------ appairage

    fun pairStart(done: (Result<ClaudimixApi.Pairing>) -> Unit) = io.execute {
        val r = runCatching { api.pairStart() }
        r.exceptionOrNull()?.let { note("appairage", it) }
        main.post { done(r) }
    }

    fun pairPoll(pollToken: String, done: (Result<ClaudimixApi.Poll>) -> Unit) = io.execute {
        val r = runCatching { api.pairPoll(pollToken) }
        r.exceptionOrNull()?.let { note("appairage", it) }
        val p = r.getOrNull()
        if (p is ClaudimixApi.Poll.Paired) {
            prefs.linkClaudimix(p.token, p.robotId, p.household)
            lastError = null
            lastContactMs = System.currentTimeMillis()
            log.write("claudimix", "robot relié au foyer « ${p.household} »")
            kick(0)
            scheduleSync(0)
            refreshToday()
        }
        main.post { done(r) }
        if (p is ClaudimixApi.Poll.Paired) changed()
    }

    /** Dissocier : le robot oublie son jeton (le foyer le retire de son côté). Les recettes restent. */
    fun unlink() {
        prefs.forgetClaudimix()
        today = null
        log.write("claudimix", "robot dissocié")
        changed()
    }

    private fun lost() {
        if (!linked) return
        prefs.forgetClaudimix()
        today = null
        log.write("claudimix", "jeton refusé (robot retiré du foyer) : jeton effacé")
        changed()
    }

    // ------------------------------------------------------------------ état en temps réel

    @Volatile private var snapshot = Snapshot()
    private var cooking: Cooking? = null
    private var finished: Cooking? = null
    private var finishedUntil = 0L
    private var actionCandidate: String? = null
    private var actionSince = 0L
    private var lastKickSig = ""
    @Volatile private var lastSentSig = ""
    @Volatile private var lastSentMs = 0L
    private val handled = LinkedHashSet<String>()

    /** Commande « open_recipe » reçue (sur le fil de l'interface) ; posé par l'activité affichée. */
    var onOpenRecipe: ((String) -> Unit)? = null

    /** L'écran de cuisson guidée montre [c] (null : plus de recette à l'écran). */
    fun cooking(c: Cooking?) {
        synchronized(this) {
            cooking = c
            if (c != null && finished?.recipeId != c.recipeId) finished = null
        }
        check()
    }

    /** Fin de la recette [c] : « finished » (notification, recette comptée) jusqu'au prochain programme. */
    fun recipeFinished(c: Cooking) {
        synchronized(this) {
            finished = c.copy(onScreen = false)
            finishedUntil = System.currentTimeMillis() + RobotReport.FINISHED_KEEP_MS
            if (cooking?.recipeId == c.recipeId) cooking = null
        }
        check()
    }

    private fun onSnapshot(s: Snapshot) {
        snapshot = s
        if (s.busy) synchronized(this) { finished = null }
        check()
    }

    /** Envoi tout de suite (une fois par seconde au plus) si ce qui compte a changé. */
    private fun check() {
        if (!linked) return
        val now = System.currentTimeMillis()
        val sig = RobotReport.signature(body(now))
        if (sig == lastSentSig || sig == lastKickSig) return
        lastKickSig = sig
        kick(maxOf(0L, 1_000L - (now - lastSentMs)))
    }

    @Synchronized
    private fun body(now: Long): Map<String, Any?> {
        val s = snapshot
        if (finished != null && now > finishedUntil) finished = null
        val raw = RobotReport.action(s, cooking)
        if (raw != actionCandidate) {
            actionCandidate = raw
            actionSince = now
            // Le texte doit tenir un moment avant d'être envoyé (voir ACTION_SETTLE_MS) : on revient voir.
            if (raw != null) main.postDelayed({ check() }, RobotReport.ACTION_SETTLE_MS + 100)
        }
        val action = if (raw != null && now - actionSince >= RobotReport.ACTION_SETTLE_MS) raw else null
        return RobotReport.body(s, cooking, finished, action)
    }

    private val tick = Runnable { send() }

    private fun kick(delayMs: Long) {
        worker.removeCallbacks(tick)
        worker.postDelayed(tick, delayMs)
    }

    /** Sur le fil « toque-claudimix ». */
    private fun send() {
        val token = prefs.claudimixToken
        if (token.isBlank()) return
        val now = System.currentTimeMillis()
        val body = body(now)
        lastSentSig = RobotReport.signature(body)
        lastSentMs = now
        try {
            val commands = api.postState(token, Json.write(body))
            contact()
            for (c in commands) if (handled.add(c.id)) {
                while (handled.size > 50) handled.remove(handled.first())
                if (c.type == "open_recipe" && c.recipeId.isNotBlank()) main.post { openRecipe(c.recipeId) }
            }
        } catch (e: ClaudimixApi.HttpError) {
            if (e.status == 401) { lost(); return }
            failed("état", e)
        } catch (e: Exception) {
            failed("état", e)
        }
        kick(RobotReport.intervalMs(body["status"] as String))
    }

    private fun openRecipe(id: String) {
        val open = onOpenRecipe ?: return
        if (repo.get(id) != null) { open(id); return }
        // Recette pas encore reçue : une synchro, puis un nouvel essai.
        log.write("claudimix", "recette $id demandée, absente du robot : synchro")
        syncExec.execute {
            syncNow()
            main.post { if (repo.get(id) != null) onOpenRecipe?.invoke(id) }
        }
    }

    private fun contact() {
        lastContactMs = System.currentTimeMillis()
        if (lastError != null) {
            lastError = null
            log.write("claudimix", "service joignable")
            changed()
        }
    }

    private fun failed(what: String, e: Exception) {
        val msg = e.message ?: e.toString()
        if (msg != lastError) {
            lastError = msg
            log.write("claudimix", "$what : $msg")
            changed()
        }
    }

    private fun note(what: String, e: Throwable) = log.write("claudimix", "$what : ${e.message ?: e}")

    // ------------------------------------------------------------------ recettes

    private val syncTick = Runnable { syncExec.execute { syncNow() } }

    private fun scheduleSync(delayMs: Long) {
        worker.removeCallbacks(syncTick)
        worker.postDelayed(syncTick, delayMs)
    }

    /** Synchro des recettes en arrière-plan (bouton de la page Claudimix). */
    fun syncRecipes() = syncExec.execute { syncNow() }

    /**
     * Recettes modifiées depuis le curseur, page par page. N'efface que les ids que le service
     * liste dans `deleted` ; s'il ne répond pas, rien n'est touché (les pages déjà reçues restent).
     */
    private fun syncNow() {
        val token = prefs.claudimixToken
        if (token.isBlank() || syncing) return
        syncing = true
        changed()
        var received = 0
        var removed = 0
        try {
            sendFavorites(token)
            RecipePager.run(prefs.claudimixSince, { since ->
                val p = api.recipes(token, since)
                RecipePage(p.recipes.mapNotNull(::decode), p.deleted, p.next, p.until)
            }) { page, cursor ->
                if (page.recipes.isNotEmpty()) repo.upsertAll(page.recipes, rebuild = false)
                if (page.deleted.isNotEmpty()) removed += repo.removeIds(page.deleted, rebuild = false)
                received += page.recipes.size
                prefs.claudimixSince = cursor
            }
            contact()
            if (received + removed > 0) repo.refresh()
            prefs.claudimixSyncMs = System.currentTimeMillis()
            lastSyncMessage = stamp() + " : " + tr("%d recettes reçues, %d retirées", received, removed)
            log.write("claudimix", "recettes : $received reçue(s), $removed retirée(s)")
            photos()
        } catch (e: ClaudimixApi.HttpError) {
            if (received + removed > 0) repo.refresh()
            if (e.status == 401) lost() else syncFailed(e)
        } catch (e: Exception) {
            if (received + removed > 0) repo.refresh()
            syncFailed(e)
        } finally {
            syncing = false
            changed()
            if (linked) scheduleSync(SYNC_EVERY_MS)
        }
    }

    private fun syncFailed(e: Exception) {
        lastSyncMessage = stamp() + " : " + tr("Claudimix injoignable : %s", e.message ?: e.toString())
        failed("recettes", e)
    }

    private fun stamp(): String = SimpleDateFormat(tr("dd/MM à HH:mm"), I18n.locale).format(Date())

    private fun decode(json: String): Recipe? = try {
        RecipeCodec.decode(json, RecipeSource.IMPORTED)?.copy(source = RecipeSource.IMPORTED, favorite = false)
    } catch (e: Exception) {
        log.write("claudimix", "recette illisible : ${e.message}")
        null
    }

    /** Photos manquantes des recettes du catalogue (CDN Lidl), une fois chacune. */
    private fun photos() {
        if (!repo.loaded) return
        val missing = repo.index.entries.map { it.image }.filter { it.startsWith("https://") && !RecipePhotos.has(repo, it) }.distinct()
        if (missing.isEmpty()) return
        var got = 0
        var inARow = 0
        for (url in missing) {
            if (!linked) break
            try {
                RecipePhotos.download(repo, url)
                got++
                inARow = 0
                if (got % 50 == 0) repo.photosChanged()
            } catch (e: IOException) {
                if (++inARow >= 5) {
                    log.write("claudimix", "photos : ${e.message} (reprise à la prochaine synchro)")
                    break
                }
            }
            try { Thread.sleep(100) } catch (_: InterruptedException) {}
        }
        if (got > 0) {
            log.write("claudimix", "$got photo(s) reçue(s)")
            repo.photosChanged()
        }
    }

    /** Une fois après l'appairage : les favoris du robot rejoignent ceux du foyer. */
    private fun sendFavorites(token: String) {
        if (prefs.claudimixFavoritesSent || !repo.loaded) return
        val ids = repo.favoriteIds()
        if (ids.isNotEmpty()) api.favorites(token, ids)
        prefs.claudimixFavoritesSent = true
        log.write("claudimix", "${ids.size} favori(s) envoyé(s) au foyer")
    }

    // ------------------------------------------------------------------ repas du jour

    @Volatile var today: ClaudimixApi.Today? = null
        private set
    @Volatile private var todayMs = 0L

    /** Repas d'aujourd'hui (midi, soir), dans l'ordre ; vide si non relié ou rien de prévu. */
    fun todayMeals(): List<ClaudimixApi.Meal> {
        val t = today ?: return emptyList()
        return t.meals.filter { it.day == t.today }.sortedBy { if (it.slot == "midi") 0 else 1 }
    }

    /** Recharge les repas s'ils ont plus de [maxAgeMs] (accueil affiché, toutes les 15 min). */
    fun refreshToday(maxAgeMs: Long = 0) {
        if (!linked || System.currentTimeMillis() - todayMs < maxAgeMs) return
        todayMs = System.currentTimeMillis()
        io.execute {
            val token = prefs.claudimixToken
            if (token.isBlank()) return@execute
            try {
                val t = api.today(token)
                contact()
                today = t
                changed()
                // Photos des repas dont la recette n'est pas (encore) sur le robot.
                var got = false
                for (m in t.meals) if (m.image.startsWith("https://") && !RecipePhotos.has(repo, m.image)) {
                    try {
                        RecipePhotos.download(repo, m.image)
                        got = true
                    } catch (_: IOException) {
                    }
                }
                if (got) changed()
            } catch (e: ClaudimixApi.HttpError) {
                todayMs = 0
                if (e.status == 401) lost() else failed("repas", e)
            } catch (e: Exception) {
                todayMs = 0
                failed("repas", e)
            }
        }
    }

    companion object {
        const val SYNC_EVERY_MS = 3600_000L
    }
}
