import { useEffect, useState } from "preact/hooks";
import type { Me } from "../app";
import { Avatar } from "../app";
import { api } from "../api";
import { Icon, toast } from "../ui";
import { b64ToBytes, pushState, subscribePush, unsubscribePush } from "../push";

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button class={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Account({ me, onChange }: { me: Me; onChange: () => void }) {
  const [push, setPush] = useState<string>("…");
  const [invite, setInvite] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [name, setName] = useState(me.household.name);
  useEffect(() => { pushState().then(setPush); }, []);

  const pref = async (k: string, v: boolean) => { await api("/api/me/prefs", { method: "PATCH", body: { [k]: v } }); onChange(); };
  const saveHousehold = async (body: object) => { await api("/api/household", { method: "PATCH", body }); onChange(); toast("Enregistré"); };
  const makeInvite = async () => {
    const d = await api<{ url: string }>("/api/household/invite", { method: "POST" });
    setInvite(d.url);
    if (navigator.share) navigator.share({ title: "Claudimix", text: `Rejoins ${me.household.name} sur Claudimix`, url: d.url }).catch(() => {});
  };
  const renameRobot = async (id: string, old: string) => {
    const n = prompt("Nom du robot", old);
    if (n && n !== old) { await api(`/api/robots/${id}`, { method: "PATCH", body: { name: n } }); onChange(); }
  };
  const removeRobot = async (id: string, n: string) => {
    if (!confirm(`Retirer « ${n} » du foyer ? Il faudra l'appairer à nouveau.`)) return;
    await api(`/api/robots/${id}`, { method: "DELETE" }); onChange();
  };
  const enablePush = async () => {
    try { await subscribePush(b64ToBytes(me.vapidPublicKey)); setPush(await pushState()); toast("Notifications activées sur cet appareil"); }
    catch (e) { toast((e as Error).message); }
  };
  const logout = async () => { await api("/auth/logout", { method: "POST" }); location.href = "/connexion"; };

  return (
    <main class="page account">
      <header class="head"><div><p class="muted">{me.user.name} · {me.household.name}</p><h1>Mon compte et foyer</h1></div></header>
      <div class="account-grid">
        <div class="stack">
          <section class="stack-sm"><p class="cap">Foyer</p>
            <div class="panel pad-x">
              <label class="line"><span class="grow">Nom</span><input class="inline" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => name !== me.household.name && saveHousehold({ name })} /></label>
              <label class="line"><span class="grow">Heure du déjeuner</span><input class="inline time" type="time" value={me.household.lunch_time} onChange={(e) => saveHousehold({ lunchTime: (e.target as HTMLInputElement).value })} /></label>
              <label class="line"><span class="grow">Heure du dîner</span><input class="inline time" type="time" value={me.household.dinner_time} onChange={(e) => saveHousehold({ dinnerTime: (e.target as HTMLInputElement).value })} /></label>
            </div>
          </section>
          <section class="stack-sm"><p class="cap">Robots du foyer</p>
            <div class="panel pad-x">
              {me.robots.map((r) => (
                <div class="line"><span class="robot-ico sm"><Icon.robot /></span><span class="grow"><b>{r.name}</b><br /><span class="muted small">{r.last_seen && Date.now() - r.last_seen < 120_000 ? "En ligne" : "Hors ligne"}</span></span>
                  <button class="link" onClick={() => renameRobot(r.id, r.name)}>Renommer</button><button class="link danger" onClick={() => removeRobot(r.id, r.name)}>Retirer</button></div>
              ))}
              <p class="line muted small">Ajouter un robot : sur le robot, Réglages › Claudimix, puis scannez le QR code avec ce téléphone.</p>
            </div>
          </section>
          <section class="stack-sm"><p class="cap">Membres du foyer</p>
            <div class="panel pad-x">
              {me.members.map((m) => <div class="line"><span class="avatar sm">{m.picture ? <img src={m.picture} alt="" referrerpolicy="no-referrer" /> : m.name.slice(0, 1)}</span><span class="grow">{m.name}{m.id === me.user.id && <span class="muted"> · vous</span>}</span></div>)}
              <button class="line link" onClick={makeInvite}>Inviter quelqu'un</button>
              {invite && <p class="line small">Lien valable 7 jours : <a href={invite}>{invite}</a></p>}
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="stack-sm"><p class="cap">Notifications</p>
            <div class="panel pad-x">
              <div class="line"><span class="grow">Sur cet appareil</span>
                {push === "on" ? <button class="link" onClick={async () => { await unsubscribePush(); setPush(await pushState()); }}>Désactiver</button>
                  : push === "unsupported" ? <span class="muted small">Installez l'app sur l'écran d'accueil (iPhone) ou utilisez Chrome</span>
                  : push === "denied" ? <span class="muted small">Bloquées dans le navigateur</span>
                  : <button class="btn2 sm" onClick={enablePush}>Activer</button>}
              </div>
              <div class="line"><span class="grow">Cuisson terminée</span><Switch on={!!me.prefs.finished} label="Cuisson terminée" onChange={(v) => pref("finished", v)} /></div>
              <div class="line"><span class="grow">Action attendue sur le robot</span><Switch on={!!me.prefs.action} label="Action attendue sur le robot" onChange={(v) => pref("action", v)} /></div>
            </div>
          </section>
          <section class="stack-sm"><p class="cap">Compte</p>
            <div class="panel pad-x">
              <div class="line"><Avatar me={me} size={36} /><span class="grow">Connecté avec Google<br /><span class="muted small">{me.user.email}</span></span></div>
              <div class="line"><span class="grow">Accès pour un assistant IA (MCP)<br /><span class="muted small">{me.tokens.length ? `${me.tokens.length} jeton actif` : "Aucun jeton"}</span></span>
                <button class="link" onClick={async () => setToken((await api<{ token: string }>("/api/tokens", { body: { label: "Assistant IA" } })).token)}>Créer un jeton</button>
                {me.tokens.length > 0 && <button class="link danger" onClick={async () => { await api("/api/tokens", { method: "DELETE" }); setToken(""); onChange(); }}>Tout révoquer</button>}
              </div>
              {token && <p class="line small mono">Adresse : {location.origin}/mcp<br />Jeton (affiché une seule fois) : {token}</p>}
            </div>
          </section>
          <button class="btn2 danger-text" onClick={logout}>Se déconnecter</button>
        </div>
      </div>
    </main>
  );
}
