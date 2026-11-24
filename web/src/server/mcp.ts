import { Hono } from "hono";
import type { AppEnv, Env, User } from "./env";
import { currentUser } from "./auth";
import { getRecipe, saveRecipe, searchRecipes, type RecipeJson } from "./recipes";
import { addDays, mondayOf, now, parisDay, randomId } from "./util";
import { mealsBetween } from "./week";

/**
 * Serveur MCP (transport HTTP, réponses JSON) pour qu'une IA lise et adapte les recettes et la
 * semaine. Authentification : jeton personnel créé dans « Mon compte » (Authorization: Bearer cmx_…).
 */
const TOOLS = [
  { name: "search_recipes", description: "Cherche des recettes (titre, catégorie, tags, ingrédients). filter : robot | sans | rapide.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, filter: { type: "string" }, limit: { type: "number" } } } },
  { name: "get_recipe", description: "Recette complète au format JSON (ingrédients, étapes, réglages du robot).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "update_recipe", description: "Modifie une recette : les champs donnés remplacent ceux de la recette (même format que get_recipe). La base est commune à tous les foyers.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, changes: { type: "object" } }, required: ["id", "changes"] } },
  { name: "create_recipe", description: "Crée une recette (même format que get_recipe, sans id). Renvoie son id.",
    inputSchema: { type: "object", properties: { recipe: { type: "object" } }, required: ["recipe"] } },
  { name: "list_meals", description: "Repas prévus par le foyer entre deux dates (AAAA-MM-JJ). Par défaut : la semaine en cours.",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } } },
  { name: "set_meal", description: "Prévoit une recette pour un repas (slot : midi ou soir).",
    inputSchema: { type: "object", properties: { day: { type: "string" }, slot: { type: "string", enum: ["midi", "soir"] }, recipe_id: { type: "string" } }, required: ["day", "slot", "recipe_id"] } },
  { name: "remove_meal", description: "Retire le repas prévu sur un créneau.",
    inputSchema: { type: "object", properties: { day: { type: "string" }, slot: { type: "string", enum: ["midi", "soir"] } }, required: ["day", "slot"] } },
];

type Args = Record<string, unknown>;

async function callTool(env: Env, user: User, name: string, a: Args): Promise<unknown> {
  switch (name) {
    case "search_recipes":
      return searchRecipes(env, { q: String(a.query ?? ""), filter: a.filter as string | undefined, limit: Number(a.limit ?? 20) });
    case "get_recipe":
      return (await getRecipe(env, String(a.id))) ?? { error: "recette introuvable" };
    case "update_recipe": {
      const old = await getRecipe(env, String(a.id));
      if (!old) return { error: "recette introuvable" };
      await saveRecipe(env, { ...old, ...(a.changes as RecipeJson), id: old.id });
      return { ok: true, id: old.id };
    }
    case "create_recipe": {
      const r = { ...(a.recipe as RecipeJson), id: "cmx-" + randomId(9), source: "claudimix" };
      await saveRecipe(env, r);
      return { ok: true, id: r.id };
    }
    case "list_meals": {
      const start = mondayOf(parisDay());
      return mealsBetween(env, user.household_id, String(a.from ?? start), String(a.to ?? addDays(start, 6)));
    }
    case "set_meal": {
      const slot = String(a.slot);
      if (!["midi", "soir"].includes(slot)) return { error: "slot : midi ou soir" };
      await env.DB.prepare(
        `INSERT INTO meals (household_id, day, slot, recipe_id, leftover_of, updated_at) VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT (household_id, day, slot) DO UPDATE SET recipe_id = excluded.recipe_id, leftover_of = NULL, updated_at = excluded.updated_at`
      ).bind(user.household_id, String(a.day), slot, String(a.recipe_id), now()).run();
      return { ok: true };
    }
    case "remove_meal":
      await env.DB.prepare("DELETE FROM meals WHERE household_id = ? AND day = ? AND slot = ?").bind(user.household_id, String(a.day), String(a.slot)).run();
      return { ok: true };
  }
  throw new Error(`outil inconnu : ${name}`);
}

export const mcp = new Hono<AppEnv>();

mcp.get("/", (c) => c.text("Méthode non prise en charge : utilisez POST.", 405));

mcp.post("/", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Jeton requis : créez-le dans Claudimix › Mon compte." }, 401, { "WWW-Authenticate": "Bearer" });
  const msg = (await c.req.json()) as { jsonrpc: string; id?: number | string; method: string; params?: { name?: string; arguments?: Args } };
  if (msg.id === undefined) return c.body(null, 202); // notification
  const reply = (result: unknown) => c.json({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "claudimix", version: "1.0.0" } });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      try {
        const out = await callTool(c.env, user, msg.params?.name ?? "", msg.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: String(e) }], isError: true });
      }
    default:
      return c.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "méthode inconnue" } });
  }
});
