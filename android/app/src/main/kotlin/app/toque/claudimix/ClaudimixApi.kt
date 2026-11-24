package app.toque.claudimix

import android.content.Context
import app.toque.ExtraRoots
import app.toque.Http
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.HttpsURLConnection

/**
 * Client HTTP du service Claudimix (contrat : web/API-ROBOT.md). Appels bloquants, à faire hors du
 * fil de l'interface. Le certificat de *.workers.dev remonte à Let's Encrypt (ISRG Root X2 /
 * Root YE), inconnues d'Android 6 : chaque connexion utilise explicitement [ExtraRoots], qui
 * ajoute aux racines du système celles embarquées dans assets/certs.
 */
class ClaudimixApi(private val context: Context, val baseUrl: String = BASE_URL) {
    /** Réponse HTTP autre que 2xx ([status] 401 : robot retiré du foyer ; 410 : code expiré). */
    class HttpError(val status: Int, val body: String) : IOException("HTTP $status")

    class Pairing(val code: String, val pollToken: String, val url: String, val qr: List<String>, val expiresInSec: Int)

    sealed class Poll {
        object Pending : Poll()
        object Expired : Poll()
        class Paired(val robotId: String, val token: String, val household: String) : Poll()
    }

    class Command(val id: String, val type: String, val recipeId: String)

    class Meal(val day: String, val slot: String, val leftoverOf: String?, val recipeId: String, val title: String,
               val image: String, val totalMinutes: Int)

    class Today(val today: String, val meals: List<Meal>)

    /** Une page de recettes : JSON de chaque recette (format `Recipe` du cœur), ids supprimés, curseurs. */
    class RecipesPage(val recipes: List<String>, val deleted: List<String>, val next: Long?, val until: Long)

    fun pairStart(): Pairing {
        val o = JSONObject(call("POST", "/api/robot/pair/start", null, ""))
        val qr = o.optJSONArray("qr") ?: JSONArray()
        return Pairing(o.getString("code"), o.getString("pollToken"), o.optString("url"),
            List(qr.length()) { qr.getString(it) }, o.optInt("expiresIn", 900))
    }

    fun pairPoll(pollToken: String): Poll {
        val text = try {
            call("GET", "/api/robot/pair/poll?token=" + URLEncoder.encode(pollToken, "UTF-8"), null, null)
        } catch (e: HttpError) {
            if (e.status == 410 || e.status == 404) return Poll.Expired
            throw e
        }
        val o = JSONObject(text)
        return when (o.optString("status")) {
            "paired" -> Poll.Paired(o.getString("robotId"), o.getString("token"), o.optString("household"))
            "expired" -> Poll.Expired
            else -> Poll.Pending
        }
    }

    fun postState(token: String, body: String): List<Command> {
        val o = JSONObject(call("POST", "/api/robot/state", token, body))
        val list = o.optJSONArray("commands") ?: return emptyList()
        return (0 until list.length()).mapNotNull { i ->
            val c = list.optJSONObject(i) ?: return@mapNotNull null
            Command(c.optString("id"), c.optString("type"), c.optString("recipeId"))
        }
    }

    fun today(token: String): Today {
        val o = JSONObject(call("GET", "/api/robot/today", token, null))
        val meals = o.optJSONArray("meals") ?: JSONArray()
        return Today(o.optString("today"), (0 until meals.length()).mapNotNull { i ->
            val m = meals.optJSONObject(i) ?: return@mapNotNull null
            val r = m.optJSONObject("recipe") ?: return@mapNotNull null
            Meal(m.optString("day"), m.optString("slot"), m.optString("leftoverOf").takeIf { !m.isNull("leftoverOf") && it.isNotBlank() },
                r.optString("id"), r.optString("title"), if (r.isNull("image")) "" else r.optString("image"), r.optInt("totalMinutes"))
        })
    }

    fun recipes(token: String, since: Long, limit: Int = PAGE_SIZE): RecipesPage {
        val o = JSONObject(call("GET", "/api/robot/recipes?since=$since&limit=$limit", token, null, maxBytes = 16 * 1024 * 1024))
        val list = o.optJSONArray("recipes") ?: JSONArray()
        val deleted = o.optJSONArray("deleted") ?: JSONArray()
        return RecipesPage(
            (0 until list.length()).mapNotNull { list.optJSONObject(it)?.toString() },
            (0 until deleted.length()).map { deleted.getString(it) },
            if (o.isNull("next")) null else o.optLong("next"),
            o.optLong("until", since),
        )
    }

    fun favorites(token: String, ids: Collection<String>) {
        call("POST", "/api/robot/favorites", token, JSONObject().put("ids", JSONArray(ids)).toString())
    }

    private fun call(method: String, path: String, token: String?, body: String?, maxBytes: Int = 2 * 1024 * 1024): String {
        val c = URL(baseUrl + path).openConnection() as HttpsURLConnection
        try {
            c.sslSocketFactory = ExtraRoots.socketFactory(context)
            c.connectTimeout = TIMEOUT_MS
            c.readTimeout = if (maxBytes > 2 * 1024 * 1024) 60_000 else TIMEOUT_MS
            c.requestMethod = method
            c.instanceFollowRedirects = false
            c.useCaches = false
            c.setRequestProperty("User-Agent", Http.userAgent)
            c.setRequestProperty("Accept", "application/json")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                val bytes = body.toByteArray(Charsets.UTF_8)
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.setFixedLengthStreamingMode(bytes.size)
                c.outputStream.use { it.write(bytes) }
            }
            val code = c.responseCode
            val stream = (if (code >= 400) c.errorStream else c.inputStream)
            val text = stream?.use { input ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > maxBytes) throw IOException("réponse trop grande")
                }
                String(out.toByteArray(), Charsets.UTF_8)
            } ?: ""
            if (code !in 200..299) throw HttpError(code, text.take(300))
            return text
        } finally {
            c.disconnect()
        }
    }

    companion object {
        const val BASE_URL = "https://claudimix.krikristoophe.workers.dev"
        const val PAGE_SIZE = 200
        private const val TIMEOUT_MS = 15_000
    }
}
