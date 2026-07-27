import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "bhudrishti-theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
        applyThemeClass(saved);
      } else {
        // Default to dark theme for first-time users
        setThemeState("dark");
        applyThemeClass("dark");
      }
    } catch {
      applyThemeClass("dark");
    }
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyThemeClass(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore quota/storage errors
      }
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return { theme, setTheme, toggleTheme };
}

function applyThemeClass(t: Theme) {
  if (typeof document === "undefined") return;
  if (t === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}
