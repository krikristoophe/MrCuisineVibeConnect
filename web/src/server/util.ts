export const now = () => Date.now();

export function randomId(bytes = 16): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return b64url(b);
}

/** Code lisible (sans 0/O, 1/I) pour l'appairage et les invitations. */
export function humanCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
}

export function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return b64url(d);
}

/** Date du jour (AAAA-MM-JJ) à Paris. */
export function parisDay(ms = Date.now()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine qui contient `day`. */
export function mondayOf(day: string): string {
  const d = new Date(day + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** Texte sans accents ni casse, pour la recherche. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
