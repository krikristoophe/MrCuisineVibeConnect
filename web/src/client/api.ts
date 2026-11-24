export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 401 && !location.pathname.startsWith("/connexion")) {
    location.href = "/connexion?next=" + encodeURIComponent(location.pathname + location.search);
  }
  if (!res.ok) throw new HttpError(res.status, data.error ?? "Erreur réseau");
  return data as T;
}
