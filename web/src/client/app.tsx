import { useEffect, useState } from "preact/hooks";
import { api } from "./api";
import { useLocation } from "./router";
import { Login } from "./pages/login";
import { AddRobot } from "./pages/add-robot";
import { Home } from "./pages/home";

export interface Me {
  user: { id: string; name: string; email: string; picture: string | null; household_id: string };
  household: { id: string; name: string; lunch_time: string; dinner_time: string };
  members: { id: string; name: string; picture: string | null }[];
  robots: { id: string; name: string; last_seen: number | null }[];
  prefs: { finished: number; action: number; meals: number };
  tokens: { label: string; created_at: number }[];
  vapidPublicKey: string;
}

export function App() {
  const loc = useLocation();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const reload = () => api<Me>("/api/me").then(setMe).catch(() => setMe(null));
  useEffect(() => { if (loc.pathname !== "/connexion") reload(); }, [loc.pathname === "/connexion"]);

  if (loc.pathname === "/connexion") return <Login next={loc.searchParams.get("next") ?? "/"} error={loc.searchParams.get("erreur")} />;
  if (me === undefined) return <div class="loading" aria-busy="true" />;
  if (me === null) return <Login next={loc.pathname + loc.search} error={null} />;
  if (loc.pathname === "/robot/ajouter") return <AddRobot me={me} code={loc.searchParams.get("code") ?? ""} onDone={reload} />;
  return <Home me={me} />;
}
