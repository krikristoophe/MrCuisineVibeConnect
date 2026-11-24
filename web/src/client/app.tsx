import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "./api";
import { useLocation } from "./router";
import { Icon } from "./ui";
import { Login } from "./pages/login";
import { AddRobot } from "./pages/add-robot";
import { Home } from "./pages/home";
import { Week } from "./pages/week";
import { Recipes } from "./pages/recipes";
import { Favorites } from "./pages/favorites";
import { RecipePage } from "./pages/recipe";
import { CookPage } from "./pages/cook";
import { Account } from "./pages/account";
import { Shopping } from "./pages/shopping";
import { Join } from "./pages/join";
import { Editor } from "./pages/editor";
import { HandsFree } from "./pages/hands-free";

export interface Me {
  user: { id: string; name: string; email: string; picture: string | null; household_id: string };
  household: { id: string; name: string; lunch_time: string; dinner_time: string };
  members: { id: string; name: string; picture: string | null }[];
  robots: { id: string; name: string; last_seen: number | null }[];
  prefs: { finished: number; action: number; meals: number };
  tokens: { label: string; created_at: number }[];
  vapidPublicKey: string;
}

const TABS = [
  { href: "/", label: "Accueil", icon: Icon.home, match: (p: string) => p === "/" || p === "/cuisson" },
  { href: "/semaine", label: "Semaine", icon: Icon.week, match: (p: string) => p.startsWith("/semaine") || p.startsWith("/courses") },
  { href: "/recettes", label: "Recettes", icon: Icon.book, match: (p: string) => p.startsWith("/recettes") },
  { href: "/favoris", label: "Favoris", icon: () => Icon.star(false), match: (p: string) => p.startsWith("/favoris") },
];

export function Avatar({ me, size = 44 }: { me: Me; size?: number }) {
  return me.user.picture
    ? <img class="avatar" src={me.user.picture} alt="" width={size} height={size} referrerpolicy="no-referrer" />
    : <span class="avatar" style={{ width: size, height: size }}>{me.user.name.slice(0, 1).toUpperCase()}</span>;
}

/** Barre d'onglets (téléphone), rail (tablette) ou menu latéral (ordinateur) : choisi en CSS. */
function Shell({ me, path, children }: { me: Me; path: string; children: ComponentChildren }) {
  return (
    <div class="shell">
      <nav class="nav" aria-label="Navigation">
        <a class="nav-logo" href="/">Claudimix</a>
        {TABS.map((t) => (
          <a class={`nav-item ${t.match(path) ? "on" : ""}`} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
            <t.icon /><span>{t.label}</span>
          </a>
        ))}
        <a class={`nav-me ${path === "/compte" ? "on" : ""}`} href="/compte" aria-label="Mon compte et foyer">
          <Avatar me={me} size={40} />
          <span class="nav-me-text"><b>{me.user.name}</b><span>{me.household.name}</span></span>
        </a>
      </nav>
      <div class="content">{children}</div>
    </div>
  );
}

export function App() {
  const loc = useLocation();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = () => api<Me>("/api/me").then(setMe).catch(() => setMe(null));
  const isLogin = loc.pathname === "/connexion";
  useEffect(() => { if (!isLogin) reload(); }, [isLogin]);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);

  if (isLogin) return <Login next={loc.searchParams.get("next") ?? "/"} error={loc.searchParams.get("erreur")} />;
  if (me === undefined) return <div class="loading" aria-busy="true" />;
  if (me === null) return <Login next={loc.pathname + loc.search} error={null} />;

  const p = loc.pathname;
  const recipeMatch = p.match(/^\/recettes\/([^/]+)(\/[a-z]+)?$/);
  let page;
  if (p === "/robot/ajouter") page = <AddRobot me={me} code={loc.searchParams.get("code") ?? ""} onDone={reload} />;
  else if (p === "/rejoindre") page = <Join code={loc.searchParams.get("code") ?? ""} onDone={reload} />;
  else if (p === "/semaine") page = <Week me={me} start={loc.searchParams.get("du")} />;
  else if (p === "/courses") page = <Shopping start={loc.searchParams.get("du")} />;
  else if (p === "/recettes/nouvelle") page = <Editor id={null} />;
  else if (recipeMatch && recipeMatch[2] === "/modifier") page = <Editor id={decodeURIComponent(recipeMatch[1])} />;
  else if (recipeMatch && recipeMatch[2] === "/cuisiner") return <HandsFree id={decodeURIComponent(recipeMatch[1])} />;
  else if (recipeMatch) page = <RecipePage me={me} id={decodeURIComponent(recipeMatch[1])} />;
  else if (p === "/recettes") page = <Recipes params={loc.searchParams} />;
  else if (p === "/favoris") page = <Favorites me={me} />;
  else if (p === "/cuisson") page = <CookPage me={me} />;
  else if (p === "/compte") page = <Account me={me} onChange={reload} />;
  else page = <Home me={me} />;
  return <Shell me={me} path={p}>{page}</Shell>;
}
