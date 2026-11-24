package app.toque

import android.content.Context
import android.content.SharedPreferences
import app.toque.core.i18n.I18n
import app.toque.core.i18n.tr
import app.toque.core.i18n.trKey
import app.toque.core.robot.RobotProfile
import app.toque.core.robot.RobotProfiles

/**
 * Réglages persistants, lisibles par les deux processus (interface et machine).
 * Écriture synchrone (commit) : le processus machine relit le fichier juste après.
 */
class Prefs(context: Context) {
    @Suppress("DEPRECATION")
    private val p: SharedPreferences = context.getSharedPreferences("toque", Context.MODE_MULTI_PROCESS)

    enum class Mode(val key: String, private val fr: String) {
        DEMO("demo", trKey("Démo (base simulée)")),
        TWIN("twin", trKey("Jumeau numérique (PC)")),
        HARDWARE("hardware", trKey("Machine réelle"));

        val label: String get() = tr(fr)

        companion object {
            fun of(k: String?) = values().firstOrNull { it.key == k } ?: HARDWARE
        }
    }

    var mode: Mode
        get() = Mode.of(p.getString("mode", null))
        set(v) {
            p.edit().putString("mode", v.key).commit()
        }

    /** Langue de l'interface : « auto » (celle du système), « fr » ou « en ». */
    var language: String
        get() = p.getString("language", I18n.AUTO) ?: I18n.AUTO
        set(v) {
            p.edit().putString("language", v).commit()
        }

    /** Couleur d'accent : toujours l'orange d'origine (Ui.ACCENTS[0]), plus de choix dans les réglages. */
    val accentColor: Int get() = 0

    var twinHost: String
        get() = p.getString("twinHost", "127.0.0.1") ?: "127.0.0.1"
        set(v) {
            p.edit().putString("twinHost", v).commit()
        }

    var twinPort: Int
        get() = p.getInt("twinPort", 8765)
        set(v) {
            p.edit().putInt("twinPort", v).commit()
        }

    /**
     * Robot confirmé par la personne (identifiant de [RobotProfiles]) ; vide tant qu'elle ne l'a pas
     * confirmé : la liaison avec la base reste alors fermée en « Machine réelle ».
     */
    var robotId: String
        get() = p.getString("robotId", "") ?: ""
        set(v) {
            p.edit().putString("robotId", v).commit()
        }

    val robotConfirmed: Boolean get() = RobotProfiles.byId(robotId) != null

    /** Fiche du robot choisi (le Connect tant que rien n'est confirmé, comme avant les fiches). */
    val robot: RobotProfile get() = RobotProfiles.byId(robotId) ?: RobotProfiles.MC_CONNECT

    /** Port série : réglage manuel sur le Connect (ancien réglage), sinon celui de la fiche. */
    var serialDevice: String
        get() = (if (robot === RobotProfiles.MC_CONNECT) p.getString("serialDevice", null) else null) ?: robot.serialDevice
        set(v) {
            p.edit().putString("serialDevice", v).commit()
        }

    /** Appli d'origine : réglage manuel sur le Connect (ancien réglage), sinon celle de la fiche. */
    var vendorPackage: String
        get() = (if (robot === RobotProfiles.MC_CONNECT) p.getString("vendorPackage", null) else null) ?: robot.vendorPackage
        set(v) {
            p.edit().putString("vendorPackage", v).commit()
        }

    // Réglages de sécurité, de balance et de son figés (plus de section « Sécurité » dans les
    // réglages) : les valeurs sont celles choisies sur le robot le 24/11/2026.

    val requireBowl: Boolean get() = false

    /** Capteur du bol lu à l'envers (bases qui signalent « bol » quand il est retiré). */
    val invertBowl: Boolean get() = true

    /** Montée progressive de la vitesse quand le contenu est chaud (≥ 60 °C). */
    val hotRamp: Boolean get() = true

    /** Recettes : tare automatique en arrivant sur une étape de pesée. */
    val autoTareSteps: Boolean get() = true

    /** Balance remise à zéro quand le bol vide est replacé sur le socle. */
    val bowlAutoZero: Boolean get() = true

    /** Masse du bol vide apprise (g), 0 = inconnue. */
    var emptyBowlG: Int
        get() = p.getInt("emptyBowlG", 0)
        set(v) {
            p.edit().putInt("emptyBowlG", v).commit()
        }

