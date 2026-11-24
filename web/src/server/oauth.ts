import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, User } from "./env";
import { currentUser } from "./auth";
import { b64url, now, randomId, sha256 } from "./util";

/**
 * Serveur d'autorisation OAuth 2.1 pour le MCP : enregistrement dynamique des clients (RFC 7591),
 * code d'autorisation + PKCE (S256), jetons de renouvellement. L'utilisateur se connecte avec Google
 * (session Claudimix) puis autorise l'assistant. Clients publics uniquement (pas de secret).
 */
const ACCESS_TTL = 3600_000;
const REFRESH_TTL = 90 * 86400_000;
const CODE_TTL = 10 * 60_000;

const origin = (c: Context) => new URL(c.req.url).origin;

export function protectedResourceMetadata(c: Context) {
  return c.json({ resource: `${origin(c)}/mcp`, authorization_servers: [origin(c)], bearer_methods_supported: ["header"], resource_name: "Claudimix" });
}

export const wellKnown = new Hono<AppEnv>();
wellKnown.use("*", cors());
wellKnown.get("/oauth-protected-resource", protectedResourceMetadata);
wellKnown.get("/oauth-protected-resource/mcp", protectedResourceMetadata);
wellKnown.get("/oauth-authorization-server", (c) => c.json({
  issuer: origin(c),
  authorization_endpoint: `${origin(c)}/oauth/authorize`,
  token_endpoint: `${origin(c)}/oauth/token`,
  registration_endpoint: `${origin(c)}/oauth/register`,
  revocation_endpoint: `${origin(c)}/oauth/revoke`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["claudimix"],
}));

export const oauth = new Hono<AppEnv>();
oauth.use("/register", cors());
oauth.use("/token", cors());
oauth.use("/revoke", cors());

oauth.post("/register", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { client_name?: string; redirect_uris?: string[] };
  const uris = (body.redirect_uris ?? []).filter((u) => typeof u === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/.test(u));
  if (!uris.length) return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris (https) requis" }, 400);
  const clientId = "cmc_" + randomId(16);
  const name = (body.client_name ?? "Assistant IA").slice(0, 80);
  await c.env.DB.prepare("INSERT INTO oauth_clients (client_id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)").bind(clientId, name, JSON.stringify(uris), now()).run();
  return c.json({
    client_id: clientId, client_name: name, redirect_uris: uris, client_id_issued_at: Math.floor(now() / 1000),
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
  }, 201);
});

interface Client { client_id: string; name: string; redirect_uris: string }

