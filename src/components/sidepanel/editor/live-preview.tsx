import {
  ChatThemePreview,
  ThemePreviewTokens,
} from "@/components/sidepanel/home/theme-preview";

export function tokensFromCss(input: string): ThemePreviewTokens {
  try {
    const root = /:root\s*{([\s\S]*?)}/.exec(input)?.[1] || "";
    const vars: Record<string, string> = {};
    root.replace(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g, (_, k, v) => {
      vars[k] = String(v).trim();
      return "";
    });
    return vars as ThemePreviewTokens;
  } catch {
    return {} as ThemePreviewTokens;
  }
}

export function tokensFromCssEnhanced(input: string): {
  light: ThemePreviewTokens;
  dark: ThemePreviewTokens;
} {
  try {
    const root = /:root\s*{([\s\S]*?)}/.exec(input)?.[1] || "";
    const lightVars: Record<string, string> = {};
    root.replace(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g, (_, k, v) => {
      lightVars[k] = String(v).trim();
      return "";
    });

    const dark = /\.dark\s*{([\s\S]*?)}/.exec(input)?.[1] || "";
    const darkVars: Record<string, string> = {};
    dark.replace(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g, (_, k, v) => {
      darkVars[k] = String(v).trim();
      return "";
    });

    const finalDarkVars =
      Object.keys(darkVars).length > 0 ? darkVars : lightVars;

    return {
      light: lightVars as ThemePreviewTokens,
      dark: finalDarkVars as ThemePreviewTokens,
    };
  } catch {
    return {
      light: {} as ThemePreviewTokens,
      dark: {} as ThemePreviewTokens,
    };
  }
}

export function LivePreview({ css }: { css: string }) {
  const tokens = tokensFromCssEnhanced(css);

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <div className="mb-2 text-sm font-medium">Live Preview</div>
      <ChatThemePreview lightTokens={tokens.light} darkTokens={tokens.dark} />
    </div>
  );
}
