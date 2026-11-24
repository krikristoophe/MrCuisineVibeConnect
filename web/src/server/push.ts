import type { Env } from "./env";
import { b64url, now, randomId } from "./util";

/**
 * Notifications Web Push sans contenu : on stocke la notification en base, on réveille le service
 * worker par un push vide (seule la signature VAPID est nécessaire, pas de chiffrement), et le
 * service worker vient lire la notification (/api/notifications/latest).
 */
let keyCache: CryptoKey | null = null;

async function vapidKey(env: Env): Promise<CryptoKey> {
  if (!keyCache) {
    keyCache = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }
  return keyCache;
}

async function vapidJwt(env: Env, audience: string): Promise<string> {
  const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: audience, exp: Math.floor(now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await vapidKey(env), new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

async function wake(env: Env, endpoint: string): Promise<boolean> {
  const jwt = await vapidJwt(env, new URL(endpoint).origin);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, TTL: "86400", Urgency: "high", "Content-Length": "0" },
  });
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
    return false;
  }
  return res.ok;
}

export type NotifyKind = "finished" | "action" | "meals";

/** Notifie les membres d'un foyer qui ont activé ce type de notification. */
export async function notifyHousehold(env: Env, householdId: string, kind: NotifyKind, title: string, body: string, url: string, exceptUser?: string) {
  const users = await env.DB.prepare(
    `SELECT u.id FROM users u LEFT JOIN notify_prefs p ON p.user_id = u.id
     WHERE u.household_id = ? AND COALESCE(p.${kind}, ${kind === "meals" ? 0 : 1}) = 1`
  ).bind(householdId).all<{ id: string }>();
  for (const { id } of users.results) {
    if (id === exceptUser) continue;
    await env.DB.prepare("INSERT INTO notifications (id, user_id, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(randomId(), id, title, body, url, now()).run();
    const subs = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE user_id = ?").bind(id).all<{ endpoint: string }>();
    await Promise.all(subs.results.map((s) => wake(env, s.endpoint).catch(() => false)));
  }
}
