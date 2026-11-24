import { useState } from "preact/hooks";
import { api } from "../api";

export function Join({ code, onDone }: { code: string; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState("");
  const join = async () => {
    setState("busy");
    try { const d = await api<{ household: string }>("/api/invite/accept", { body: { code } }); setMsg(`Vous avez rejoint ${d.household}.`); setState("done"); onDone(); }
    catch (e) { setMsg((e as Error).message); setState("idle"); }
  };
  return (
    <main class="page narrow">
      <h1>Rejoindre un foyer</h1>
      <div class="panel pad stack">
        {state === "done" ? <><p class="big">{msg}</p><a class="btn" href="/">Aller à l'accueil</a></> : <>
          <p>Vous allez partager la semaine, les favoris et le robot de ce foyer. Vos repas actuels restent dans votre ancien foyer.</p>
          {msg && <p class="error">{msg}</p>}
          <button class="btn" disabled={state === "busy"} onClick={join}>Rejoindre le foyer</button>
        </>}
      </div>
    </main>
  );
}
