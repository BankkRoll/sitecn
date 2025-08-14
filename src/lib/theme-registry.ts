const REGISTRY_URL = "https://tweakcn.com/r/registry.json";

type ThemeRegistry = { items?: ThemeItem[] } | null;
let cachedRegistry: ThemeRegistry = null;
let lastFetchAt = 0;
const FETCH_TTL_MS = 1000 * 60 * 60 * 24;

type ThemeItem = {
  name: string;
  cssVars?: {
    theme?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
};

function getCachedItems(): ThemeItem[] {
  const items: ThemeItem[] = Array.isArray((cachedRegistry as any)?.items)
    ? ((cachedRegistry as any).items as ThemeItem[])
    : [];
  return items;
}

async function fetchThemeRegistry(force: boolean = false): Promise<void> {
  try {
    const now = Date.now();
    if (!force && cachedRegistry && now - lastFetchAt < FETCH_TTL_MS) return;
    const res = await fetch(REGISTRY_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Registry HTTP ${res.status}`);
    const json = await res.json();
    cachedRegistry = json as ThemeRegistry;
    lastFetchAt = now;
    tryUpdateInjectedStyle();
  } catch (e) {
    // On failure, keep existing cache (if any); don't throw
  }
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildVarsBlock(
  vars: Record<string, string> | undefined,
  themeVars: Record<string, string> | undefined,
): string {
  const lines: string[] = [];
  if (themeVars) {
    for (const [k, v] of Object.entries(themeVars)) {
      lines.push(`  --${k}: ${convertForCssVariable(v)};`);
    }
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      lines.push(`  --${k}: ${convertForCssVariable(v)};`);
    }
  }
  return lines.join("\n");
}

function buildClass(name: string, item: ThemeItem): string {
  const themeVars = item.cssVars?.theme ?? {};
  const lightVars = item.cssVars?.light ?? {};
  const darkVars = item.cssVars?.dark ?? {};
  const cls = `.theme-${name}`;
  const base = `${cls} {\n${buildVarsBlock(lightVars, themeVars)}\n}`;
  const dark = `.dark ${cls}, ${cls}.dark {\n${buildVarsBlock(darkVars, themeVars)}\n}`;
  return base + "\n" + dark;
}

function renderRegistryCss(items: ThemeItem[]): string {
  const cssParts: string[] = [];
  for (const item of items) {
    if (!item || !item.name || !item.cssVars) continue;
    const name = sanitizeName(item.name);
    cssParts.push(buildClass(name, item));
  }
  return cssParts.join("\n\n");
}

function tryUpdateInjectedStyle(): void {
  if (typeof document === "undefined") return;
  const id = "sitecn-tweakcn-theme-registry";
  const style = (document.getElementById(id) as HTMLStyleElement) || null;
  if (!style) return;
  style.textContent = renderRegistryCss(getCachedItems());
}

export function ensureThemeRegistryInjected(): void {
  if (typeof document === "undefined") return;
  const id = "sitecn-tweakcn-theme-registry";
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.documentElement.appendChild(style);
  }
  style.textContent = renderRegistryCss(getCachedItems());
  void fetchThemeRegistry().catch(() => {});
}

export function getThemeClassName(rawName: string): string {
  return `theme-${sanitizeName(rawName)}`;
}

export function listRegistryThemes(): string[] {
  try {
    const items = getCachedItems();
    return items.filter((it) => it && it.name).map((it) => it.name);
  } catch {
    return [];
  }
}

export function getRegistryThemeSwatch(name: string): {
  primary?: string;
  accent?: string;
  secondary?: string;
  border?: string;
} {
  try {
    const items = getCachedItems();
    const nm = name.toLowerCase().trim();
    const match = items.find(
      (it) => (it?.name || "").toLowerCase().trim() === nm,
    );
    if (!match) return {};
    const themeVars = match.cssVars?.theme ?? {};
    const lightVars = match.cssVars?.light ?? {};
    const pick = (k: string) =>
      (lightVars[k] ?? themeVars[k]) as string | undefined;
    const toColor = (val?: string) =>
      val ? normalizeToColorString(val) : undefined;
    return {
      primary: toColor(pick("primary")),
      accent: toColor(pick("accent")),
      secondary: toColor(pick("secondary")),
      border: toColor(pick("border")),
    };
  } catch {
    return {};
  }
}

export function getRegistryThemeByName(name?: string): {
  name: string;
  cssVars: {
    theme?: Record<string, string>;
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
} | null {
  try {
    if (!name) return null;
    const items = getCachedItems();
    const nm = name.toLowerCase().trim();
    const match = items.find(
      (it) => (it?.name || "").toLowerCase().trim() === nm,
    );
    if (!match) return null;
    return { name: match.name, cssVars: match.cssVars ?? {} };
  } catch {
    return null;
  }
}

void fetchThemeRegistry().catch(() => {});

function convertForCssVariable(value: string): string {
  const v = String(value || "").trim();
  if (/^oklch\(/i.test(v)) {
    const hsl = oklchToHslTriplet(v);
    return hsl || v;
  }
  return v;
}

function normalizeToColorString(value: string): string {
  const v = String(value || "").trim();
  if (/^oklch\(/i.test(v)) {
    const triplet = oklchToHslTriplet(v);
    return triplet ? `hsl(${triplet})` : v;
  }
  if (/^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(v)) {
    return `hsl(${v})`;
  }
  return v;
}

function oklchToHslTriplet(oklch: string): string | null {
  try {
    const parsed = parseOklch(oklch);
    if (!parsed) return null;
    const [r, g, b] = oklchToSrgb(parsed.L, parsed.C, parsed.h);
    const { h, s, l } = rgbToHsl(r, g, b);
    return `${round(h, 2)} ${round(s * 100, 2)}% ${round(l * 100, 2)}%`;
  } catch {
    return null;
  }
}

function parseOklch(input: string): { L: number; C: number; h: number } | null {
  const s = input
    .trim()
    .replace(/^oklch\(/i, "")
    .replace(/\)$/i, "")
    .trim();
  const parts = s.split(/[\s\/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const L = parseFloat(parts[0]);
  const C = parseFloat(parts[1]);
  const h = parseFloat(parts[2]);
  if (!isFinite(L) || !isFinite(C) || !isFinite(h)) return null;
  return { L, C, h };
}

function oklchToSrgb(
  L: number,
  C: number,
  hDeg: number,
): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  r = linearToSrgb(r);
  g = linearToSrgb(g);
  b2 = linearToSrgb(b2);
  return [clamp01(r), clamp01(g), clamp01(b2)];
}

function linearToSrgb(x: number): number {
  return x <= 0
    ? 0
    : x >= 1
      ? 1
      : x <= 0.0031308
        ? 12.92 * x
        : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function round(x: number, dp: number): number {
  const p = Math.pow(10, dp);
  return Math.round(x * p) / p;
}

export function formatThemeName(name: string): string {
  try {
    const withSpaces = name
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
    return withSpaces
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  } catch {
    return name;
  }
}
