import { Hono } from "hono";
import type { Context } from "hono";
import { DurableObject } from "cloudflare:workers";
import { encode } from "uqr";
import type { AppEnv, Env } from "./env";
import { requireUser } from "./auth";
import { notifyHousehold } from "./push";
import { addDays, humanCode, now, parisDay, randomId, sha256 } from "./util";
import { mealsBetween } from "./week";
import { OUR_DEVICE } from "./recipes";

/** État envoyé par le robot (voir web/API-ROBOT.md). */
export interface RobotState {
  status: "idle" | "running" | "paused" | "finished" | "error";
  recipe?: { id?: string; title: string } | null;
  step?: { index: number; total: number; text: string; next?: string | null } | null;
  remainingSec?: number | null;
  tempC?: number | null;
  speed?: number | null;
  reverse?: boolean | null;
  weightG?: number | null;
  lidClosed?: boolean | null;
  action?: string | null;
  error?: string | null;
}

export interface Command { id: string; type: "open_recipe"; recipeId: string; at: number }

interface Stored { state: RobotState | null; updatedAt: number; commands: Command[]; householdId: string | null }

/** Un objet par robot : dernier état connu, commandes en attente, détection des événements. */
export class RobotHub extends DurableObject<Env> {
  private async load(): Promise<Stored> {
    return (await this.ctx.storage.get<Stored>("s")) ?? { state: null, updatedAt: 0, commands: [], householdId: null };
  }

  async report(householdId: string, robotName: string, state: RobotState): Promise<Command[]> {
    const s = await this.load();
    const prev = s.state;
    const commands = s.commands;
    await this.ctx.storage.put("s", { state, updatedAt: now(), commands: [], householdId } satisfies Stored);

    const title = state.recipe?.title ?? prev?.recipe?.title ?? "La recette";
    if (state.status === "finished" && prev?.status !== "finished") {
      await notifyHousehold(this.env, householdId, "finished", "Cuisson terminée", `${title} est prête.`, "/cuisson");
      if (state.recipe?.id) {
        await this.env.DB.prepare(
          `INSERT INTO cooked (household_id, recipe_id, count, last_at) VALUES (?, ?, 1, ?)
           ON CONFLICT (household_id, recipe_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`
        ).bind(householdId, state.recipe.id, now()).run();
      }
    } else if (state.action && state.action !== prev?.action) {
      await notifyHousehold(this.env, householdId, "action", `${robotName} vous attend`, state.action, "/cuisson");
    }
    return commands;
  }

  async snapshot(): Promise<{ state: RobotState | null; updatedAt: number; online: boolean }> {
    const s = await this.load();
    return { state: s.state, updatedAt: s.updatedAt, online: now() - s.updatedAt < 90_000 };
  }

  async enqueue(cmd: Command): Promise<void> {
    const s = await this.load();
    s.commands = [...s.commands.filter((c) => now() - c.at < 600_000), cmd];
    await this.ctx.storage.put("s", s);
  }
}

function hub(env: Env, robotId: string) {
  return env.ROBOT.get(env.ROBOT.idFromName(robotId)) as unknown as DurableObjectStub<RobotHub>;
}

interface RobotRow { id: string; household_id: string; name: string }

async function robotFromToken(c: Context<AppEnv>): Promise<RobotRow | null> {
  const h = c.req.header("authorization");
  if (!h?.startsWith("Bearer cmr_")) return null;
  const row = await c.env.DB.prepare("SELECT id, household_id, name FROM robots WHERE token_hash = ?").bind(await sha256(h.slice(7))).first<RobotRow>();
  if (row) c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE robots SET last_seen = ? WHERE id = ?").bind(now(), row.id).run());
  return row;
}

/** Routes appelées par le robot. */
export const robotApi = new Hono<AppEnv>();

