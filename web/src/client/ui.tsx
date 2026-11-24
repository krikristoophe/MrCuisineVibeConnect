import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "./api";

/* ---------- Icônes (traits, couleur du texte) ---------- */
const P = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
export const Icon = {
  home: () => <svg width="22" height="22" viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>,
  week: () => <svg width="22" height="22" viewBox="0 0 24 24" {...P} aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>,
  book: () => <svg width="22" height="22" viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z" /><path d="M12 6v14" /></svg>,
  star: (filled = false) => <svg width="22" height="22" viewBox="0 0 24 24" {...P} fill={filled ? "currentColor" : "none"} aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>,
  back: () => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>,
  next: () => <svg width="20" height="20" viewBox="0 0 24 24" {...P} stroke-width="2.2" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>,
  dots: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>,
  search: () => <svg width="20" height="20" viewBox="0 0 24 24" {...P} aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5 5" /></svg>,
  close: () => <svg width="18" height="18" viewBox="0 0 24 24" {...P} stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  plan: () => <svg width="20" height="20" viewBox="0 0 24 24" {...P} aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M12 13v5M9.5 15.5h5" /></svg>,
  cart: () => <svg width="20" height="20" viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M5 7h14l-1.5 12h-11z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>,
  robot: () => <svg width="20" height="20" viewBox="0 0 24 24" {...P} aria-hidden="true"><rect x="4" y="9" width="16" height="11" rx="3" /><path d="M2 11h2M20 11h2M7 6h10M12 3.5V6" /></svg>,
  plus: () => <svg width="22" height="22" viewBox="0 0 24 24" {...P} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  check: () => <svg width="16" height="16" viewBox="0 0 24 24" {...P} stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>,
};

/* ---------- Formats ---------- */
export function minutes(m: number): string {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const SHORT_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });
export const longDay = (d: string) => DAY_FMT.format(new Date(d + "T00:00:00Z"));
export const shortDay = (d: string) => SHORT_FMT.format(new Date(d + "T00:00:00Z"));
export function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function ago(ms: number | null): string {
  if (!ms) return "jamais";
  const days = Math.floor((Date.now() - ms) / 86400_000);
  if (days < 1) return "aujourd'hui";
  if (days < 2) return "hier";
  if (days < 14) return `il y a ${days} jours`;
  if (days < 60) return `il y a ${Math.round(days / 7)} sem.`;
  return `il y a ${Math.round(days / 30)} mois`;
}

/* ---------- Composants ---------- */
export function Img({ src, alt = "", class: cls, style }: { src: string | null; alt?: string; class?: string; style?: string }) {
  if (!src) return <span class={`img-ph ${cls ?? ""}`} style={style} aria-hidden="true"><Icon.book /></span>;
  return <img src={src} alt={alt} class={cls} style={style} loading="lazy" referrerpolicy="no-referrer" />;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.classList.add("noscroll");
    return () => { window.removeEventListener("keydown", k); document.body.classList.remove("noscroll"); };
  }, []);
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head"><h2>{title}</h2><button class="round" aria-label="Fermer" onClick={onClose}><Icon.close /></button></div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Menu({ items, label = "Plus d'options" }: { items: { label: string; danger?: boolean; onClick: () => void }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    setTimeout(() => document.addEventListener("click", close, { once: true }));
    return () => document.removeEventListener("click", close);
  }, [open]);
  return (
    <div class="menu-wrap">
      <button class="round" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><Icon.dots /></button>
      {open && <div class="menu" role="menu">{items.map((it) => <button role="menuitem" class={it.danger ? "danger" : ""} onClick={it.onClick}>{it.label}</button>)}</div>}
    </div>
  );
}

let toastTimer = 0;
export function toast(text: string) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = text; el.className = "show";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el!.className = ""), 2600);
}

/** Charge une ressource de l'API ; `reload` la recharge. */
export function useApi<T>(path: string | null, deps: unknown[] = []): { data: T | undefined; error: string; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then((d) => live && (setData(d), setError(""))).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [path, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

export interface RecipeSummary { id: string; title: string; image: string | null; totalMinutes: number; rating: number; ratingCount: number; category: string; usesRobot: boolean; devices?: string[]; favorite?: boolean }

/** « Au robot » = faisable sur le Connect ; les recettes d'autres modèles ne sont pas « sans robot ». */
export function robotLabel(r: { usesRobot: boolean; devices?: string[] }): string {
  return r.usesRobot || r.devices?.length ? "Au robot" : "Sans robot";
}

export function RecipeCard({ r }: { r: RecipeSummary }) {
  return (
    <a class="card" href={`/recettes/${encodeURIComponent(r.id)}`}>
      <Img src={r.image} class="card-img" />
      <span class="card-title">{r.title}</span>
      <span class="card-meta">{[r.ratingCount ? `★ ${r.rating.toFixed(1).replace(".", ",")}` : "", minutes(r.totalMinutes), robotLabel(r) === "Sans robot" ? "sans robot" : ""].filter(Boolean).join(" · ")}</span>
      {r.favorite && <span class="card-fav" aria-label="Favori">{Icon.star(true)}</span>}
    </a>
  );
}
