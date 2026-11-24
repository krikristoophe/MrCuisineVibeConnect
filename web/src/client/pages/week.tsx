import { useState } from "preact/hooks";
import type { Me } from "../app";
import { api } from "../api";
import { navigate } from "../router";
import { Icon, Img, addDays, longDay, minutes, robotLabel, shortDay, toast, useApi } from "../ui";
import { RecipePicker, type MealDto } from "../pickers";

interface WeekDto { start: string; today: string; days: string[]; meals: MealDto[]; times: { midi: string; soir: string } }

const nextLabel = (slot: "midi" | "soir") => (slot === "midi" ? "Aussi pour ce soir (restes)" : "Aussi pour demain midi (restes)");

function MealCard({ m, onChange, onPick }: { m: MealDto; onChange: () => void; onPick: () => void }) {
  if (m.leftoverOf) {
    const [d, s] = m.leftoverOf.split(":");
    return (
      <div class="meal left">
        <Img src={m.recipe.image} class="meal-img faded" />
        <div class="meal-body">
          <span class="cap">{m.slot} · restes</span>
          <b>{m.recipe.title}</b>
          <span class="muted small">Préparé {d === m.day ? "ce midi" : `${shortDay(d)} ${s}`}, rien à cuisiner</span>
        </div>
      </div>
    );
  }
  const toggleKeep = async () => {
    try { await api(`/api/meals/${m.day}/${m.slot}/keep`, { body: { on: !m.keepNext } }); onChange(); }
    catch (e) { toast((e as Error).message); }
  };
  const remove = async () => { await api(`/api/meals/${m.day}/${m.slot}`, { method: "DELETE" }); onChange(); };
  return (
    <div class="meal">
      <a href={`/recettes/${encodeURIComponent(m.recipe.id)}`}><Img src={m.recipe.image} class="meal-img" /></a>
      <div class="meal-body">
        <span class="cap">{m.slot}</span>
        <a class="meal-title" href={`/recettes/${encodeURIComponent(m.recipe.id)}`}>{m.recipe.title}</a>
        <span class="tags">{m.recipe.totalMinutes > 0 && <span class="tag">{minutes(m.recipe.totalMinutes)}</span>}<span class="tag">{robotLabel(m.recipe)}</span></span>
        <span class="meal-actions"><button class="btn2 sm" onClick={onPick}>Changer</button><button class="btn2 sm" onClick={remove}>Retirer</button></span>
        <button class={`keep ${m.keepNext ? "on" : ""}`} onClick={toggleKeep} aria-pressed={m.keepNext}>
          <span class="box">{m.keepNext && <Icon.check />}</span>{nextLabel(m.slot)}
        </button>
      </div>
    </div>
  );
}

export function Week({ me: _me, start }: { me: Me; start: string | null }) {
  const { data: w, reload } = useApi<WeekDto>(`/api/week${start ? `?start=${start}` : ""}`);
  const [sel, setSel] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ day: string; slot: "midi" | "soir" } | null>(null);
  if (!w) return <main class="page"><h1>Semaine</h1></main>;
  const day = sel && w.days.includes(sel) ? sel : w.days.includes(w.today) ? w.today : w.days[0];
  const planned = w.meals.length;
  const go = (n: number) => { setSel(null); navigate(`/semaine?du=${addDays(w.start, 7 * n)}`); };
  const pick = async (r: { id: string; title: string }) => {
    await api(`/api/meals/${picking!.day}/${picking!.slot}`, { method: "PUT", body: { recipeId: r.id } });
    setPicking(null); reload();
  };
  const slotView = (d: string, slot: "midi" | "soir") => {
    const m = w.meals.find((x) => x.day === d && x.slot === slot);
    return m
      ? <MealCard m={m} onChange={reload} onPick={() => setPicking({ day: d, slot })} />
      : <button class="meal empty" onClick={() => setPicking({ day: d, slot })}><span class="cap">{slot}</span><span class="add-ico"><Icon.plus /></span><span class="muted">Choisir un repas</span></button>;
  };
  return (
    <main class="page week">
      <header class="head">
        <div><p class="muted">{shortDay(w.days[0])} → {shortDay(w.days[6])} · {planned} repas sur 14</p><h1>Semaine</h1></div>
        <div class="row">
          <button class="round" aria-label="Semaine précédente" onClick={() => go(-1)}><Icon.back /></button>
          <button class="round" aria-label="Semaine suivante" onClick={() => go(1)}><Icon.next /></button>
          <a class="btn2" href={`/courses?du=${w.start}`}><Icon.cart />Courses</a>
        </div>
      </header>
      <div class="progress" aria-hidden="true"><span style={{ width: `${(planned / 14) * 100}%` }} /></div>

      {/* Téléphone : un jour à la fois. Grand écran : les 7 jours en colonnes. */}
      <div class="day-strip" role="tablist" aria-label="Jours">
        {w.days.map((d) => {
          const n = (["midi", "soir"] as const).map((s) => w.meals.find((x) => x.day === d && x.slot === s));
          return (
            <button role="tab" aria-selected={d === day} class={`day-tab ${d === day ? "on" : ""} ${d === w.today ? "today" : ""}`} onClick={() => setSel(d)}>
              <span>{shortDay(d).split(" ")[0]}</span><b>{d.slice(8).replace(/^0/, "")}</b>
              <span class="dots">{n.map((m) => <i class={m ? (m.leftoverOf ? "left" : "full") : ""} />)}</span>
            </button>
          );
        })}
      </div>
      <section class="day-one">
        <p class="cap">{day === w.today ? "Aujourd'hui · " : ""}{longDay(day)}</p>
        {slotView(day, "midi")}
        {slotView(day, "soir")}
      </section>

      <section class="week-cols">
        {w.days.map((d) => (
          <div class={`week-col ${d === w.today ? "today" : ""}`}>
            <p class="cap">{shortDay(d)}</p>
            {slotView(d, "midi")}
            {slotView(d, "soir")}
          </div>
        ))}
      </section>

      {picking && <RecipePicker title={`${longDay(picking.day)} · ${picking.slot}`} onPick={pick} onClose={() => setPicking(null)} />}
    </main>
  );
}
