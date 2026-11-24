import { useState } from "preact/hooks";
import type { Me } from "../app";
import { Icon, Img, ago, minutes, useApi, type RecipeSummary } from "../ui";
import { SlotPicker } from "../pickers";

type Fav = RecipeSummary & { cooked: number; lastCooked: number | null };
const SORTS = [{ k: "most", l: "Les plus cuisinées" }, { k: "oldest", l: "Pas faites depuis longtemps" }, { k: "az", l: "A → Z" }];

export function Favorites({ me: _me }: { me: Me }) {
  const [sort, setSort] = useState("most");
  const { data } = useApi<{ favorites: Fav[] }>(`/api/favorites?sort=${sort}`, [sort]);
  const [plan, setPlan] = useState<Fav | null>(null);
  const favs = data?.favorites ?? [];
  return (
    <main class="page">
      <header class="head"><div><p class="muted">{data ? `${favs.length} recette${favs.length > 1 ? "s" : ""}` : ""}</p><h1>Favoris</h1></div></header>
      <div class="chips">{SORTS.map((s) => <button class={`chip dark ${sort === s.k ? "sel" : ""}`} onClick={() => setSort(s.k)}>{s.l}</button>)}</div>
      <div class="fav-list">
        {favs.map((f) => (
          <div class="panel fav">
            <a class="fav-link" href={`/recettes/${encodeURIComponent(f.id)}`}>
              <Img src={f.image} class="fav-img" />
              <span><b>{f.title}</b><span class="muted small">{f.cooked ? `Cuisinée ${f.cooked} fois · ${ago(f.lastCooked)}` : "Jamais cuisinée"}{f.totalMinutes ? ` · ${minutes(f.totalMinutes)}` : ""}{f.usesRobot ? "" : " · sans robot"}</span></span>
            </a>
            <button class="round accent" aria-label={`Planifier ${f.title}`} onClick={() => setPlan(f)}><Icon.plan /></button>
          </div>
        ))}
      </div>
      {data && !favs.length && <p class="panel pad muted">Pas encore de favoris : touchez l'étoile d'une recette pour l'ajouter.</p>}
      {plan && <SlotPicker recipe={plan} onClose={() => setPlan(null)} />}
    </main>
  );
}
