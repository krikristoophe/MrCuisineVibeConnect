import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { addDays, fold, mondayOf, now, parisDay } from "./util";
import type { RecipeJson } from "./recipes";

export type Slot = "midi" | "soir";

export interface Meal {
  day: string;
  slot: Slot;
  leftoverOf: string | null;
  keepNext: boolean;
  recipe: { id: string; title: string; image: string | null; totalMinutes: number; usesRobot: boolean; category: string };
}

/** Créneau suivant : midi → soir du même jour, soir → midi du lendemain. */
export function nextSlot(day: string, slot: Slot): { day: string; slot: Slot } {
  return slot === "midi" ? { day, slot: "soir" } : { day: addDays(day, 1), slot: "midi" };
}

export async function mealsBetween(env: Env, householdId: string, from: string, to: string): Promise<Meal[]> {
  const rows = await env.DB.prepare(
    `SELECT m.day, m.slot, m.leftover_of, r.id, r.title, r.image, r.total_minutes, r.uses_robot, r.category
     FROM meals m JOIN recipes r ON r.id = m.recipe_id
     WHERE m.household_id = ? AND m.day BETWEEN ? AND ? ORDER BY m.day, CASE m.slot WHEN 'midi' THEN 0 ELSE 1 END`
  ).bind(householdId, from, addDays(to, 1)).all<{ day: string; slot: Slot; leftover_of: string | null; id: string; title: string; image: string | null; total_minutes: number; uses_robot: number; category: string }>();
  const leftovers = new Set(rows.results.filter((r) => r.leftover_of).map((r) => r.leftover_of));
  return rows.results
    .filter((r) => r.day <= to)
    .map((r) => ({
      day: r.day, slot: r.slot, leftoverOf: r.leftover_of, keepNext: leftovers.has(`${r.day}:${r.slot}`),
      recipe: { id: r.id, title: r.title, image: r.image, totalMinutes: r.total_minutes, usesRobot: !!r.uses_robot, category: r.category },
    }));
}

export async function householdTimes(env: Env, householdId: string): Promise<{ midi: string; soir: string }> {
  const h = await env.DB.prepare("SELECT lunch_time, dinner_time FROM households WHERE id = ?").bind(householdId).first<{ lunch_time: string; dinner_time: string }>();
  return { midi: h?.lunch_time ?? "12:30", soir: h?.dinner_time ?? "19:30" };
}

/** Heure limite pour lancer la recette et être prêt à l'heure du repas. */
export function startBy(mealTime: string, minutes: number): string | null {
  if (!minutes) return null;
  const [h, m] = mealTime.split(":").map(Number);
  let t = h * 60 + m - minutes;
  if (t < 0) t += 24 * 60;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export const weekApi = new Hono<AppEnv>();
// Connexion vérifiée par worker.ts (monté sur /api).

weekApi.get("/week", async (c) => {
  const start = mondayOf(c.req.query("start") ?? parisDay());
  const hh = c.get("user").household_id;
  const meals = await mealsBetween(c.env, hh, start, addDays(start, 6));
  return c.json({ start, today: parisDay(), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)), meals, times: await householdTimes(c.env, hh) });
});

weekApi.put("/meals/:day/:slot", async (c) => {
  const { day, slot } = c.req.param() as { day: string; slot: Slot };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !["midi", "soir"].includes(slot)) return c.json({ error: "créneau invalide" }, 400);
  const { recipeId } = (await c.req.json()) as { recipeId: string };
  const hh = c.get("user").household_id;
  const exists = await c.env.DB.prepare("SELECT 1 FROM recipes WHERE id = ? AND deleted = 0").bind(recipeId).first();
  if (!exists) return c.json({ error: "recette introuvable" }, 404);
  await clearLeftoverOf(c.env, hh, day, slot);
  await c.env.DB.prepare(
    `INSERT INTO meals (household_id, day, slot, recipe_id, leftover_of, updated_at) VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT (household_id, day, slot) DO UPDATE SET recipe_id = excluded.recipe_id, leftover_of = NULL, updated_at = excluded.updated_at`
  ).bind(hh, day, slot, recipeId, now()).run();
  return c.json({ ok: true });
});

weekApi.delete("/meals/:day/:slot", async (c) => {
  const { day, slot } = c.req.param() as { day: string; slot: Slot };
  const hh = c.get("user").household_id;
  await clearLeftoverOf(c.env, hh, day, slot);
  await c.env.DB.prepare("DELETE FROM meals WHERE household_id = ? AND day = ? AND slot = ?").bind(hh, day, slot).run();
  return c.json({ ok: true });
});

