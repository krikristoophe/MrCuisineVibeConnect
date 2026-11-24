import { useState } from "preact/hooks";
import type { Me } from "../app";
import { api } from "../api";
import { navigate } from "../router";
import { Icon, Img, Menu, minutes, toast, useApi } from "../ui";
import { SlotPicker } from "../pickers";
import { sendToRobot, useRobots } from "../robot";
import { machineTags, qty, type Recipe } from "../recipe-format";

interface Dto { recipe: Recipe; favorite: boolean; usesRobot: boolean; cooked: { count: number; last_at: number } | null }

export function RecipePage({ me: _me, id }: { me: Me; id: string }) {
  const { data, error, reload } = useApi<Dto>(`/api/recipes/${encodeURIComponent(id)}`);
  const robots = useRobots();
  const [tab, setTab] = useState<"ing" | "steps">("ing");
  const [plan, setPlan] = useState(false);
  if (error) return <main class="page narrow"><p class="error">{error}</p><a href="/recettes">Retour aux recettes</a></main>;
  if (!data) return <main class="page" />;
  const r = data.recipe;
  const robot = robots?.[0];

  const toggleFav = async () => {
    await api(`/api/favorites/${encodeURIComponent(r.id)}`, { method: data.favorite ? "DELETE" : "PUT" });
    toast(data.favorite ? "Retirée des favoris" : "Ajoutée aux favoris");
    reload();
  };
  const duplicate = async () => {
    const d = await api<{ id: string }>(`/api/recipes/${encodeURIComponent(r.id)}/duplicate`, { method: "POST" });
    navigate(`/recettes/${encodeURIComponent(d.id)}/modifier`);
  };
  const remove = async () => {
    if (!confirm(`Supprimer « ${r.title} » pour tous les foyers ?`)) return;
    await api(`/api/recipes/${encodeURIComponent(r.id)}`, { method: "DELETE" });
    navigate("/recettes", true);
  };

  const ingredients = (
    <div class="panel pad-x">
      {(r.ingredients ?? []).map((g) => (
        <>
          {g.group && <p class="cap group">{g.group}</p>}
          {g.items.map((i) => <div class="line"><span class="grow">{i.name}{i.note ? <span class="muted"> ({i.note})</span> : null}</span><span class="muted">{qty(i)}</span></div>)}
        </>
      ))}
    </div>
  );
  const steps = (
    <ol class="panel pad-x steps">
      {(r.steps ?? []).map((s, n) => (
        <li class="step"><span class="num">{n + 1}</span><div><p>{s.text}</p>{machineTags(s.machine).length > 0 && <p class="sets">{machineTags(s.machine).map((t) => <span class="set">{t}</span>)}</p>}</div></li>
      ))}
    </ol>
  );

  return (
    <main class="page recipe">
      <div class="row-between">
        <a class="round" href="/recettes" aria-label="Retour" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}><Icon.back /></a>
        <div class="row">
          <button class={`round ${data.favorite ? "fav-on" : ""}`} aria-label={data.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} aria-pressed={data.favorite} onClick={toggleFav}>{Icon.star(data.favorite)}</button>
          <Menu items={[
            { label: "Modifier", onClick: () => navigate(`/recettes/${encodeURIComponent(r.id)}/modifier`) },
            { label: "Dupliquer", onClick: duplicate },
            { label: "Supprimer", danger: true, onClick: remove },
          ]} />
        </div>
      </div>
      <div class="recipe-grid">
        <div class="recipe-side">
          <Img src={r.image ?? null} class="recipe-img" />
          <h1>{r.title}</h1>
          <div class="tags">
            {r.totalMinutes ? <span class="tag big">{minutes(r.totalMinutes)}</span> : null}
            {r.servings ? <span class="tag big">{r.servings} {r.servingUnit || "pers."}</span> : null}
            {r.ratingCount ? <span class="tag big">★ {(r.rating ?? 0).toFixed(1).replace(".", ",")}</span> : null}
            <span class="tag big">{data.usesRobot ? "Au robot" : "Sans robot"}</span>
          </div>
          {data.cooked && <p class="muted small">Cuisinée {data.cooked.count} fois par le foyer.</p>}
          {r.notes && <p class="muted">{r.notes}</p>}
          <div class="row wrap">
            {data.usesRobot && robot
              ? <button class="btn grow" onClick={async () => { await sendToRobot(robot.id, r.id); toast(`Recette envoyée à ${robot.name}`); }}>Envoyer au robot</button>
              : <a class="btn grow" href={`/recettes/${encodeURIComponent(r.id)}/cuisiner`}>Cuisiner</a>}
            <button class="btn2" onClick={() => setPlan(true)}><Icon.plan />Planifier</button>
            {data.usesRobot && robot && <a class="btn2" href={`/recettes/${encodeURIComponent(r.id)}/cuisiner`}>Pas à pas</a>}
          </div>
        </div>
        <div class="recipe-tabs">
          <div class="seg" role="tablist">
            <button role="tab" aria-selected={tab === "ing"} class={tab === "ing" ? "on" : ""} onClick={() => setTab("ing")}>Ingrédients</button>
            <button role="tab" aria-selected={tab === "steps"} class={tab === "steps" ? "on" : ""} onClick={() => setTab("steps")}>Étapes</button>
          </div>
          {tab === "ing" ? ingredients : steps}
        </div>
        <div class="recipe-cols">
          <section><p class="cap">Ingrédients</p>{ingredients}</section>
          <section><p class="cap">Étapes</p>{steps}</section>
        </div>
      </div>
      {plan && <SlotPicker recipe={r} onClose={() => setPlan(false)} />}
    </main>
  );
}