robotApi.post("/pair/start", async (c) => {
  const code = humanCode(8);
  const pollToken = randomId(24);
  await c.env.DB.prepare("INSERT INTO pairings (code, poll_token, expires_at) VALUES (?, ?, ?)").bind(code, pollToken, now() + 15 * 60_000).run();
  const url = `${new URL(c.req.url).origin}/robot/ajouter?code=${code}`;
  const qr = encode(url, { ecc: "M", border: 2 }).data.map((row: boolean[]) => row.map((x) => (x ? "1" : "0")).join(""));
  return c.json({ code, pollToken, url, qr, expiresIn: 900 });
});

robotApi.get("/pair/poll", async (c) => {
  const row = await c.env.DB.prepare("SELECT code, robot_id, robot_token, household_id, expires_at FROM pairings WHERE poll_token = ?")
    .bind(c.req.query("token") ?? "").first<{ code: string; robot_id: string | null; robot_token: string | null; household_id: string | null; expires_at: number }>();
  if (!row || row.expires_at < now()) return c.json({ status: "expired" }, 410);
  if (!row.robot_token) return c.json({ status: "pending" });
  // Le jeton n'est remis qu'une fois.
  await c.env.DB.prepare("DELETE FROM pairings WHERE code = ?").bind(row.code).run();
  const hh = await c.env.DB.prepare("SELECT name FROM households WHERE id = ?").bind(row.household_id).first<{ name: string }>();
  return c.json({ status: "paired", robotId: row.robot_id, token: row.robot_token, household: hh?.name ?? "" });
});

robotApi.post("/state", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  const state = (await c.req.json()) as RobotState;
  const commands = await hub(c.env, robot.id).report(robot.household_id, robot.name, state);
  return c.json({ commands });
});

/** Repas d'aujourd'hui et de demain, pour l'accueil du robot. */
robotApi.get("/today", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  const today = parisDay();
  const meals = await mealsBetween(c.env, robot.household_id, today, addDays(today, 1));
  return c.json({ today, meals });
});

/** Recettes modifiées depuis `since` (ms), au format du robot, par pages. */
robotApi.get("/recipes", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  const since = Number(c.req.query("since") ?? 0);
  const after = c.req.query("after") ?? ""; // id de la dernière recette reçue à la date `since`
  const limit = Math.min(Number(c.req.query("limit") ?? 200), 500);
  // Seulement les recettes faisables sur ce robot (Connect) ; les autres comptent comme supprimées.
  const device = c.req.query("device") ?? OUR_DEVICE;
  const rows = await c.env.DB.prepare("SELECT id, json, updated_at, deleted, devices FROM recipes WHERE updated_at > ? OR (updated_at = ? AND id > ?) ORDER BY updated_at, id LIMIT ?")
    .bind(since, since, after, limit).all<{ id: string; json: string; updated_at: number; deleted: number; devices: string }>();
  const list = rows.results;
  const ok = (r: { deleted: number; devices: string }) => !r.deleted && (r.devices === "" || r.devices.split(",").includes(device));
  return c.json({
    recipes: list.filter(ok).map((r) => JSON.parse(r.json)),
    deleted: list.filter((r) => !ok(r)).map((r) => r.id),
    next: list.length === limit ? list[list.length - 1].updated_at : null,
    nextAfter: list.length === limit ? list[list.length - 1].id : null,
    until: list.length ? list[list.length - 1].updated_at : since,
  });
});

/** Favoris du robot, envoyés une fois après l'appairage : ajoutés à ceux du foyer. */
robotApi.post("/favorites", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  const { ids } = (await c.req.json()) as { ids: string[] };
  const stmts = (ids ?? []).slice(0, 2000).map((id) =>
    c.env.DB.prepare("INSERT OR IGNORE INTO favorites (household_id, recipe_id, created_at) SELECT ?, id, ? FROM recipes WHERE id = ?").bind(robot.household_id, now(), id));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true, count: stmts.length });
});

/** Favoris du foyer : le robot les affiche sur son accueil et les remplace par cette liste. */
robotApi.get("/favorites", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  const rows = await c.env.DB.prepare("SELECT recipe_id FROM favorites WHERE household_id = ? ORDER BY created_at").bind(robot.household_id).all<{ recipe_id: string }>();
  return c.json({ ids: rows.results.map((r) => r.recipe_id) });
});