/** « Aussi pour le repas suivant (restes) » : remplit ou libère le créneau suivant. */
weekApi.post("/meals/:day/:slot/keep", async (c) => {
  const { day, slot } = c.req.param() as { day: string; slot: Slot };
  const { on } = (await c.req.json()) as { on: boolean };
  const hh = c.get("user").household_id;
  const meal = await c.env.DB.prepare("SELECT recipe_id FROM meals WHERE household_id = ? AND day = ? AND slot = ?").bind(hh, day, slot).first<{ recipe_id: string }>();
  if (!meal) return c.json({ error: "pas de repas sur ce créneau" }, 404);
  const to = nextSlot(day, slot);
  const key = `${day}:${slot}`;
  if (!on) {
    await clearLeftoverOf(c.env, hh, day, slot);
    return c.json({ ok: true });
  }
  const target = await c.env.DB.prepare("SELECT leftover_of FROM meals WHERE household_id = ? AND day = ? AND slot = ?").bind(hh, to.day, to.slot).first<{ leftover_of: string | null }>();
  if (target && target.leftover_of !== key) return c.json({ error: "Le repas suivant est déjà prévu : retirez-le d'abord." }, 409);
  await c.env.DB.prepare(
    `INSERT INTO meals (household_id, day, slot, recipe_id, leftover_of, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (household_id, day, slot) DO UPDATE SET recipe_id = excluded.recipe_id, leftover_of = excluded.leftover_of, updated_at = excluded.updated_at`
  ).bind(hh, to.day, to.slot, meal.recipe_id, key, now()).run();
  return c.json({ ok: true });
});

async function clearLeftoverOf(env: Env, hh: string, day: string, slot: Slot) {
  await env.DB.prepare("DELETE FROM meals WHERE household_id = ? AND leftover_of = ?").bind(hh, `${day}:${slot}`).run();
}

/** Liste de courses : ingrédients des repas à cuisiner (pas les restes) d'aujourd'hui à dimanche. */
weekApi.get("/shopping", async (c) => {
  const hh = c.get("user").household_id;
  const today = parisDay();
  const start = mondayOf(c.req.query("start") ?? today);
  const from = start > today ? start : today;
  const to = addDays(start, 6);
  const rows = await c.env.DB.prepare(
    `SELECT r.json, m.day, m.slot FROM meals m JOIN recipes r ON r.id = m.recipe_id
     WHERE m.household_id = ? AND m.day BETWEEN ? AND ? AND m.leftover_of IS NULL`
  ).bind(hh, from, to).all<{ json: string; day: string; slot: Slot }>();
  const items = new Map<string, { name: string; amounts: Map<string, number>; texts: string[]; recipes: Set<string> }>();
  for (const row of rows.results) {
    const r = JSON.parse(row.json) as RecipeJson;
    for (const g of r.ingredients ?? []) for (const i of g.items) {
      const key = fold(i.name).replace(/,.*$/, "").trim();
      if (!key) continue;
      const it = items.get(key) ?? { name: i.name.replace(/,.*$/, "").trim(), amounts: new Map(), texts: [] as string[], recipes: new Set<string>() };
      const q = Number((i.qty ?? "").replace(",", "."));
      if (i.qty && !Number.isNaN(q)) it.amounts.set(i.unit ?? "", (it.amounts.get(i.unit ?? "") ?? 0) + q);
      else if (i.qty) it.texts.push(`${i.qty} ${i.unit ?? ""}`.trim());
      it.recipes.add(r.title);
      items.set(key, it);
    }
  }
  const checks = await c.env.DB.prepare("SELECT item FROM shopping_checks WHERE household_id = ? AND week = ?").bind(hh, start).all<{ item: string }>();
  const checked = new Set(checks.results.map((r) => r.item));
  const list = [...items.entries()].map(([key, it]) => ({
    key, name: it.name,
    quantity: [...[...it.amounts].map(([u, q]) => `${Math.round(q * 100) / 100}${u ? " " + u : ""}`), ...it.texts].join(" + "),
    recipes: [...it.recipes], checked: checked.has(key),
  })).sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name, "fr"));
  return c.json({ week: start, from, to, items: list });
});

weekApi.post("/shopping/check", async (c) => {
  const { week, item, checked } = (await c.req.json()) as { week: string; item: string; checked: boolean };
  const hh = c.get("user").household_id;
  if (checked) await c.env.DB.prepare("INSERT OR IGNORE INTO shopping_checks (household_id, week, item) VALUES (?, ?, ?)").bind(hh, week, item).run();
  else await c.env.DB.prepare("DELETE FROM shopping_checks WHERE household_id = ? AND week = ? AND item = ?").bind(hh, week, item).run();
  return c.json({ ok: true });
});
