import { useEffect, useState } from "preact/hooks";
import { api } from "./api";
import { Icon, Img, Modal, addDays, minutes, robotLabel, shortDay, toast, type RecipeSummary } from "./ui";

export interface MealDto {
  day: string; slot: "midi" | "soir"; leftoverOf: string | null; keepNext: boolean;
  recipe: { id: string; title: string; image: string | null; totalMinutes: number; usesRobot: boolean; devices?: string[]; category: string };
}

/** Choisir une recette pour un créneau : favoris d'abord, recherche dans toute la base. */
export function RecipePicker({ title, onPick, onClose }: { title: string; onPick: (r: RecipeSummary) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<RecipeSummary[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const url = q.trim() ? `/api/recipes?q=${encodeURIComponent(q)}&limit=30` : "/api/favorites?sort=oldest";
      api<{ recipes?: RecipeSummary[]; favorites?: RecipeSummary[] }>(url).then((d) => setList(d.recipes ?? d.favorites ?? [])).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title={title} onClose={onClose}>
      <label class="search"><Icon.search /><input autofocus placeholder="Recette, ingrédient…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Rechercher une recette" /></label>
      <p class="cap">{q.trim() ? "Résultats" : "Vos favoris, les moins faits récemment d'abord"}</p>
      <div class="pick-list">
        {list.map((r) => (
          <button class="pick" onClick={() => onPick(r)}>
            <Img src={r.image} class="pick-img" />
            <span><b>{r.title}</b><span class="muted">{[minutes(r.totalMinutes), robotLabel(r) === "Sans robot" ? "sans robot" : ""].filter(Boolean).join(" · ")}</span></span>
          </button>
        ))}
        {!list.length && <p class="muted">{q.trim() ? "Aucune recette." : "Pas encore de favoris : cherchez une recette."}</p>}
      </div>
    </Modal>
  );
}

/** Choisir un créneau des 14 prochains jours pour une recette. */
export function SlotPicker({ recipe, onClose, onDone }: { recipe: { id: string; title: string }; onClose: () => void; onDone?: () => void }) {
  const [week, setWeek] = useState<{ today: string; meals: MealDto[] } | null>(null);
  useEffect(() => {
    Promise.all([api<{ today: string; meals: MealDto[] }>("/api/week"), api<{ meals: MealDto[] }>(`/api/week?start=${addDays(new Date().toISOString().slice(0, 10), 7)}`)])
      .then(([a, b]) => setWeek({ today: a.today, meals: [...a.meals, ...b.meals] })).catch(() => {});
  }, []);
  const put = async (day: string, slot: string) => {
    await api(`/api/meals/${day}/${slot}`, { method: "PUT", body: { recipeId: recipe.id } });
    toast(`${recipe.title} : ${shortDay(day)} ${slot}`);
    onDone?.(); onClose();
  };
  const days = week ? Array.from({ length: 10 }, (_, i) => addDays(week.today, i)) : [];
  return (
    <Modal title={`Planifier « ${recipe.title} »`} onClose={onClose}>
      <div class="slot-grid">
        <span /><span class="cap">Midi</span><span class="cap">Soir</span>
        {days.map((d) => (
          <>
            <span class="slot-day">{d === week!.today ? "Aujourd'hui" : shortDay(d)}</span>
            {(["midi", "soir"] as const).map((s) => {
              const m = week!.meals.find((x) => x.day === d && x.slot === s);
              return (
                <button class={`slot ${m ? "taken" : ""}`} onClick={() => put(d, s)}>
                  {m ? <><Img src={m.recipe.image} class="slot-img" /><span>{m.recipe.title}</span></> : <span class="muted">Libre</span>}
                </button>
              );
            })}
          </>
        ))}
      </div>
      <p class="muted small">Un créneau déjà prévu est remplacé.</p>
    </Modal>
  );
}
