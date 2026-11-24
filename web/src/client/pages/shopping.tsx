import { api } from "../api";
import { Icon, shortDay, useApi } from "../ui";

interface Item { key: string; name: string; quantity: string; recipes: string[]; checked: boolean }

export function Shopping({ start }: { start: string | null }) {
  const { data, reload } = useApi<{ week: string; from: string; to: string; items: Item[] }>(`/api/shopping${start ? `?start=${start}` : ""}`);
  const toggle = async (it: Item) => { await api("/api/shopping/check", { body: { week: data!.week, item: it.key, checked: !it.checked } }); reload(); };
  const left = data?.items.filter((i) => !i.checked).length ?? 0;
  return (
    <main class="page narrow">
      <div class="row"><a class="round" href={`/semaine${start ? `?du=${start}` : ""}`} aria-label="Retour à la semaine"><Icon.back /></a></div>
      <header class="head"><div><p class="muted">{data ? `${shortDay(data.from)} → ${shortDay(data.to)} · ${left} article${left > 1 ? "s" : ""} à acheter` : ""}</p><h1>Courses</h1></div></header>
      {data && !data.items.length && <p class="panel pad muted">Rien à acheter : prévoyez des repas dans la semaine.</p>}
      <div class="panel pad-x">
        {data?.items.map((it) => (
          <button class={`chk ${it.checked ? "done" : ""}`} onClick={() => toggle(it)} aria-pressed={it.checked}>
            <span class="box">{it.checked && <Icon.check />}</span>
            <span class="grow"><span>{it.name}</span><span class="muted small block">{it.recipes.join(", ")}</span></span>
            <span class="muted">{it.quantity}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