/** Étoile touchée sur le robot. */
robotApi.put("/favorites/:id", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  await c.env.DB.prepare("INSERT OR IGNORE INTO favorites (household_id, recipe_id, created_at) SELECT ?, id, ? FROM recipes WHERE id = ?")
    .bind(robot.household_id, now(), c.req.param("id")).run();
  return c.json({ ok: true });
});

robotApi.delete("/favorites/:id", async (c) => {
  const robot = await robotFromToken(c);
  if (!robot) return c.json({ error: "robot inconnu" }, 401);
  await c.env.DB.prepare("DELETE FROM favorites WHERE household_id = ? AND recipe_id = ?").bind(robot.household_id, c.req.param("id")).run();
  return c.json({ ok: true });
});

/** Routes de l'appli (membre connecté). */
export const robotsApp = new Hono<AppEnv>();
robotsApp.use("*", requireUser);

robotsApp.post("/pair/confirm", async (c) => {
  const user = c.get("user");
  const { code, name } = (await c.req.json()) as { code: string; name?: string };
  const clean = (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const row = await c.env.DB.prepare("SELECT code, expires_at, robot_id FROM pairings WHERE code = ?").bind(clean).first<{ code: string; expires_at: number; robot_id: string | null }>();
  if (!row || row.expires_at < now()) return c.json({ error: "Code inconnu ou expiré : affichez un nouveau code sur le robot." }, 404);
  if (row.robot_id) return c.json({ error: "Ce code a déjà servi." }, 409);
  const robotId = randomId();
  const token = "cmr_" + randomId(32);
  const robotName = (name ?? "").trim().slice(0, 40) || "Robot de la cuisine";
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO robots (id, household_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(robotId, user.household_id, robotName, await sha256(token), now()),
    c.env.DB.prepare("UPDATE pairings SET household_id = ?, robot_id = ?, robot_token = ? WHERE code = ?").bind(user.household_id, robotId, token, clean),
  ]);
  return c.json({ ok: true, robotId, name: robotName });
});

robotsApp.get("/", async (c) => {
  const rows = await c.env.DB.prepare("SELECT id, name, last_seen FROM robots WHERE household_id = ? ORDER BY created_at")
    .bind(c.get("user").household_id).all<{ id: string; name: string; last_seen: number | null }>();
  const robots = await Promise.all(rows.results.map(async (r) => ({ ...r, ...(await hub(c.env, r.id).snapshot()) })));
  return c.json({ robots });
});

async function ownRobot(c: Context<AppEnv>): Promise<RobotRow | null> {
  return c.env.DB.prepare("SELECT id, household_id, name FROM robots WHERE id = ? AND household_id = ?")
    .bind(c.req.param("id"), c.get("user").household_id).first<RobotRow>();
}

robotsApp.post("/:id/commands", async (c) => {
  const robot = await ownRobot(c);
  if (!robot) return c.json({ error: "robot introuvable" }, 404);
  const body = (await c.req.json()) as { type: string; recipeId: string };
  if (body.type !== "open_recipe" || !body.recipeId) return c.json({ error: "commande inconnue" }, 400);
  await hub(c.env, robot.id).enqueue({ id: randomId(), type: "open_recipe", recipeId: body.recipeId, at: now() });
  return c.json({ ok: true });
});

robotsApp.patch("/:id", async (c) => {
  const robot = await ownRobot(c);
  if (!robot) return c.json({ error: "robot introuvable" }, 404);
  const { name } = (await c.req.json()) as { name: string };
  await c.env.DB.prepare("UPDATE robots SET name = ? WHERE id = ?").bind((name ?? "").trim().slice(0, 40) || robot.name, robot.id).run();
  return c.json({ ok: true });
});

robotsApp.delete("/:id", async (c) => {
  const robot = await ownRobot(c);
  if (!robot) return c.json({ error: "robot introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM robots WHERE id = ?").bind(robot.id).run();
  return c.json({ ok: true });
});
