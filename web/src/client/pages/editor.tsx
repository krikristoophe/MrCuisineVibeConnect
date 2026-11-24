import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { navigate } from "../router";
import { Icon, toast } from "../ui";
import { machineTags, type Ingredient, type Recipe, type Step } from "../recipe-format";

/** Création ou modification d'une recette. Les réglages du robot des étapes existantes sont gardés. */
export function Editor({ id }: { id: string | null }) {
  const [r, setR] = useState<Recipe | null>(id ? null : { id: "", title: "", category: "", servings: 4, totalMinutes: 30, ingredients: [{ items: [{ qty: "", unit: "", name: "" }] }], steps: [{ text: "" }] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (id) api<{ recipe: Recipe }>(`/api/recipes/${encodeURIComponent(id)}`).then((d) => setR(d.recipe)); }, [id]);
  if (!r) return <main class="page narrow" />;

  const set = (patch: Partial<Recipe>) => setR({ ...r, ...patch });
  const items: Ingredient[] = (r.ingredients ?? []).flatMap((g) => g.items);
  const setItems = (list: Ingredient[]) => set({ ingredients: [{ items: list }] });
  const steps: Step[] = r.steps ?? [];
  const setSteps = (list: Step[]) => set({ steps: list });

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...r, ingredients: r.ingredients?.map((g) => ({ ...g, items: g.items.filter((i) => i.name.trim()) })), steps: steps.filter((s) => s.text.trim()) };
    try {
      if (id) { await api(`/api/recipes/${encodeURIComponent(id)}`, { method: "PUT", body }); navigate(`/recettes/${encodeURIComponent(id)}`, true); }
      else { const d = await api<{ id: string }>("/api/recipes", { body }); navigate(`/recettes/${encodeURIComponent(d.id)}`, true); }
      toast("Recette enregistrée");
    } catch (err) { toast((err as Error).message); setBusy(false); }
  };
  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <main class="page narrow">
      <div class="row"><a class="round" href={id ? `/recettes/${encodeURIComponent(id)}` : "/recettes"} aria-label="Annuler"><Icon.close /></a><h1>{id ? "Modifier la recette" : "Nouvelle recette"}</h1></div>
      <form class="stack" onSubmit={save}>
        <div class="panel pad stack">
          <label class="field"><span>Titre</span><input required value={r.title} onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} /></label>
          <label class="field"><span>Catégorie</span><input value={r.category ?? ""} onInput={(e) => set({ category: (e.target as HTMLInputElement).value })} /></label>
          <div class="row wrap">
            <label class="field grow"><span>Portions</span><input type="number" min="1" value={r.servings ?? ""} onInput={(e) => set({ servings: num((e.target as HTMLInputElement).value) })} /></label>
            <label class="field grow"><span>Durée totale (min)</span><input type="number" min="0" value={r.totalMinutes ?? ""} onInput={(e) => set({ totalMinutes: num((e.target as HTMLInputElement).value) })} /></label>
          </div>
          <label class="field"><span>Photo (adresse d'une image)</span><input type="url" value={r.image ?? ""} onInput={(e) => set({ image: (e.target as HTMLInputElement).value || null })} /></label>
        </div>
        <section class="stack-sm"><p class="cap">Ingrédients</p>
          <div class="panel pad stack-sm">
            {items.map((it, n) => (
              <div class="ing-row">
                <input aria-label="Quantité" placeholder="Qté" value={it.qty ?? ""} onInput={(e) => setItems(items.map((x, k) => (k === n ? { ...x, qty: (e.target as HTMLInputElement).value } : x)))} />
                <input aria-label="Unité" placeholder="Unité" value={it.unit ?? ""} onInput={(e) => setItems(items.map((x, k) => (k === n ? { ...x, unit: (e.target as HTMLInputElement).value } : x)))} />
                <input aria-label="Ingrédient" placeholder="Ingrédient" value={it.name} onInput={(e) => setItems(items.map((x, k) => (k === n ? { ...x, name: (e.target as HTMLInputElement).value } : x)))} />
                <button type="button" class="round sm" aria-label="Retirer" onClick={() => setItems(items.filter((_, k) => k !== n))}><Icon.close /></button>
              </div>
            ))}
            <button type="button" class="link" onClick={() => setItems([...items, { qty: "", unit: "", name: "" }])}>Ajouter un ingrédient</button>
          </div>
        </section>
        <section class="stack-sm"><p class="cap">Étapes</p>
          <div class="panel pad stack-sm">
            {steps.map((s, n) => (
              <div class="step-row">
                <span class="num">{n + 1}</span>
                <div class="grow stack-sm">
                  <textarea rows={2} value={s.text} aria-label={`Étape ${n + 1}`} onInput={(e) => setSteps(steps.map((x, k) => (k === n ? { ...x, text: (e.target as HTMLTextAreaElement).value } : x)))} />
                  {machineTags(s.machine).length > 0 && <p class="sets">{machineTags(s.machine).map((t) => <span class="set">{t}</span>)}</p>}
                </div>
                <button type="button" class="round sm" aria-label="Retirer l'étape" onClick={() => setSteps(steps.filter((_, k) => k !== n))}><Icon.close /></button>
              </div>
            ))}
            <button type="button" class="link" onClick={() => setSteps([...steps, { text: "" }])}>Ajouter une étape</button>
          </div>
        </section>
        <p class="muted small">La base de recettes est commune à tous les foyers.</p>
        <button class="btn" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </form>
    </main>
  );
}
