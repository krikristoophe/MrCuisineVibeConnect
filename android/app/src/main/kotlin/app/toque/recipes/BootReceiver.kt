package app.toque.recipes

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import app.toque.Prefs
import app.toque.machine.MachineService
import app.toque.ui.MainActivity

/** Démarrage du robot : service machine, puis Toque au premier plan. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        c.startService(Intent(c, MachineService::class.java))
        if (Prefs(c).bootLaunch) {
            // Le robot n'a pas de bouton Accueil : Toque s'ouvre tout seul au démarrage, puis repasse
            // devant 20 s plus tard au cas où l'appli d'origine (écran d'accueil) se serait ouverte après lui.
            val open = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            c.startActivity(open)
            val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 20_000,
                PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_UPDATE_CURRENT))
        }
    }
}
