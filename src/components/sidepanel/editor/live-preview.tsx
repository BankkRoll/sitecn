import {
  ChatThemePreview,
  ThemePreviewTokens,
} from "@/components/sidepanel/home/chat/theme-preview";

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

export function LivePreview({ css }: { css: string }) {
  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <div className="mb-2 text-sm font-medium">Live Preview</div>
      <ChatThemePreview tokens={tokensFromCss(css)} />
    </div>
  );
}
