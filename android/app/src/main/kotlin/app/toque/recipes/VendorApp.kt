package app.toque.recipes

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import app.toque.Logbook
import app.toque.Prefs
import app.toque.core.machine.RootShell

/**
 * L'appli d'origine du robot : Toque coupe son service matériel pour qu'elle ne touche jamais au
 * port série du moteur, et le rétablit le temps qu'on l'ouvre. Les recettes, elles, ne viennent
 * plus que de Claudimix (voir [app.toque.claudimix.Claudimix]).
 */
class VendorApp(private val context: Context, private val prefs: Prefs, private val log: Logbook) {
    val pkg: String get() = prefs.vendorPackage

    class Components(val hardwareService: String?, val launch: Intent?)

    fun installed(): Boolean = try {
        context.packageManager.getPackageInfo(pkg, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    fun components(): Components {
        val pm = context.packageManager
        val info = try {
            pm.getPackageInfo(pkg, PackageManager.GET_SERVICES or PackageManager.GET_DISABLED_COMPONENTS)
        } catch (_: PackageManager.NameNotFoundException) {
            return Components(null, null)
        }
        val services = info.services?.map { it.name } ?: emptyList()
        return Components(
            hardwareService = services.firstOrNull { it.endsWith(prefs.robot.vendorHardwareService) },
            launch = pm.getLaunchIntentForPackage(pkg),
        )
    }

    private fun su(cmd: String, timeoutMs: Long = 15_000): RootShell.Result {
        val r = RootShell.run(cmd, timeoutMs)
        log.write("appli d'origine", "su: ${cmd.take(120)} -> ${r.code} ${r.err.take(200)}")
        return r
    }

    /** Coupe (ou rétablit) l'accès de l'appli d'origine au moteur. */
    fun setVendorHardware(enabled: Boolean): Boolean {
        val c = components().hardwareService ?: return false
        return su("pm ${if (enabled) "enable" else "disable"} $pkg/$c").ok
    }

    fun forceStop() {
        su("am force-stop $pkg")
    }
}