    /** Recettes : enchaîner sans appui les étapes machine qui se suivent sans geste à faire. */
    val chainSteps: Boolean get() = true

    val sound: Boolean get() = true

    /** Mise en veille de l'écran après ce nombre de minutes sans geste (0 : jamais). */
    var standbyMinutes: Int
        get() = p.getInt("standbyMinutes", 10)
        set(v) {
            p.edit().putInt("standbyMinutes", v).commit()
        }

    /**
     * Molette pendant la veille : « normal » (inchangée), « dim » (veilleuse blanche faible) ou
     * « off » (éteinte). Reprend l'ancien interrupteur « standbyKnobLight » s'il a été réglé.
     */
    var standbyKnob: String
        get() = p.getString("standbyKnob", null)
            ?: if (p.getBoolean("standbyKnobLight", true)) "dim" else "normal"
        set(v) {
            p.edit().putString("standbyKnob", v).commit()
        }

    /** Fuseau horaire : « auto » (d'après la connexion Internet) ou un identifiant IANA choisi à la main. */
    var timeZone: String
        get() = p.getString("timeZone", "auto") ?: "auto"
        set(v) {
            p.edit().putString("timeZone", v).commit()
        }

    /** Dernier fuseau appliqué avec succès (affiché dans les réglages). */
    var lastZone: String
        get() = p.getString("lastZone", "") ?: ""
        set(v) {
            p.edit().putString("lastZone", v).commit()
        }

    var vendorSession: Boolean
        get() = p.getBoolean("vendorSession", false)
        set(v) {
            p.edit().putBoolean("vendorSession", v).commit()
        }

    /** Bouton « Retour à Toque » à afficher : Toque a ouvert une autre appli (robot sans bouton Accueil). */
    var returnBubble: Boolean
        get() = p.getBoolean("returnBubble", false)
        set(v) {
            p.edit().putBoolean("returnBubble", v).commit()
        }

    /** Ouvrir Toque au démarrage du robot (désactivé par « Revenir à l'appli d'origine »). */
    var bootLaunch: Boolean
        get() = p.getBoolean("bootLaunch", true)
        set(v) {
            p.edit().putBoolean("bootLaunch", v).commit()
        }

    var knobLeft: Int
        get() = p.getInt("knobLeft", -1)
        set(v) {
            p.edit().putInt("knobLeft", v).commit()
        }

    var knobRight: Int
        get() = p.getInt("knobRight", -1)
        set(v) {
            p.edit().putInt("knobRight", v).commit()
        }

    var knobPress: Int
        get() = p.getInt("knobPress", -1)
        set(v) {
            p.edit().putInt("knobPress", v).commit()
        }

    /** Vrai une fois le bouton rotatif réglé, vu en marche, ou déclaré absent de l'appareil. */
    var knobSetupDone: Boolean
        get() = p.getBoolean("knobSetupDone", false)
        set(v) {
            p.edit().putBoolean("knobSetupDone", v).commit()
        }

    /** Le réglage guidé n'est proposé d'office qu'une fois ; ensuite, l'accueil le rappelle. */
    var knobSetupShown: Boolean
        get() = p.getBoolean("knobSetupShown", false)
        set(v) {
            p.edit().putBoolean("knobSetupShown", v).commit()
        }

    /** Faux tant que rien ne dit que le bouton rotatif fonctionne : l'accueil affiche alors un rappel. */
    val knobReady: Boolean get() = knobSetupDone || knobLeft >= 0 || knobRight >= 0 || knobPress >= 0

    var lastCrashMs: Long
        get() = p.getLong("lastCrashMs", 0)
        set(v) {
            p.edit().putLong("lastCrashMs", v).commit()
        }

    var welcomeDone: Boolean
        get() = p.getBoolean("welcomeDone", false)
        set(v) {
            p.edit().putBoolean("welcomeDone", v).commit()
        }

    var builtinVersion: Int
        get() = p.getInt("builtinVersion", 0)
        set(v) {
            p.edit().putInt("builtinVersion", v).commit()
        }

    /** Recette guidée en cours (id + étape), pour reprendre après un redémarrage. */
    var guidedRecipe: String
        get() = p.getString("guidedRecipe", "") ?: ""
        set(v) {
            p.edit().putString("guidedRecipe", v).commit()
        }

    var guidedStep: Int
        get() = p.getInt("guidedStep", 0)
        set(v) {
            p.edit().putInt("guidedStep", v).commit()
        }

