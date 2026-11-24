import { useEffect, useState } from "preact/hooks";
import { api } from "./api";

export interface RobotState {
  status: "idle" | "running" | "paused" | "finished" | "error";
  recipe?: { id?: string; title: string } | null;
  step?: { index: number; total: number; text: string; next?: string | null } | null;
  remainingSec?: number | null;
  tempC?: number | null;
  speed?: number | null;
  reverse?: boolean | null;
  weightG?: number | null;
  lidClosed?: boolean | null;
  action?: string | null;
  error?: string | null;
}
export interface Robot { id: string; name: string; last_seen: number | null; state: RobotState | null; updatedAt: number; online: boolean }

/** Robots du foyer et leur état, rafraîchis toutes les 3 s tant que la page est visible. */
export function useRobots(): Robot[] | undefined {
  const [robots, setRobots] = useState<Robot[]>();
  useEffect(() => {
    let live = true;
    const load = () => { if (!document.hidden) api<{ robots: Robot[] }>("/api/robots").then((d) => live && setRobots(d.robots)).catch(() => {}); };
    load();
    const t = setInterval(load, 3000);
    document.addEventListener("visibilitychange", load);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, []);
  return robots;
}

export const clock = (sec?: number | null) => (sec == null ? "" : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`);

export function statusLabel(r: Robot): string {
  if (!r.online) return "Hors ligne";
  switch (r.state?.status) {
    case "running": return "En cuisson";
    case "paused": return "En pause";
    case "finished": return "Cuisson terminée";
    case "error": return "Erreur";
    default: return "Libre";
  }
}

export async function sendToRobot(robotId: string, recipeId: string) {
  await api(`/api/robots/${robotId}/commands`, { body: { type: "open_recipe", recipeId } });
}
