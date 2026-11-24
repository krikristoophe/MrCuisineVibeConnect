package app.toque.core.recipes

import app.toque.core.i18n.tr

/**
 * Rinçage du bol, propre à Toque : un mode court (≈ 3 min 30) à la place de la recette Lidl de
 * 19 étapes. Lavage à l'eau savonneuse tiède (50 °C, sous le seuil « contenu chaud »), puis
 * rinçage à l'eau claire pour ne pas laisser de goût de savon.
 *
 * Les étapes sans texte s'enchaînent à la précédente (voir CookScreen) ; celles qui demandent un
 * geste (vider le bol, verser l'eau) ont un texte et attendent un appui sur Lancer.
 */
object Rinse {
    const val ID = "toque-rinse"

    fun recipe(): Recipe = Recipe(
        id = ID,
        title = tr("Rinçage du bol"),
        totalMinutes = 4,
        steps = listOf(
            Step(tr("Videz le bol. Versez 1 L d'eau chaude du robinet et une goutte de liquide vaisselle, puis fermez le couvercle."),
                StepMachine(seconds = 120, speed = 2, tempC = 50)),
            Step("", StepMachine(seconds = 10, speed = 7)),
            Step("", StepMachine(seconds = 20, speed = 10)),
            Step(tr("Videz l'eau savonneuse. Versez 1 L d'eau claire, puis fermez le couvercle."),
                StepMachine(seconds = 10, speed = 7)),
            Step("", StepMachine(seconds = 20, speed = 10)),
            Step(tr("Videz le bol et laissez-le sécher, couvercle ouvert. C'est propre !")),
        ),
        source = RecipeSource.IMPORTED,
    )
}