    /** Réglages importés déjà vérifiés (« J'ai vérifié ce réglage »), clé = recette, étape et réglage. */
    var reviewedSteps: Set<String>
        get() = HashSet(p.getStringSet("reviewedSteps", emptySet()) ?: emptySet())
        set(v) {
            p.edit().putStringSet("reviewedSteps", HashSet(v)).commit()
        }

    /** Son joué quand la quantité à peser est atteinte (voir Sounds.WEIGH_SOUNDS). */
    val weighSound: String get() = "gong"
    /** Prévenir quand une nouvelle version de Toque est publiée (au démarrage et au réveil). */
    // Désactivé dans ce fork : les versions du dépôt d'origine écraseraient ses modifications.
    // Faux = aucune recherche sur GitHub, ni au démarrage ni au réveil, et aucune alerte.
    val updateAlerts: Boolean get() = false

    var lastUpdateCheckMs: Long
        get() = p.getLong("lastUpdateCheckMs", 0)
        set(v) {
            p.edit().putLong("lastUpdateCheckMs", v).commit()
        }

    /** Dernière version proposée par l'alerte, et quand (« Plus tard » ne la repropose pas tout de suite). */
    var updateAskedVersion: String
        get() = p.getString("updateAskedVersion", "") ?: ""
        set(v) {
            p.edit().putString("updateAskedVersion", v).commit()
        }

    var updateAskedMs: Long
        get() = p.getLong("updateAskedMs", 0)
        set(v) {
            p.edit().putLong("updateAskedMs", v).commit()
        }

    // ------------------------------------------------------------------ toqueapp.org

    /** Clé de ce robot sur toqueapp.org (vide : pas relié à un compte). Jamais affichée. */
    var siteToken: String
        get() = p.getString("siteToken", "") ?: ""
        set(v) {
            p.edit().putString("siteToken", v).commit()
        }

    /** Pseudo du compte Toque relié. */
    var siteUser: String
        get() = p.getString("siteUser", "") ?: ""
        set(v) {
            p.edit().putString("siteUser", v).commit()
        }

    val siteLinked: Boolean get() = siteToken.isNotBlank()

    /** Proposition de relier un compte Toque déjà faite (une seule fois, acceptée ou non). */
    var siteOffered: Boolean
        get() = p.getBoolean("siteOffered", false)
        set(v) {
            p.edit().putBoolean("siteOffered", v).commit()
        }

    /** Recevoir les recettes de la communauté (sans compte), avec la synchro. */
    var siteCommunity: Boolean
        get() = p.getBoolean("siteCommunity", true)
        set(v) {
            p.edit().putBoolean("siteCommunity", v).commit()
        }

    /** Date (ISO, celle du site) de la recette la plus récente reçue ; vide : tout redemander. */
    var siteSince: String
        get() = p.getString("siteSince", "") ?: ""
        set(v) {
            p.edit().putString("siteSince", v).commit()
        }

    /** Langue des traductions demandée lors de la dernière synchro (autre langue : tout redemander). */
    var siteLang: String
        get() = p.getString("siteLang", "") ?: ""
        set(v) {
            p.edit().putString("siteLang", v).commit()
        }

    /**
     * Version de ce que l'appli garde des recettes du site : plus petite que SiteAccount.FORMAT, la
     * prochaine synchro redemande toutes les recettes une fois (ex. pour recevoir leurs photos).
     */
    var siteFormat: Int
        get() = p.getInt("siteFormat", 0)
        set(v) {
            p.edit().putInt("siteFormat", v).commit()
        }

    /** Dernière liste complète (recettes retirées du site enlevées), en ms. */
    var siteFullMs: Long
        get() = p.getLong("siteFullMs", 0)
        set(v) {
            p.edit().putLong("siteFullMs", v).commit()
        }

    var siteLastMs: Long
        get() = p.getLong("siteLastMs", 0)
        set(v) {
            p.edit().putLong("siteLastMs", v).commit()
        }

    /** Résultat de la dernière synchro avec toqueapp.org, écrit dans la langue d'alors (siteLastLang). */
    var siteLastResult: String
        get() = p.getString("siteLastResult", "") ?: ""
        set(v) {
            p.edit().putString("siteLastResult", v).putString("siteLastLang", I18n.code).commit()
        }

    val siteLastLang: String get() = p.getString("siteLastLang", "") ?: ""

