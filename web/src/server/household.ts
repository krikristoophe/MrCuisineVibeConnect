import { Hono } from "hono";
import type { AppEnv } from "./env";
import { addDays, humanCode, now, parisDay } from "./util";
import { getRecipe } from "./recipes";
import { householdTimes, mealsBetween, startBy, type Slot } from "./week";

export const householdApi = new Hono<AppEnv>();
// Connexion vérifiée par worker.ts (monté sur /api).

householdApi.get("/me", async (c) => {
  const user = c.get("user");
  const hh = await c.env.DB.prepare("SELECT id, name, lunch_time, dinner_time FROM households WHERE id = ?").bind(user.household_id).first<{ id: string; name: string; lunch_time: string; dinner_time: string }>();
  const members = await c.env.DB.prepare("SELECT id, name, picture FROM users WHERE household_id = ? ORDER BY created_at").bind(user.household_id).all();
  const robots = await c.env.DB.prepare("SELECT id, name, last_seen FROM robots WHERE household_id = ? ORDER BY created_at").bind(user.household_id).all();
  const prefs = (await c.env.DB.prepare("SELECT finished, action, meals FROM notify_prefs WHERE user_id = ?").bind(user.id).first()) ?? { finished: 1, action: 1, meals: 0 };
  const assistants = await c.env.DB.prepare(
    `SELECT c.client_id, c.name, MIN(t.created_at) AS since FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id
     WHERE t.user_id = ? AND t.kind = 'refresh' AND t.expires_at > ? GROUP BY c.client_id ORDER BY since`
  ).bind(user.id, now()).all();
  return c.json({ user, household: hh, members: members.results, robots: robots.results, prefs, assistants: assistants.results, mcpUrl: `${new URL(c.req.url).origin}/mcp`, vapidPublicKey: c.env.VAPID_PUBLIC_KEY });
});

householdApi.patch("/household", async (c) => {
  const body = (await c.req.json()) as { name?: string; lunchTime?: string; dinnerTime?: string };
  const hh = c.get("user").household_id;
  const time = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? t : null);
  await c.env.DB.prepare("UPDATE households SET name = COALESCE(?, name), lunch_time = COALESCE(?, lunch_time), dinner_time = COALESCE(?, dinner_time) WHERE id = ?")
    .bind(body.name?.trim().slice(0, 60) || null, time(body.lunchTime), time(body.dinnerTime), hh).run();
  return c.json({ ok: true });
});

householdApi.post("/household/invite", async (c) => {
  const code = humanCode(10);
  await c.env.DB.prepare("INSERT INTO invites (code, household_id, expires_at) VALUES (?, ?, ?)").bind(code, c.get("user").household_id, now() + 7 * 86400_000).run();
  return c.json({ code, url: `${new URL(c.req.url).origin}/rejoindre?code=${code}` });
});

householdApi.post("/invite/accept", async (c) => {
  const { code } = (await c.req.json()) as { code: string };
  const inv = await c.env.DB.prepare("SELECT household_id, expires_at FROM invites WHERE code = ?").bind((code ?? "").toUpperCase()).first<{ household_id: string; expires_at: number }>();
  if (!inv || inv.expires_at < now()) return c.json({ error: "Invitation inconnue ou expirée." }, 404);
  await c.env.DB.prepare("UPDATE users SET household_id = ? WHERE id = ?").bind(inv.household_id, c.get("user").id).run();
  const hh = await c.env.DB.prepare("SELECT name FROM households WHERE id = ?").bind(inv.household_id).first<{ name: string }>();
  return c.json({ ok: true, household: hh?.name });
});

householdApi.patch("/me/prefs", async (c) => {
  const b = (await c.req.json()) as { finished?: boolean; action?: boolean; meals?: boolean };
  const cur = (await c.env.DB.prepare("SELECT finished, action, meals FROM notify_prefs WHERE user_id = ?").bind(c.get("user").id).first<{ finished: number; action: number; meals: number }>()) ?? { finished: 1, action: 1, meals: 0 };
  const v = (x: boolean | undefined, d: number) => (x === undefined ? d : x ? 1 : 0);
  await c.env.DB.prepare(
    `INSERT INTO notify_prefs (user_id, finished, action, meals) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET finished = excluded.finished, action = excluded.action, meals = excluded.meals`
  ).bind(c.get("user").id, v(b.finished, cur.finished), v(b.action, cur.action), v(b.meals, cur.meals)).run();
  return c.json({ ok: true });
});

householdApi.post("/push/subscribe", async (c) => {
  const { endpoint } = (await c.req.json()) as { endpoint: string };
  if (!endpoint?.startsWith("https://")) return c.json({ error: "abonnement invalide" }, 400);
  await c.env.DB.prepare("INSERT INTO push_subscriptions (endpoint, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id")
    .bind(endpoint, c.get("user").id, now()).run();
  return c.json({ ok: true });
});

householdApi.post("/push/unsubscribe", async (c) => {
  const { endpoint } = (await c.req.json()) as { endpoint: string };
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(endpoint, c.get("user").id).run();
  return c.json({ ok: true });
});

/** Le service worker vient lire la notification à afficher après un push vide. */
householdApi.get("/notifications/latest", async (c) => {
  const n = await c.env.DB.prepare("SELECT title, body, url, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").bind(c.get("user").id).first();
  return c.json({ notification: n ?? null });
});

/** Déconnecte un assistant IA (MCP) : ses jetons d'accès et de renouvellement sont supprimés. */
householdApi.delete("/assistants/:clientId", async (c) => {
  await c.env.DB.prepare("DELETE FROM oauth_tokens WHERE user_id = ? AND client_id = ?").bind(c.get("user").id, c.req.param("clientId")).run();
  return c.json({ ok: true });
});

function parisMinutes(): number {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.now()).split(":").map(Number);
  return h * 60 + m;
}

/** Accueil : le prochain repas (avec l'heure limite et les ingrédients à sortir) et les jours à venir. */
householdApi.get("/dashboard", async (c) => {
  const hh = c.get("user").household_id;
  const today = parisDay();
  const times = await householdTimes(c.env, hh);
  const meals = await mealsBetween(c.env, hh, today, addDays(today, 6));
  const nowMin = parisMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  // Un repas reste « le prochain » jusqu'à une heure après son heure.
  const candidates: { day: string; slot: Slot }[] = [];
  if (nowMin < toMin(times.midi) + 60) candidates.push({ day: today, slot: "midi" });
  if (nowMin < toMin(times.soir) + 60) candidates.push({ day: today, slot: "soir" });
  candidates.push({ day: addDays(today, 1), slot: "midi" }, { day: addDays(today, 1), slot: "soir" });
  let next = null;
  for (const cand of candidates) {
    const m = meals.find((x) => x.day === cand.day && x.slot === cand.slot);
    if (!m) continue;
    const r = await getRecipe(c.env, m.recipe.id);
    const time = cand.slot === "midi" ? times.midi : times.soir;
    next = {
      ...m, time,
      startBy: m.leftoverOf ? null : startBy(time, m.recipe.totalMinutes),
      ingredients: m.leftoverOf ? [] : (r?.ingredients ?? []).flatMap((g) => g.items).slice(0, 10).map((i) => ({ name: i.name, quantity: `${i.qty ?? ""} ${i.unit ?? ""}`.trim() })),
    };
    break;
  }
  return c.json({ today, times, next, meals });
});
