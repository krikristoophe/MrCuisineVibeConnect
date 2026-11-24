import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import type { AppEnv, Env, User } from "./env";
import { b64url, b64urlDecode, now, randomId, sha256 } from "./util";

const SESSION_COOKIE = "cmx_session";
const SESSION_DAYS = 180;

function origin(c: Context): string {
  return new URL(c.req.url).origin;
}

export const auth = new Hono<AppEnv>();

/** Connexion : redirige vers Google (code + PKCE). `next` = page où revenir. */
auth.get("/google", async (c) => {
  const state = randomId();
  const verifier = randomId(32);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const next = c.req.query("next") || "/";
  const secure = origin(c).startsWith("https");
  const opts = { httpOnly: true, secure, sameSite: "Lax" as const, path: "/auth", maxAge: 600 };
  setCookie(c, "cmx_oauth", JSON.stringify({ state, verifier, next: next.startsWith("/") ? next : "/" }), opts);
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", origin(c) + "/auth/google/callback");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  return c.redirect(u.toString());
});

auth.get("/google/callback", async (c) => {
  const raw = getCookie(c, "cmx_oauth");
  deleteCookie(c, "cmx_oauth", { path: "/auth" });
  if (!raw) return c.redirect("/connexion?erreur=session");
  const saved = JSON.parse(raw) as { state: string; verifier: string; next: string };
  if (c.req.query("state") !== saved.state || !c.req.query("code")) return c.redirect("/connexion?erreur=etat");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: c.req.query("code")!,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: origin(c) + "/auth/google/callback",
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  if (!res.ok) return c.redirect("/connexion?erreur=google");
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) return c.redirect("/connexion?erreur=google");
  // Le jeton vient directement de Google en HTTPS : on vérifie l'émetteur, le destinataire et la date.
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(tok.id_token.split(".")[1]))) as {
    iss: string; aud: string; exp: number; sub: string; email: string; email_verified?: boolean; name?: string; given_name?: string; picture?: string;
  };
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss) || claims.aud !== c.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < now() || !claims.email_verified) {
    return c.redirect("/connexion?erreur=jeton");
  }

  const user = await upsertUser(c.env, claims.sub, claims.email, claims.given_name || claims.name || claims.email.split("@")[0], claims.picture ?? null);
  const sid = randomId(32);
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(sid), user.id, now() + SESSION_DAYS * 86400_000).run();
  setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, secure: origin(c).startsWith("https"), sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400 });
  return c.redirect(saved.next);
});

auth.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(sid)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/** Crée l'utilisateur à sa première connexion, avec son propre foyer. */
async function upsertUser(env: Env, sub: string, email: string, name: string, picture: string | null): Promise<User> {
  const existing = await env.DB.prepare("SELECT id, email, name, picture, household_id FROM users WHERE google_sub = ?").bind(sub).first<User>();
  if (existing) {
    await env.DB.prepare("UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?").bind(email, name, picture, existing.id).run();
    return { ...existing, email, name, picture };
  }
  const id = randomId();
  const household = randomId();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)").bind(household, `Foyer de ${name}`, now()),
    env.DB.prepare("INSERT INTO users (id, google_sub, email, name, picture, household_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, sub, email, name, picture, household, now()),
  ]);
  return { id, email, name, picture, household_id: household };
}

/** Utilisateur de la session (cookie) ou d'un jeton personnel (Authorization: Bearer, pour le MCP). */
export async function currentUser(c: Context<AppEnv>): Promise<User | null> {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer cmx_")) {
    const hash = await sha256(header.slice(7));
    return c.env.DB.prepare(
      "SELECT u.id, u.email, u.name, u.picture, u.household_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?"
    ).bind(hash).first<User>();
  }
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return null;
  return c.env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.picture, u.household_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
  ).bind(await sha256(sid), now()).first<User>();
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "connexion requise" }, 401);
  c.set("user", user);
  await next();
}
