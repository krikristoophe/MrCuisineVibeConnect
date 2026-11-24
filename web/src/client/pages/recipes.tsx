import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";
import { navigate } from "../router";
import { Icon, Menu, RecipeCard, useApi, type RecipeSummary } from "../ui";

const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "robot", label: "Au robot" },
  { key: "sans", label: "Sans robot" },
  { key: "rapide", label: "30 min max" },
];

export function Recipes({ params }: { params: URLSearchParams }) {
  const [q, setQ] = useState(params.get("q") ?? "");
  const filter = params.get("filtre") ?? "";
  const category = params.get("categorie") ?? "";
  const [list, setList] = useState<RecipeSummary[]>([]);
  const [more, setMore] = useState(false);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const { data: cats } = useApi<{ categories: string[] }>("/api/recipes/categories");

  const load = async (offset: number) => {
    loading.current = true;
    const u = new URLSearchParams({ q, filter, category, offset: String(offset), limit: "40" });
    try {
      const d = await api<{ recipes: RecipeSummary[] }>(`/api/recipes?${u}`);
      setList((old) => (offset ? [...old, ...d.recipes] : d.recipes));
      setMore(d.recipes.length === 40);
    } finally { loading.current = false; }
  };
  // Scroll infini : la page suivante se charge quand le bas de la liste approche.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading.current) load(list.length);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, list.length]);
  useEffect(() => { const t = setTimeout(() => load(0), q ? 200 : 0); return () => clearTimeout(t); }, [q, filter, category]);

  const setParam = (k: string, v: string) => {
    const u = new URLSearchParams(params);
    if (v) u.set(k, v); else u.delete(k);
    if (q) u.set("q", q); else u.delete("q");
    navigate(`/recettes${u.toString() ? "?" + u : ""}`, true);
  };

  return (
    <main class="page">
      <header class="head">
        <div><p class="muted">Communes à tous les foyers</p><h1>Recettes</h1></div>
        <Menu items={[{ label: "Nouvelle recette", onClick: () => navigate("/recettes/nouvelle") }]} />
      </header>
      <label class="search"><Icon.search /><input type="search" placeholder="Recette, ingrédient…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Rechercher une recette" /></label>
      <div class="chips">
        {FILTERS.map((f) => <button class={`chip ${filter === f.key && !category ? "sel" : ""}`} onClick={() => { setParam("categorie", ""); setParam("filtre", f.key); }}>{f.label}</button>)}
        {cats?.categories.slice(0, 14).map((c) => <button class={`chip ${category === c ? "sel" : ""}`} onClick={() => setParam("categorie", category === c ? "" : c)}>{c}</button>)}
      </div>
      <div class="cards">{list.map((r) => <RecipeCard r={r} />)}</div>
      {!list.length && <p class="muted">Aucune recette ne correspond.</p>}
      {more && <div ref={sentinel} class="sentinel" aria-hidden="true" />}
    </main>
  );
}
