import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { requireUser } from "./auth";
import { fold, now, randomId } from "./util";

/** Recette au format du robot (android/core/.../recipes). Seuls les champs utilisés ici sont typés. */
export interface RecipeJson {
  id: string;
  title: string;
  category?: string;
  tags?: string[];
  servings?: number;
  servingUnit?: string;
  prepMinutes?: number;
  totalMinutes?: number;
  image?: string | null;
  rating?: number;
  ratingCount?: number;
  notes?: string;
  ingredients?: { group?: string; items: { qty?: string; unit?: string; name: string; note?: string }[] }[];
  steps?: { text: string; machine?: { seconds?: number; speed?: number; tempC?: number; reverse?: boolean; program?: string } }[];
  [k: string]: unknown;
}

export interface RecipeSummary {
  id: string; title: string; image: string | null; totalMinutes: number; rating: number; ratingCount: number; category: string; usesRobot: boolean; devices: string[];
}

const SUMMARY_COLS = "id, title, image, total_minutes, rating, rating_count, category, uses_robot, devices";
export function summary(r: { id: string; title: string; image: string | null; total_minutes: number; rating: number; rating_count: number; category: string; uses_robot: number; devices: string }): RecipeSummary {
  return { id: r.id, title: r.title, image: r.image, totalMinutes: r.total_minutes, rating: r.rating, ratingCount: r.rating_count, category: r.category, usesRobot: !!r.uses_robot, devices: r.devices ? r.devices.split(",") : [] };
}

export function searchText(r: RecipeJson): string {
  const ing = (r.ingredients ?? []).flatMap((g) => g.items.map((i) => i.name)).join(" ");
  return fold([r.title, r.category ?? "", (r.tags ?? []).join(" "), ing].join(" "));
}

/** Robot de la maison : Monsieur Cuisine Connect. */
export const OUR_DEVICE = "MC2.0";

export function devices(r: RecipeJson): string[] {
  return Array.isArray(r.devices) ? (r.devices as string[]) : [];
}

/** Recette faisable au robot : des étapes avec réglages, et compatible avec le Connect. */
export function usesRobot(r: RecipeJson): boolean {
  const d = devices(r);
  return (r.steps ?? []).some((s) => !!s.machine) && (d.length === 0 || d.includes(OUR_DEVICE));
}

/** Écrit une recette (création ou modification) avec ses colonnes de recherche. */
export async function saveRecipe(env: Env, r: RecipeJson): Promise<void> {
  if (!r.id || !r.title) throw new Error("id et title obligatoires");
  await env.DB.prepare(
    `INSERT INTO recipes (id, title, search, category, image, total_minutes, rating, rating_count, uses_robot, devices, json, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, search = excluded.search, category = excluded.category, image = excluded.image,
       total_minutes = excluded.total_minutes, rating = excluded.rating, rating_count = excluded.rating_count, uses_robot = excluded.uses_robot, devices = excluded.devices,
       json = excluded.json, updated_at = excluded.updated_at, deleted = 0`
  ).bind(r.id, r.title, searchText(r), r.category ?? "", r.image ?? null, r.totalMinutes ?? 0, r.rating ?? 0, r.ratingCount ?? 0,
    usesRobot(r) ? 1 : 0, devices(r).join(","), JSON.stringify(r), now()).run();
}

export async function getRecipe(env: Env, id: string): Promise<RecipeJson | null> {
  const row = await env.DB.prepare("SELECT json FROM recipes WHERE id = ? AND deleted = 0").bind(id).first<{ json: string }>();
  return row ? (JSON.parse(row.json) as RecipeJson) : null;
}

