package app.toque.core

import app.toque.core.recipes.McOnline
import app.toque.core.recipes.RecipeCodec
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Outil (pas un vrai test) : exporte tout le catalogue monsieur-cuisine.com (recettes officielles de
 * tous les robots et recettes de la communauté) au format des recettes du robot, une par ligne,
 * pour initialiser la base Claudimix. Ne fait rien sans CMX_EXPORT.
 *
 *   CMX_EXPORT=/chemin/sortie.jsonl [CMX_SKIP=/chemin/ids-deja-importes.txt] ./gradlew :core:test --tests '*CatalogExport*'
 */
class CatalogExport {
    private fun get(url: String, language: String): String {
        repeat(4) { attempt ->
            val c = URL(url).openConnection() as HttpURLConnection
            try {
                c.connectTimeout = 20_000; c.readTimeout = 30_000
                c.setRequestProperty("User-Agent", "Claudimix/1.0 (catalogue import)")
                for ((k, v) in McOnline.headers(language)) c.setRequestProperty(k, v)
                if (c.responseCode == 429 || c.responseCode >= 500) { Thread.sleep(5_000L * (attempt + 1)); return@repeat }
                return c.inputStream.readBytes().toString(Charsets.UTF_8)
            } finally { c.disconnect() }
        }
        error("échec : $url")
    }

    @Test
    fun export() {
        val out = System.getenv("CMX_EXPORT")
        assumeTrue(out != null)
        val language = "fr-FR"
        val skip = System.getenv("CMX_SKIP")?.let { File(it).readLines().map { l -> l.trim() }.toHashSet() } ?: hashSetOf()
        val entries = ArrayList<McOnline.Entry>()
        var page = 1
        while (true) {
            val p = McOnline.parsePage(get("${McOnline.API}/api/v2/recipes/page/$page/size/${McOnline.PAGE_SIZE}", language))
            entries += p.entries
            if (page >= p.totalPages || p.entries.isEmpty()) break
            page++
            Thread.sleep(300)
        }
        val todo = entries.distinctBy { it.apiId }.filter { McOnline.toqueId(it.apiId) !in skip }
        println("catalogue : ${entries.size} entrées, ${todo.size} à exporter")
        File(out!!).bufferedWriter().use { w ->
            todo.forEachIndexed { i, e ->
                try {
                    val r = McOnline.parseRecipe(get(McOnline.recipeUrl(e.apiId), language))
                    if (r != null) { w.write(RecipeCodec.encode(r)); w.newLine() }
                } catch (ex: Exception) {
                    println("recette ${e.apiId} : ${ex.message}")
                }
                if (i % 100 == 0) { w.flush(); println("$i / ${todo.size}") }
                Thread.sleep(250)
            }
        }
    }
}
