package app.toque.recipes

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import app.toque.Http
import app.toque.core.i18n.tr
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * Photos des recettes (URL https du CDN Lidl) : téléchargées une fois, réduites pour l'écran du
 * robot (800 px de large au plus) et gardées dans [RecipeRepo.imagesDir] sous le nom de fichier de
 * l'URL, là où [RecipeRepo.imageFile] les retrouve.
 */
object RecipePhotos {
    private const val MAX_WIDTH = 800

    fun fileName(url: String): String = url.substringBefore('?').substringAfterLast('/')

    fun has(repo: RecipeRepo, url: String): Boolean = repo.imageFile(fileName(url)) != null

    /** Télécharge et enregistre la photo ; IOException si elle ne vient pas ou n'est pas une image. */
    fun download(repo: RecipeRepo, url: String) {
        val bytes = Http.bytes(url, timeoutMs = 20_000, maxBytes = 8 * 1024 * 1024, followRedirects = true)
        store(bytes, fileName(url), repo.imagesDir)
    }

    private fun store(bytes: ByteArray, name: String, dir: File) {
        if (name.isBlank()) throw IOException(tr("image illisible"))
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0) throw IOException(tr("image illisible"))
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= MAX_WIDTH) sample *= 2
        var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: throw IOException(tr("image illisible"))
        if (bmp.width > MAX_WIDTH) {
            val scaled = Bitmap.createScaledBitmap(bmp, MAX_WIDTH, bmp.height * MAX_WIDTH / bmp.width, true)
            if (scaled !== bmp) bmp.recycle()
            bmp = scaled
        }
        val tmp = File(dir, "$name.part")
        FileOutputStream(tmp).use { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        bmp.recycle()
        if (!tmp.renameTo(File(dir, name))) tmp.delete()
    }
}