async function client(c: Context<AppEnv>, id: string | undefined): Promise<Client | null> {
  if (!id) return null;
  return c.env.DB.prepare("SELECT client_id, name, redirect_uris FROM oauth_clients WHERE client_id = ?").bind(id).first<Client>();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function page(title: string, body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Claudimix</title><link rel="icon" href="/icon.svg">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F3F5F8;color:#1A2332;font:16px/1.45 Roboto,system-ui,sans-serif;padding:24px;box-sizing:border-box}
.card{background:#fff;border-radius:24px;padding:28px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-size:24px;font-weight:500}p{margin:0}.muted{color:#5A6578}ul{margin:0;padding-left:20px;color:#5A6578}
.row{display:flex;gap:10px}button{flex:1;min-height:50px;border-radius:25px;font:500 16px inherit;cursor:pointer}
.ok{background:#FF8A3D;border:0;color:#1E1007}.no{background:#fff;border:1px solid #C5CDD9;color:#1A2332}</style></head>
<body><main class="card"><img src="/icon.svg" alt="" width="56" height="56">${body}</main></body></html>`;
}

/** Valide la demande ; renvoie un message d'erreur à afficher (sans rediriger : l'URI n'est pas sûre). */
function checkRequest(q: Record<string, string>, cl: Client | null): string | null {
  if (!cl) return "Application inconnue.";
  if (!JSON.parse(cl.redirect_uris).includes(q.redirect_uri)) return "Adresse de retour non autorisée.";
  if (q.response_type !== "code") return "Type de réponse non pris en charge.";
  if (!q.code_challenge || (q.code_challenge_method ?? "plain") !== "S256") return "PKCE (S256) requis.";
  return null;
}

/** Jeton anti-falsification du formulaire, lié à la session et à la demande. */
async function formToken(user: User, q: Record<string, string>) {
  return sha256(`${user.id}|${q.client_id}|${q.redirect_uri}|${q.code_challenge}|${q.state ?? ""}`);
}

oauth.get("/authorize", async (c) => {
  const q = c.req.query();
  const cl = await client(c, q.client_id);
  const err = checkRequest(q, cl);
  if (err) return c.html(page("Erreur", `<h1>Connexion impossible</h1><p class="muted">${esc(err)}</p>`), 400);
  const user = await currentUser(c);
  if (!user) return c.redirect(`/auth/google?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`);
  const fields = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"]
    .filter((k) => q[k] !== undefined).map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join("");
  return c.html(page("Autoriser", `<h1>Autoriser « ${esc(cl!.name)} » ?</h1>
<p class="muted">Connecté en tant que <b>${esc(user.name)}</b> (${esc(user.email)}).</p>
<p>Cet assistant pourra :</p><ul><li>chercher, lire, modifier et créer des recettes (base commune) ;</li><li>lire et prévoir les repas de votre foyer.</li></ul>
<form method="post" action="/oauth/authorize" class="row">${fields}<input type="hidden" name="form" value="${await formToken(user, q)}">
<button class="no" name="decision" value="deny">Refuser</button><button class="ok" name="decision" value="allow">Autoriser</button></form>`));
});

oauth.post("/authorize", async (c) => {
  const q = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
  q.response_type = "code";
  const cl = await client(c, q.client_id);
  const err = checkRequest(q, cl);
  if (err) return c.html(page("Erreur", `<h1>Connexion impossible</h1><p class="muted">${esc(err)}</p>`), 400);
  const user = await currentUser(c);
  if (!user || q.form !== (await formToken(user, q))) return c.html(page("Erreur", `<h1>Session expirée</h1><p class="muted">Recommencez depuis l'assistant.</p>`), 400);
  const back = new URL(q.redirect_uri);
  if (q.state) back.searchParams.set("state", q.state);
  if (q.decision !== "allow") {
    back.searchParams.set("error", "access_denied");
    return c.redirect(back.toString());
  }
  const code = randomId(32);
  await c.env.DB.prepare("INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(code), q.client_id, user.id, q.redirect_uri, q.code_challenge, now() + CODE_TTL).run();
  back.searchParams.set("code", code);
  return c.redirect(back.toString());
});

async function issue(c: Context<AppEnv>, clientId: string, userId: string) {
  const access = "cma_" + randomId(32);
  const refresh = "cmf_" + randomId(32);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at, created_at) VALUES (?, 'access', ?, ?, ?, ?)").bind(await sha256(access), clientId, userId, now() + ACCESS_TTL, now()),
    c.env.DB.prepare("INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at, created_at) VALUES (?, 'refresh', ?, ?, ?, ?)").bind(await sha256(refresh), clientId, userId, now() + REFRESH_TTL, now()),
  ]);
  return c.json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: "claudimix" }, 200, { "Cache-Control": "no-store" });
}

const tokenError = (c: Context, error: string, description: string) => c.json({ error, error_description: description }, 400);

oauth.post("/token", async (c) => {
  const b = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
  if (b.grant_type === "authorization_code") {
    const row = await c.env.DB.prepare("SELECT client_id, user_id, redirect_uri, challenge, expires_at FROM oauth_codes WHERE code_hash = ?")
      .bind(await sha256(b.code ?? "")).first<{ client_id: string; user_id: string; redirect_uri: string; challenge: string; expires_at: number }>();
    if (row) await c.env.DB.prepare("DELETE FROM oauth_codes WHERE code_hash = ?").bind(await sha256(b.code ?? "")).run(); // usage unique
    if (!row || row.expires_at < now()) return tokenError(c, "invalid_grant", "code inconnu ou expiré");
    if (b.client_id && b.client_id !== row.client_id) return tokenError(c, "invalid_grant", "client différent");
    if (b.redirect_uri && b.redirect_uri !== row.redirect_uri) return tokenError(c, "invalid_grant", "redirect_uri différente");
    const verifier = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b.code_verifier ?? "")));
    if (verifier !== row.challenge) return tokenError(c, "invalid_grant", "code_verifier invalide");
    return issue(c, row.client_id, row.user_id);
  }
  if (b.grant_type === "refresh_token") {
    const hash = await sha256(b.refresh_token ?? "");
    const row = await c.env.DB.prepare("SELECT client_id, user_id, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'").bind(hash).first<{ client_id: string; user_id: string; expires_at: number }>();
    if (!row || row.expires_at < now()) return tokenError(c, "invalid_grant", "jeton de renouvellement inconnu ou expiré");
    await c.env.DB.prepare("DELETE FROM oauth_tokens WHERE token_hash = ?").bind(hash).run(); // rotation
    return issue(c, row.client_id, row.user_id);
  }
  return tokenError(c, "unsupported_grant_type", "authorization_code ou refresh_token");
});

oauth.post("/revoke", async (c) => {
  const b = await c.req.parseBody();
  await c.env.DB.prepare("DELETE FROM oauth_tokens WHERE token_hash = ?").bind(await sha256(String(b.token ?? ""))).run();
  return c.body(null, 200);
});
