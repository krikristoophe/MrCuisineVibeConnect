import type { Me } from "../app";
import { Icon, useApi } from "../ui";
import { clock, statusLabel, useRobots } from "../robot";
import { machineTags, type Recipe } from "../recipe-format";

/** Cuisson en cours : ce qui va être demandé, quand, et l'avancée des étapes. */
export function CookPage({ me: _me }: { me: Me }) {
  const robots = useRobots();
  const r = robots?.[0];
  const s = r?.state;
  const recipeId = s?.recipe?.id;
  const { data } = useApi<{ recipe: Recipe }>(recipeId ? `/api/recipes/${encodeURIComponent(recipeId)}` : null, [recipeId]);
  const steps = data?.recipe.steps ?? [];
  const cur = (s?.step?.index ?? 1) - 1;
  const cooking = r?.online && (s?.status === "running" || s?.status === "paused");

  return (
    <main class="page cook">
      <div class="row">
        <a class="round" href="/" aria-label="Retour à l'accueil"><Icon.back /></a>
        {r && <span class={`status ${r.online ? (cooking ? "on" : "idle") : "off"}`}><i />{r.name} · {statusLabel(r)}{s?.recipe ? ` · ${s.recipe.title}` : ""}</span>}
      </div>
      {!r && robots && <p class="panel pad">Aucun robot relié. <a href="/compte">Ajouter le robot</a></p>}
      {r && !cooking && s?.status !== "finished" && <p class="panel pad big">{r.online ? "Le robot est libre. Envoyez une recette depuis une fiche ou l'accueil." : "Le robot ne répond pas : il est éteint ou hors Wi-Fi."}</p>}
      {r && s?.status === "finished" && <p class="panel pad big">C'est prêt : {s.recipe?.title ?? "la recette"} est terminée.</p>}
      {cooking && (
        <div class="cook-grid">
          <div class="stack">
            {s?.action ? (
              <div><p class="muted big">Maintenant</p><p class="cook-now">{s.action}</p></div>
            ) : (
              <div>
                <p class="muted big">Dans</p>
                <p class="cook-time">{clock(s?.remainingSec) || "…"}</p>
                <p class="cook-now">{s?.step?.next ?? steps[cur + 1]?.text ?? "Fin de la recette"}</p>
              </div>
            )}
            <div class="panel pad stack">
              <div class="row-between"><b>Étape {s?.step?.index ?? "?"} sur {s?.step?.total ?? "?"}</b><span class="muted">{[s?.tempC ? `${s.tempC} °C` : "", s?.speed ? `vitesse ${s.speed}` : "", s?.reverse ? "inverse" : "", s?.weightG ? `${s.weightG} g` : ""].filter(Boolean).join(" · ")}</span></div>
              <div class="segments">{Array.from({ length: s?.step?.total ?? 0 }, (_, n) => <i class={n < cur ? "done" : n === cur ? "now" : ""} />)}</div>
              {s?.step?.text && <p>{s.step.text}</p>}
            </div>
          </div>
          {steps.length > 0 && (
            <ol class="panel pad-x steps compact">
              {steps.map((st, n) => (
                <li class={`step ${n < cur ? "done" : n === cur ? "now" : ""}`}><span class="num">{n + 1}</span><div><p>{st.text}</p>{machineTags(st.machine).length > 0 && <p class="sets">{machineTags(st.machine).map((t) => <span class="set">{t}</span>)}</p>}</div></li>
              ))}
            </ol>
          )}
        </div>
      )}
    </main>
  );
}
