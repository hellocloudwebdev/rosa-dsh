import { useCallback, useEffect, useRef, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "rosa:theme";

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* private mode */
  }
  // Light is the documented default.
  return "light";
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("theme-dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");
  root.style.colorScheme = theme;
}

/**
 * Apply the stored theme immediately, before React renders.
 *
 * Called from main.tsx so a dark-theme user never sees a flash of the light
 * palette. Safe to call twice — `useTheme` re-applies on mount.
 */
export function applyStoredTheme(): void {
  apply(readStored());
}

/** Theme state, persisted per browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStored);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggle };
}

/* ------------------------------------------------------------------ */
/* Media query                                                          */
/* ------------------------------------------------------------------ */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/* ------------------------------------------------------------------ */
/* Debounced value                                                      */
/* ------------------------------------------------------------------ */

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/* ------------------------------------------------------------------ */
/* Latest callback ref                                                  */
/* ------------------------------------------------------------------ */

/** Keep a stable function reference that always sees fresh state. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/* ------------------------------------------------------------------ */
/* Focus trap helper                                                    */
/* ------------------------------------------------------------------ */

export function useClickOutside<T extends HTMLElement>(
  onOutside: () => void,
  enabled = true,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside, enabled]);
  return ref;
}
