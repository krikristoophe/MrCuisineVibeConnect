import { useEffect, useState } from "preact/hooks";
import { Icon, useApi } from "../ui";
import { machineTags, qty, type Recipe } from "../recipe-format";

/** Cuisiner sans le robot : une étape à la fois, en grand, l'écran reste allumé. */
export function HandsFree({ id }: { id: string }) {
  const { data } = useApi<{ recipe: Recipe }>(`/api/recipes/${encodeURIComponent(id)}`);
  const [i, setI] = useState(-1); // -1 : ingrédients
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") setI((x) => x + 1); if (e.key === "ArrowLeft") setI((x) => Math.max(-1, x - 1)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  if (!data) return <main class="hands" />;
  const r = data.recipe;
  const steps = r.steps ?? [];
  const at = Math.min(i, steps.length);
  const back = `/recettes/${encodeURIComponent(r.id)}`;
  return (
    <main class="hands">
      <header class="row-between">
        <a class="round" href={back} aria-label="Quitter"><Icon.close /></a>
        <span class="muted">{r.title}</span>
        <span class="muted">{at < 0 ? "Ingrédients" : at >= steps.length ? "Terminé" : `${at + 1} / ${steps.length}`}</span>
      </header>
      <div class="hands-body">
        {at < 0 && (
          <div class="hands-ing">
            <h1>Ingrédients</h1>
            {(r.ingredients ?? []).flatMap((g) => g.items).map((x) => <p class="line"><span class="grow">{x.name}</span><span class="muted">{qty(x)}</span></p>)}
          </div>
        )}
        {at >= 0 && at < steps.length && (
          <div class="hands-step">
            <p class="hands-text">{steps[at].text}</p>
            {machineTags(steps[at].machine).length > 0 && <p class="sets big">{machineTags(steps[at].machine).map((t) => <span class="set">{t}</span>)}</p>}
          </div>
        )}
        {at >= steps.length && <div class="hands-step"><p class="hands-text">Bon appétit !</p><a class="btn" href={back}>Revenir à la recette</a></div>}
      </div>
      <footer class="hands-nav">
        <button class="btn2" disabled={at < 0} onClick={() => setI(at - 1)}><Icon.back />Précédent</button>
        <button class="btn" disabled={at >= steps.length} onClick={() => setI(at + 1)}>{at < 0 ? "Commencer" : "Suivant"}<Icon.next /></button>
      </footer>
      <div class="progress"><span style={{ width: `${steps.length ? ((at + 1) / steps.length) * 100 : 0}%` }} /></div>
    </main>
  );
}
