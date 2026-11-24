import { useEffect, useState } from "preact/hooks";

/** Petit routeur : chemins réels (/semaine, /recettes/:id…), liens interceptés. */
export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.dispatchEvent(new Event("cmx:nav"));
  window.scrollTo(0, 0);
}

export function useLocation(): URL {
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener("popstate", on);
    window.addEventListener("cmx:nav", on);
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target || e.metaKey || e.ctrlKey || e.button !== 0) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("/auth/") || href.startsWith("/mcp")) return;
      e.preventDefault();
      navigate(href);
    };
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener("cmx:nav", on);
      document.removeEventListener("click", click);
    };
  }, []);
  return new URL(location.href);
}