/** Recherche : chaque mot doit apparaître (titre, catégorie, tags, ingrédients), sans accents. */
export async function searchRecipes(env: Env, opts: { q?: string; filter?: string; category?: string; offset?: number; limit?: number }): Promise<RecipeSummary[]> {
  const where = ["deleted = 0"];
  const args: unknown[] = [];
  for (const w of fold(opts.q ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 6)) {
    where.push("search LIKE ?");
    args.push(`%${w}%`);
  }
  if (opts.filter === "robot") where.push("uses_robot = 1");
  if (opts.filter === "sans") where.push("devices = '' AND uses_robot = 0");
  if (opts.filter === "autre") where.push("devices != '' AND uses_robot = 0");
  if (opts.filter === "rapide") where.push("total_minutes > 0 AND total_minutes <= 30");
  if (opts.category) { where.push("category = ?"); args.push(opts.category); }
  const order = opts.q ? "CASE WHEN search LIKE ? THEN 0 ELSE 1 END, rating_count DESC" : "rating_count DESC";
  if (opts.q) args.push(`${fold(opts.q).trim()}%`);
  const rows = await env.DB.prepare(`SELECT ${SUMMARY_COLS} FROM recipes WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...args, Math.min(opts.limit ?? 40, 100), opts.offset ?? 0).all<Parameters<typeof summary>[0]>();
  return rows.results.map(summary);
}

export const recipesApi = new Hono<AppEnv>();
recipesApi.use("*", requireUser);

recipesApi.get("/", async (c) => {
  const list = await searchRecipes(c.env, {
    q: c.req.query("q"), filter: c.req.query("filter"), category: c.req.query("category"),
    offset: Number(c.req.query("offset") ?? 0), limit: Number(c.req.query("limit") ?? 40),
  });
  const favs = await favoriteIds(c.env, c.get("user").household_id);
  return c.json({ recipes: list.map((r) => ({ ...r, favorite: favs.has(r.id) })) });
});

recipesApi.get("/categories", async (c) => {
  const rows = await c.env.DB.prepare("SELECT category, COUNT(*) AS n FROM recipes WHERE deleted = 0 AND category != '' GROUP BY category ORDER BY n DESC LIMIT 30")
    .all<{ category: string; n: number }>();
  return c.json({ categories: rows.results.map((r) => r.category) });
});

recipesApi.get("/:id", async (c) => {
  const r = await getRecipe(c.env, c.req.param("id"));
  if (!r) return c.json({ error: "recette introuvable" }, 404);
  const hh = c.get("user").household_id;
  const fav = await c.env.DB.prepare("SELECT 1 FROM favorites WHERE household_id = ? AND recipe_id = ?").bind(hh, r.id).first();
  const cooked = await c.env.DB.prepare("SELECT count, last_at FROM cooked WHERE household_id = ? AND recipe_id = ?").bind(hh, r.id).first<{ count: number; last_at: number }>();
  return c.json({ recipe: r, favorite: !!fav, usesRobot: usesRobot(r), devices: devices(r), cooked: cooked ?? null });
});

recipesApi.post("/", async (c) => {
  const body = (await c.req.json()) as RecipeJson;
  const r: RecipeJson = { ...body, id: "cmx-" + randomId(9), source: "claudimix" };
  await saveRecipe(c.env, r);
  return c.json({ ok: true, id: r.id });
});

recipesApi.put("/:id", async (c) => {
  const old = await getRecipe(c.env, c.req.param("id"));
  if (!old) return c.json({ error: "recette introuvable" }, 404);
  const body = (await c.req.json()) as RecipeJson;
  await saveRecipe(c.env, { ...old, ...body, id: old.id });
  return c.json({ ok: true });
});

recipesApi.post("/:id/duplicate", async (c) => {
  const old = await getRecipe(c.env, c.req.param("id"));
  if (!old) return c.json({ error: "recette introuvable" }, 404);
  const copy: RecipeJson = { ...old, id: "cmx-" + randomId(9), title: `${old.title} (copie)`, source: "claudimix", rating: 0, ratingCount: 0 };
  await saveRecipe(c.env, copy);
  return c.json({ ok: true, id: copy.id });
});

recipesApi.delete("/:id", async (c) => {
  await c.env.DB.prepare("UPDATE recipes SET deleted = 1, updated_at = ? WHERE id = ?").bind(now(), c.req.param("id")).run();
  return c.json({ ok: true });
});

export async function favoriteIds(env: Env, householdId: string): Promise<Set<string>> {
  const rows = await env.DB.prepare("SELECT recipe_id FROM favorites WHERE household_id = ?").bind(householdId).all<{ recipe_id: string }>();
  return new Set(rows.results.map((r) => r.recipe_id));
}

export const favoritesApi = new Hono<AppEnv>();
favoritesApi.use("*", requireUser);

favoritesApi.get("/", async (c) => {
  const sort = c.req.query("sort") ?? "most";
  const order = sort === "az" ? "r.title COLLATE NOCASE" : sort === "oldest" ? "COALESCE(k.last_at, 0) ASC" : "COALESCE(k.count, 0) DESC, r.title";
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.title, r.image, r.total_minutes, r.rating, r.rating_count, r.category, r.uses_robot, r.devices, k.count AS cooked, k.last_at
     FROM favorites f JOIN recipes r ON r.id = f.recipe_id AND r.deleted = 0
     LEFT JOIN cooked k ON k.household_id = f.household_id AND k.recipe_id = f.recipe_id
     WHERE f.household_id = ? ORDER BY ${order}`
  ).bind(c.get("user").household_id).all<Parameters<typeof summary>[0] & { cooked: number | null; last_at: number | null }>();
  return c.json({ favorites: rows.results.map((r) => ({ ...summary(r), favorite: true, cooked: r.cooked ?? 0, lastCooked: r.last_at })) });
});

favoritesApi.put("/:id", async (c) => {
  await c.env.DB.prepare("INSERT OR IGNORE INTO favorites (household_id, recipe_id, created_at) VALUES (?, ?, ?)")
    .bind(c.get("user").household_id, c.req.param("id"), now()).run();
  return c.json({ ok: true });
});

favoritesApi.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM favorites WHERE household_id = ? AND recipe_id = ?").bind(c.get("user").household_id, c.req.param("id")).run();
  return c.json({ ok: true });
});