    /** Favoris changés ici, pas encore envoyés au site : « toqueapp-12=1 », « toqueapp-7=0 ». */
    var sitePendingFavorites: Map<String, Boolean>
        get() = (p.getString("sitePendingFavorites", "") ?: "").split('\n').mapNotNull { line ->
            val k = line.substringBefore('=', "")
            if (k.isEmpty()) null else k to (line.substringAfter('=') == "1")
        }.toMap()
        set(v) {
            p.edit().putString("sitePendingFavorites", v.entries.joinToString("\n") { "${it.key}=${if (it.value) 1 else 0}" }).commit()
        }

    /** Recettes perso mises sur le site : identifiant perso → numéro sur le site. */
    var siteLinks: Map<String, Long>
        get() = (p.getString("siteLinks", "") ?: "").split('\n').mapNotNull { line ->
            val id = line.substringAfter('=', "").toLongOrNull() ?: return@mapNotNull null
            line.substringBefore('=') to id
        }.toMap()
        set(v) {
            p.edit().putString("siteLinks", v.entries.joinToString("\n") { "${it.key}=${it.value}" }).commit()
        }

    /** Recettes perso publiées pour tous (les autres de [siteLinks] sont privées, sur le compte seulement). */
    var sitePublic: Set<String>
        get() = p.getStringSet("sitePublic", emptySet())?.toSet() ?: emptySet()
        set(v) {
            p.edit().putStringSet("sitePublic", HashSet(v)).commit()
        }

    /** Recettes perso pour lesquelles on a répondu « Garder pour moi » : ne plus demander. */
    var siteKeepLocal: Set<String>
        get() = p.getStringSet("siteKeepLocal", emptySet())?.toSet() ?: emptySet()
        set(v) {
            p.edit().putStringSet("siteKeepLocal", HashSet(v)).commit()
        }

    /** Oublie le compte relié (les recettes reçues restent). */
    fun forgetSite() {
        p.edit().remove("siteToken").remove("siteUser").remove("sitePendingFavorites").commit()
    }

    // ------------------------------------------------------------------ Claudimix

    /** Jeton de ce robot sur Claudimix (« cmr_… », vide : pas relié). Jamais affiché ni journalisé. */
    var claudimixToken: String
        get() = p.getString("claudimixToken", "") ?: ""
        set(v) {
            p.edit().putString("claudimixToken", v).commit()
        }

    val claudimixLinked: Boolean get() = claudimixToken.isNotBlank()

    var claudimixRobotId: String
        get() = p.getString("claudimixRobotId", "") ?: ""
        set(v) {
            p.edit().putString("claudimixRobotId", v).commit()
        }

    /** Nom du foyer auquel le robot est relié. */
    var claudimixHousehold: String
        get() = p.getString("claudimixHousehold", "") ?: ""
        set(v) {
            p.edit().putString("claudimixHousehold", v).commit()
        }

    /** Curseur de la synchro des recettes (ms, `until` de la dernière page reçue) ; 0 : tout redemander. */
    var claudimixSince: Long
        get() = p.getLong("claudimixSince", 0)
        set(v) {
            p.edit().putLong("claudimixSince", v).commit()
        }

    /** Favoris locaux déjà envoyés au foyer (une fois, après l'appairage). */
    var claudimixFavoritesSent: Boolean
        get() = p.getBoolean("claudimixFavoritesSent", false)
        set(v) {
            p.edit().putBoolean("claudimixFavoritesSent", v).commit()
        }

    /** Fin de la dernière synchro des recettes réussie (ms). */
    var claudimixSyncMs: Long
        get() = p.getLong("claudimixSyncMs", 0)
        set(v) {
            p.edit().putLong("claudimixSyncMs", v).commit()
        }

    /** Relie le robot (réponse « paired » de pair/poll) : la synchro des recettes repart du début. */
    fun linkClaudimix(token: String, robotId: String, household: String) {
        p.edit().putString("claudimixToken", token).putString("claudimixRobotId", robotId)
            .putString("claudimixHousehold", household).putLong("claudimixSince", 0)
            .putBoolean("claudimixFavoritesSent", false).commit()
    }

    /** Oublie le foyer (Dissocier, ou robot retiré du foyer). Les recettes reçues restent. */
    fun forgetClaudimix() {
        p.edit().remove("claudimixToken").remove("claudimixRobotId").remove("claudimixHousehold")
            .remove("claudimixFavoritesSent").commit()
    }
}
