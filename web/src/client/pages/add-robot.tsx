import { useState } from "preact/hooks";
import { api } from "../api";
import type { Me } from "../app";

/** Page ouverte en scannant le QR code affiché par le robot. */
export function AddRobot({ me, code, onDone }: { me: Me; code: string; onDone: () => void }) {
  const [value, setValue] = useState(code);
  const [name, setName] = useState("Robot de la cuisine");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const confirm = async (e: Event) => {
    e.preventDefault();
    setState("busy"); setError("");
    try {
      await api("/api/robots/pair/confirm", { body: { code: value, name } });
      setState("done");
      onDone();
    } catch (err) {
      setError((err as Error).message); setState("idle");
    }
  };
  return (
    <main class="page narrow">
      <h1>Ajouter un robot</h1>
      {state === "done" ? (
        <div class="panel pad">
          <p class="big">C'est fait : <b>{name}</b> fait maintenant partie de <b>{me.household.name}</b>.</p>
          <p class="muted">Le robot se relie tout seul dans quelques secondes.</p>
          <a class="btn" href="/">Aller à l'accueil</a>
        </div>
      ) : (
        <form class="panel pad stack" onSubmit={confirm}>
          <p class="muted">Ajouter ce robot au foyer <b>{me.household.name}</b>.</p>
          <label class="field"><span>Code affiché sur le robot</span>
            <input value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} autocapitalize="characters" required /></label>
          <label class="field"><span>Nom du robot</span>
            <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          {error && <p class="error">{error}</p>}
          <button class="btn" disabled={state === "busy"}>{state === "busy" ? "Ajout…" : "Ajouter au foyer"}</button>
        </form>
      )}
    </main>
  );
}
