import { useState } from "preact/hooks";
import type { Me } from "../app";
import { Avatar } from "../app";
import { Icon, Img, addDays, longDay, minutes, shortDay, toast, useApi } from "../ui";
import { clock, sendToRobot, statusLabel, useRobots, type Robot } from "../robot";
import type { MealDto } from "../pickers";

interface Dashboard {
  today: string;
  times: { midi: string; soir: string };
  next: (MealDto & { time: string; startBy: string | null; ingredients: { name: string; quantity: string }[] }) | null;
  meals: MealDto[];
}

function hello(): string {
  const h = new Date().getHours();
  return h < 5 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir";
}

function RobotCard({ r }: { r: Robot }) {
  const s = r.state;
  const cooking = r.online && (s?.status === "running" || s?.status === "paused");
  const pct = s?.step && s.step.total ? Math.round((s.step.index / s.step.total) * 100) : 0;
  return (
    <a class="panel robot-card" href="/cuisson" aria-label={`${r.name} : voir le détail`}>
      {cooking ? (
        <div class="ring" style={{ "--pct": pct } as any}><b>{clock(s?.remainingSec) || `${pct}%`}</b><span>restant</span></div>
      ) : <span class="robot-ico"><Icon.robot /></span>}
      <div class="robot-text">
        <span class={`status ${r.online ? (cooking ? "on" : "idle") : "off"}`}><i />{r.name} · {statusLabel(r)}</span>
        <b>{cooking || s?.status === "finished" ? s?.recipe?.title ?? "Cuisson" : r.online ? "Prêt à cuisiner" : "Le robot ne répond pas"}</b>
        {cooking && <span class="muted">{[s?.step ? `Étape ${s.step.index} sur ${s.step.total}` : "", s?.tempC ? `${s.tempC} °C` : "", s?.speed ? `vitesse ${s.speed}` : ""].filter(Boolean).join(" · ")}</span>}
        {s?.action && r.online && <span class="action">{s.action}</span>}
      </div>
      <Icon.next />
    </a>
  );
}

function NextMeal({ d, robot }: { d: Dashboard; robot?: Robot }) {
  const n = d.next!;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const label = n.day === d.today ? (n.slot === "midi" ? "Ce midi" : "Ce soir") : n.day === addDays(d.today, 1) ? (n.slot === "midi" ? "Demain midi" : "Demain soir") : `${longDay(n.day)} ${n.slot}`;
  const toggle = (k: string) => { const s = new Set(checked); s.has(k) ? s.delete(k) : s.add(k); setChecked(s); };
  return (
    <section class="next" aria-label={label}>
      <a class="next-hero" href={`/recettes/${encodeURIComponent(n.recipe.id)}`}>
        <Img src={n.recipe.image} class="next-img" />
        <span class="next-cap"><span>{label} · {n.time}{n.leftoverOf ? " · restes" : ""}</span><b>{n.recipe.title}</b></span>
      </a>
      {n.leftoverOf ? (
        <p class="panel pad muted">Restes du repas précédent : rien à cuisiner.</p>
      ) : (
        <>
          <div class="next-when">
            <div>{n.startBy && <><span class="muted">À lancer avant</span><b class="hour">{n.startBy}</b></>}
              {!n.startBy && <span class="muted">{minutes(n.recipe.totalMinutes)}</span>}</div>
            {n.recipe.usesRobot && robot ? (
              <button class="btn" onClick={async () => { await sendToRobot(robot.id, n.recipe.id); toast(`Recette envoyée à ${robot.name}`); }}>Envoyer au robot</button>
            ) : <a class="btn" href={`/recettes/${encodeURIComponent(n.recipe.id)}/cuisiner`}>Cuisiner</a>}
          </div>
          {n.ingredients.length > 0 && (
            <div class="panel checklist">
              <p class="cap">Sortir avant de commencer</p>
              {n.ingredients.map((i) => (
                <button class={`chk ${checked.has(i.name) ? "done" : ""}`} onClick={() => toggle(i.name)} aria-pressed={checked.has(i.name)}>
                  <span class="box">{checked.has(i.name) && <Icon.check />}</span><span class="grow">{i.name}</span><span class="muted">{i.quantity}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function Home({ me }: { me: Me }) {
  const { data: d } = useApi<Dashboard>("/api/dashboard");
  const robots = useRobots();
  const robot = robots?.[0];
  const days = d ? Array.from({ length: 4 }, (_, i) => addDays(d.today, i)) : [];
  return (
    <main class="page home">
      <header class="head">
        <div><p class="muted">{d ? longDay(d.today) : ""}</p><h1>{hello()}</h1></div>
        <a class="head-avatar" href="/compte" aria-label="Mon compte et foyer"><Avatar me={me} /></a>
      </header>
      <div class="home-grid">
        <div class="home-main">
          {robot ? <RobotCard r={robot} /> : robots && (
            <a class="panel robot-card" href="/compte"><span class="robot-ico"><Icon.robot /></span><div class="robot-text"><b>Ajouter le robot</b><span class="muted">Sur le robot : Réglages › Claudimix, puis scannez le QR code.</span></div><Icon.next /></a>
          )}
          {d?.next ? <NextMeal d={d} robot={robot} /> : d && (
            <a class="panel pad empty-next" href="/semaine"><b>Rien de prévu pour les prochains repas</b><span class="muted">Prévoir la semaine</span></a>
          )}
        </div>
        {d && (
          <section class="panel week-mini" aria-label="Cette semaine">
            <div class="row-between"><p class="cap">Prochains jours</p><a href="/semaine">Ouvrir la semaine</a></div>
            <div class="mini-grid" style={{ "--cols": days.length } as any}>
              <span />{days.map((x) => <span class={`mini-day ${x === d.today ? "today" : ""}`}>{x === d.today ? "Auj." : shortDay(x)}</span>)}
              {(["midi", "soir"] as const).map((slot) => (
                <>
                  <span class="mini-slot">{slot === "midi" ? "Midi" : "Soir"}</span>
                  {days.map((day) => {
                    const m = d.meals.find((x) => x.day === day && x.slot === slot);
                    return m
                      ? <a class="mini-cell" href={`/recettes/${encodeURIComponent(m.recipe.id)}`} title={m.recipe.title}><Img src={m.recipe.image} class={m.leftoverOf ? "faded" : ""} />{m.leftoverOf && <span class="tag-left">restes</span>}</a>
                      : <a class="mini-cell add" href="/semaine" aria-label={`${shortDay(day)} ${slot} : ajouter`}>+</a>;
                  })}
                </>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
