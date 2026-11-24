import { Hono } from "hono";
import type { AppEnv, Env } from "./server/env";
import { auth, requireUser } from "./server/auth";
import { householdApi } from "./server/household";
import { favoritesApi, recipesApi } from "./server/recipes";
import { weekApi } from "./server/week";
import { robotApi, robotsApp } from "./server/robot";
import { mcp } from "./server/mcp";
import { now } from "./server/util";

export { RobotHub } from "./server/robot";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Erreur du serveur." }, 500);
});

app.route("/auth", auth);
app.route("/api/robot", robotApi); // appelé par le robot (jeton cmr_)
app.route("/api/robots", robotsApp); // appli
app.route("/api/recipes", recipesApi);
app.route("/api/favorites", favoritesApi);
// Routes /api sans préfixe propre : connexion obligatoire (sauf /api/robot, qui a son jeton).
app.use("/api/*", async (c, next) => (c.req.path.startsWith("/api/robot/") ? next() : requireUser(c, next)));
app.route("/api", weekApi);
app.route("/api", householdApi);
app.route("/mcp", mcp);
app.all("/api/*", (c) => c.json({ error: "introuvable" }, 404));

export default {
  fetch: app.fetch,
  /** Ménage quotidien : sessions, appairages et invitations expirés, vieilles notifications. */
  async scheduled(_: ScheduledController, env: Env) {
    const t = now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t),
      env.DB.prepare("DELETE FROM pairings WHERE expires_at < ?").bind(t),
      env.DB.prepare("DELETE FROM invites WHERE expires_at < ?").bind(t),
      env.DB.prepare("DELETE FROM notifications WHERE created_at < ?").bind(t - 30 * 86400_000),
    ]);
  },
} satisfies ExportedHandler<Env>;
