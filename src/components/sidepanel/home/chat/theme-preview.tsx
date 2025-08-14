import { useMemo, useState } from "react";

export type ThemePreviewTokens = Record<string, string | undefined>;

type TokenItem = { key: string; label: string };

const DEFAULT_GROUPS: { title: string; items: TokenItem[] }[] = [
  {
    title: "Brand",
    items: [
      { key: "primary", label: "Primary" },
      { key: "secondary", label: "Secondary" },
      { key: "accent", label: "Accent" },
      { key: "ring", label: "Ring" },
    ],
  },
  {
    title: "Surfaces",
    items: [
      { key: "background", label: "Background" },
      { key: "foreground", label: "Foreground" },
      { key: "card", label: "Card" },
      { key: "card-foreground", label: "Card FG" },
      { key: "popover", label: "Popover" },
      { key: "popover-foreground", label: "Popover FG" },
      { key: "muted", label: "Muted" },
      { key: "muted-foreground", label: "Muted FG" },
      { key: "destructive", label: "Destructive" },
      { key: "destructive-foreground", label: "Destructive FG" },
    ],
  },
  {
    title: "UI",
    items: [
      { key: "border", label: "Border" },
      { key: "input", label: "Input" },
    ],
  },
];

function Swatch({ color, label }: { color?: string; label: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className="w-12 h-8 mt-1 rounded-md border"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function ChatThemePreview({ tokens }: { tokens: ThemePreviewTokens }) {
  const [expanded, setExpanded] = useState(true);
  const dots = useMemo(() => {
    const keys = ["primary", "secondary", "accent", "background", "border"];
    return keys.map((k) => tokens[k]).filter(Boolean) as string[];
  }, [tokens]);
  return (
    <div className="rounded-md border">
      <div className="flex justify-between items-center px-3 py-2">
        <div className="text-sm font-medium">Preview</div>
        <div className="flex items-center gap-1">
          {dots.map((c, i) => (
            <span
              key={i}
              className="w-2 h-2 inline-block rounded-sm border"
              style={{ backgroundColor: c as string }}
            />
          ))}
        </div>
        <button
          className="text-muted-foreground text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
      {expanded && (
        <div className="grid gap-4 p-3 text-sm text-left">
          {DEFAULT_GROUPS.map((group) => {
            const present = group.items.filter((it) => tokens[it.key]);
            if (present.length === 0) return null;
            return (
              <div key={group.title} className="grid grid-cols-2 gap-4">
                {present.map((it) => (
                  <Swatch
                    key={it.key}
                    color={tokens[it.key] as string | undefined}
                    label={it.label}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
