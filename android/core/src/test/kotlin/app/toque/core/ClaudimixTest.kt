package app.toque.core

import app.toque.core.claudimix.Cooking
import app.toque.core.claudimix.QrMatrix
import app.toque.core.claudimix.RecipePage
import app.toque.core.claudimix.RecipePager
import app.toque.core.claudimix.RobotReport
import app.toque.core.json.Json
import app.toque.core.json.obj
import app.toque.core.machine.JobState
import app.toque.core.machine.Snapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ClaudimixTest {
    private val idle = Snapshot(hasSample = true, actualTempC = 24, weightG = 1240, speedLevel = 0)
    private val running = idle.copy(jobActive = true, jobState = JobState.RUNNING.name, remainingMs = 759_200, jobSpeed = 1, jobReverse = true, actualTempC = 98)
    private val cooking = Cooking("web-250008", "Beurre de cacahuètes", 3, 9, "Cuire 12 min à 98 °C", "Ajoutez la crème…", machine = "12 min · 98 °C · vitesse 1")

    @Test fun statuses() {
        assertEquals("idle", RobotReport.status(idle, finished = false))
        assertEquals("finished", RobotReport.status(idle, finished = true))
        assertEquals("running", RobotReport.status(running, finished = true))
        assertEquals("paused", RobotReport.status(running.copy(jobState = JobState.PAUSED.name), finished = false))
        assertEquals("running", RobotReport.status(idle.copy(turboActive = true), finished = false))
        assertEquals("error", RobotReport.status(running.copy(faultCode = "COMM_LOST"), finished = false))
        assertEquals(3_000L, RobotReport.intervalMs("running"))
        assertEquals(60_000L, RobotReport.intervalMs("idle"))
    }

    @Test fun bodyDuringACookingStep() {
        val b = RobotReport.body(running, cooking, null, null)
        assertEquals("running", b["status"])
        assertEquals(mapOf("id" to "web-250008", "title" to "Beurre de cacahuètes"), b["recipe"])
        val step = b["step"].obj()
        assertEquals(4, step["index"])
        assertEquals(9, step["total"])
        assertEquals("Ajoutez la crème…", step["next"])
        assertEquals(760, b["remainingSec"])
        assertEquals(98, b["tempC"])
        assertEquals(1, b["speed"])
        assertEquals(true, b["reverse"])
        assertEquals(1240, b["weightG"])
        assertEquals(true, b["lidClosed"])
        assertNull(b["action"])
        // Le corps s'écrit en JSON et se relit tel quel.
        val back = Json.parse(Json.write(b)).obj()
        assertEquals("running", back["status"])
        assertEquals(760L, back["remainingSec"])
    }

    @Test fun idleBodyHasNoRecipe() {
        val b = RobotReport.body(idle.copy(lidOpen = true), null, null, null)
        assertEquals("idle", b["status"])
        assertNull(b["recipe"])
        assertNull(b["step"])
        assertNull(b["remainingSec"])
        assertEquals(false, b["lidClosed"])
        // Sans mesure de la base : inconnu, pas zéro.
        val none = RobotReport.body(Snapshot(), null, null, null)
        assertNull(none["tempC"])
        assertNull(none["weightG"])
        assertNull(none["lidClosed"])
    }

    @Test fun finishedRecipeKeepsItsTitle() {
        val b = RobotReport.body(idle, null, cooking, null)
        assertEquals("finished", b["status"])
        assertEquals("web-250008", b["recipe"].obj()["id"])
        assertNull(b["step"])
    }

    @Test fun actions() {
        assertNull(RobotReport.action(running, cooking))
        assertNull(RobotReport.action(idle, null))
        assertEquals("Lancez l'étape : 12 min · 98 °C · vitesse 1", RobotReport.action(idle, cooking))
        assertNull(RobotReport.action(idle, cooking.copy(stepDone = true)))
        assertNull(RobotReport.action(idle, cooking.copy(onScreen = false)))
        assertEquals("Pesez 200 g · farine", RobotReport.action(idle, cooking.copy(weighGrams = 200, weighLabel = "farine")))
        assertEquals("Ajoutez la crème", RobotReport.action(idle, cooking.copy(machine = null, text = "Ajoutez la crème")))
        assertEquals("Fermez le couvercle pour reprendre",
            RobotReport.action(running.copy(jobState = JobState.PAUSED.name, lidOpen = true), cooking))
    }

    @Test fun signatureIgnoresTimeTemperatureAndWeight() {
        val a = RobotReport.body(running, cooking, null, null)
        val b = RobotReport.body(running.copy(remainingMs = 10_000, actualTempC = 60, weightG = 3), cooking, null, null)
        assertEquals(RobotReport.signature(a), RobotReport.signature(b))
        val c = RobotReport.body(running.copy(jobState = JobState.PAUSED.name), cooking, null, null)
        assertNotEquals(RobotReport.signature(a), RobotReport.signature(c))
        val d = RobotReport.body(running, cooking.copy(index = 4), null, null)
        assertNotEquals(RobotReport.signature(a), RobotReport.signature(d))
    }

    @Test fun qrMatrix() {
        val rows = List(41) { y -> String(CharArray(41) { x -> if ((x + y) % 2 == 0) '1' else '0' }) }
        val m = QrMatrix.parse(rows)
        assertNotNull(m)
        assertEquals(41, m!!.size)
        assertEquals(true, m[0][0])
        assertEquals(false, m[0][1])
        assertNull(QrMatrix.parse(rows.dropLast(1)))
        assertNull(QrMatrix.parse(List(41) { "2".repeat(41) }))
        assertNull(QrMatrix.parse(emptyList()))
    }

    @Test fun pagerFollowsNextThenKeepsUntil() {
        val asked = ArrayList<Long>()
        val saved = ArrayList<Pair<List<String>, Long>>()
        val pages = mapOf(
            0L to RecipePage(listOf("a", "b"), emptyList(), 100L, 100L),
            100L to RecipePage(listOf("c"), listOf("old"), 200L, 200L),
            200L to RecipePage(listOf("d"), emptyList(), null, 250L),
        )
        val end = RecipePager.run(0L, { since -> asked += since; pages.getValue(since) }) { p, cursor -> saved += p.recipes to cursor }
        assertEquals(listOf(0L, 100L, 200L), asked)
        assertEquals(250L, end)
        assertEquals(listOf(listOf("a", "b") to 100L, listOf("c") to 200L, listOf("d") to 250L), saved)
    }

    @Test fun pagerStopsWhenNothingChanged() {
        val end = RecipePager.run(500L, { RecipePage<String>(emptyList(), emptyList(), null, 500L) }) { _, _ -> }
        assertEquals(500L, end)
        // `next` qui n'avance pas : pas de boucle sans fin.
        var calls = 0
        val stuck = RecipePager.run(500L, { calls++; RecipePage(listOf("x"), emptyList(), 500L, 500L) }) { _, _ -> }
        assertEquals(1, calls)
        assertEquals(500L, stuck)
    }
}
