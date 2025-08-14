import { createContext, useContext, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";

type ThemePreference = "light" | "dark";

const ThemeContext = createContext<{
  theme: string;
  toggleTheme: (pref: ThemePreference) => void;
}>({
  theme: "dark",
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: any }) => {
  const mqlRef = useRef<MediaQueryList | null>(null);
  const [preference, setPreference] = useState<ThemePreference>("dark");
  const [appliedTheme, setAppliedTheme] = useState<string>("dark");

  const computeApplied = (pref: ThemePreference): "light" | "dark" => {
    return pref;
  };

  const attachSystemListener = () => {
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mqlRef.current = mq;
      const onChange = () => {
        setAppliedTheme(computeApplied("dark"));
      };
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    } catch {
      return () => {};
    }
  };

  const toggleTheme = (pref: ThemePreference) => {
    setPreference(pref);
    const next = computeApplied(pref);
    setAppliedTheme(next);
    try {
      void browser.storage.local.set({ theme: pref });
    } catch {}
  };

  useEffect(() => {
    let detach: (() => void) | undefined;
    detach = attachSystemListener();
    return () => {
      try {
        detach?.();
      } catch {}
    };
  }, [preference]);

  useEffect(() => {
    (async () => {
      try {
        const data = await browser.storage.local.get("theme");
        const pref: ThemePreference =
          data?.theme === "light" || data?.theme === "dark"
            ? data.theme
            : "dark";
        setPreference(pref);
        setAppliedTheme(computeApplied(pref));
      } catch {
        setPreference("dark");
        setAppliedTheme("dark");
      }
    })();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: appliedTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
