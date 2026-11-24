export interface Machine { program?: string; seconds?: number; speed?: number; tempC?: number; reverse?: boolean; pulses?: number }
export interface Step { text: string; machine?: Machine; weigh?: { grams?: number } }
export interface Ingredient { qty?: string; unit?: string; name: string; note?: string }
export interface Recipe {
  id: string; title: string; category?: string; tags?: string[]; servings?: number; servingUnit?: string;
  prepMinutes?: number; totalMinutes?: number; image?: string | null; rating?: number; ratingCount?: number; notes?: string;
  ingredients?: { group?: string; items: Ingredient[] }[]; steps?: Step[];
}

export function duration(sec?: number): string {
  if (!sec) return "";
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

const PROGRAMS: Record<string, string> = { varoma: "Varoma", petrir: "Pétrir", "pétrir": "Pétrir", turbo: "Turbo", mijoter: "Mijoter", rissoler: "Rissoler", fermenter: "Fermenter", cuisson_lente: "Cuisson lente", sousvide: "Sous vide" };

/** Réglages du robot d'une étape, en petites étiquettes. */
export function machineTags(m?: Machine): string[] {
  if (!m) return [];
  const t: string[] = [];
  if (m.program && m.program !== "manuel") t.push(PROGRAMS[m.program] ?? m.program);
  if (m.seconds) t.push(duration(m.seconds));
  if (m.tempC) t.push(`${m.tempC} °C`);
  if (m.speed) t.push(`vit. ${m.speed}`);
  if (m.pulses) t.push(`${m.pulses} impulsions`);
  if (m.reverse) t.push("sens inverse");
  return t;
}

export function qty(i: Ingredient): string {
  return [i.qty, i.unit].filter(Boolean).join(" ");
}
