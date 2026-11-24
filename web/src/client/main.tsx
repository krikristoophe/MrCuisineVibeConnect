import { render } from "preact";
import { App } from "./app";
import "./styles.css";

// iOS ignore user-scalable=no : on bloque aussi le pincement et le double-tap.
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => { if ((e as TouchEvent).touches.length > 1) e.preventDefault(); }, { passive: false });

render(<App />, document.getElementById("app")!);
