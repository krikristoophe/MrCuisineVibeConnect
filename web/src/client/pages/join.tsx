import { useState } from "preact/hooks";
import { api } from "../api";
import { useApi } from "../ui";

export function Join({ code, onDone }: { code: string; onDone: () => void }) {
  const { data: inv, error } = useApi<{ household: string; member: boolean }>(`/api/invite/${encodeURIComponent(code)}`);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState("");
  const join = async () => {
    setState("busy");
    try { const d = await api<{ household: string }>("/api/invite/accept", { body: { code } }); setMsg(`Vous faites maintenant partie de ${d.household}.`); setState("done"); onDone(); }
    catch (e) { setMsg((e as Error).message); setState("idle"); }
  };
  return (
    <main class="page narrow">
      <h1>Rejoindre un foyer</h1>
      <div class="panel pad stack">
        {error ? <><p class="error">{error}</p><a class="btn2" href="/">Aller à l'accueil</a></>
          : !inv ? <p class="muted">Chargement…</p>
          : inv.member || state === "done" ? <><p class="big">{msg || `Vous faites déjà partie de ${inv.household}.`}</p><a class="btn" href="/">Aller à l'accueil</a></>
          : <>
            <p class="big">Rejoindre <b>{inv.household}</b> ?</p>
            <p class="muted">Vous partagerez la semaine, les favoris et le robot de ce foyer. Vos repas actuels restent dans votre ancien foyer.</p>
            {msg && <p class="error">{msg}</p>}
            <button class="btn" disabled={state === "busy"} onClick={join}>Rejoindre {inv.household}</button>
          </>}
      </div>
    </main>
  );
}
