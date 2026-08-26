import { useCallback, useEffect, useState } from "react";

/**
 * Theme preference with the three states a viewer can actually be in:
 * an explicit "light", an explicit "dark", or "system" — which stamps no
 * attribute at all and lets prefers-color-scheme decide. The explicit
 * choice always wins over the OS setting, in both directions, which is
 * what the stylesheet's `:root:not([data-theme="light"])` guard exists
 * for.
 *
 * The choice persists in localStorage, so it survives a reload and a
 * browser restart with no account involved. Every storage access is
 * wrapped: storage can be disabled or throw outright (private windows,
 * embedded webviews, blocked site data), and a theme toggle is never a
 * good enough reason to take the whole app down.
 */
export type ThemePref = "light" | "dark" | "system";

const KEY = "jssdm_theme_v1";

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable — fall through to the system default */
  }
  return "system";
}

function apply(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export function useTheme(): { pref: ThemePref; setPref: (p: ThemePref) => void; cycle: () => void; resolved: "light" | "dark" } {
  const [pref, setPrefState] = useState<ThemePref>(readStored);
  const [systemDark, setSystemDark] = useState(false);

  // Track the OS setting so the toggle can show what "system" currently
  // resolves to rather than a meaningless third icon.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    apply(pref);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* best-effort only — the in-memory choice still applies this session */
    }
  }, []);

  const resolved: "light" | "dark" = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  // The top-bar control is a single button, so it flips between explicit
  // light and explicit dark starting from whatever is currently showing.
  // "System" stays reachable from Settings rather than being a third stop
  // in a cycle nobody can predict.
  const cycle = useCallback(() => {
    setPref(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPref]);

  return { pref, setPref, cycle, resolved };
}
