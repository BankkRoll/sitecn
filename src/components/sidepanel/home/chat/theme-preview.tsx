import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useMemo, useState } from "react";

export type ThemePreviewTokens = Record<string, string | undefined>;

type TokenItem = { key: string; label: string };

function Swatch({
  color,
  label,
  isRadius = false,
}: {
  color?: string;
  label: string;
  isRadius?: boolean;
}) {
  if (isRadius) {
    return (
      <div className="flex items-center gap-3">
        <div
          className="bg-muted border-border w-8 h-8 flex shrink-0 justify-center items-center text-xs border"
          style={{ borderRadius: color }}
          title={color}
        >
          □
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-muted-foreground font-mono text-xs truncate">
            {color || "undefined"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className="border-border w-8 h-8 shrink-0 rounded-md border"
        style={{ backgroundColor: color }}
        title={color}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-muted-foreground font-mono text-xs truncate">
          {color || "undefined"}
        </div>
      </div>
    </div>
  );
}

export function ChatThemePreview({ tokens }: { tokens: ThemePreviewTokens }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const dots = useMemo(() => {
    const keys = ["primary", "secondary", "accent", "background", "border"];
    return keys.map((k) => tokens[k]).filter(Boolean) as string[];
  }, [tokens]);

  const allTokens = useMemo(() => {
    return Object.keys(tokens);
  }, [tokens]);

  return (
    <div className={`rounded-md border ${isDarkMode ? "dark" : ""}`}>
      <div className="flex justify-between items-center px-3 py-2 border-b">
        <div className="text-sm font-medium">Theme Preview</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {dots.map((c, i) => (
              <span
                key={i}
                className="w-2 h-2 inline-block rounded-sm border"
                style={{ backgroundColor: c as string }}
                title={c}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-8 h-8 p-0"
            title={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="theme-tokens">
          <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
            <div className="w-full flex justify-between items-center">
              <span>Theme Tokens</span>
              <span className="text-muted-foreground mr-2 text-xs">
                {allTokens.length} tokens
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <div className="max-h-36 overflow-y-auto grid gap-2">
              {allTokens.map((key) => (
                <Swatch
                  key={key}
                  color={tokens[key]}
                  label={key
                    .replace(/-/g, " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                  isRadius={key === "radius"}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
