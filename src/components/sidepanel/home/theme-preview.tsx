import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useMemo } from "react";

export type ThemePreviewTokens = Record<string, string | undefined>;

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
      <div className="min-w-0 flex items-center gap-2 sm:gap-3">
        <div
          className="bg-muted border-border w-6 h-6 flex shrink-0 justify-center items-center text-xs border sm:w-8 sm:h-8"
          style={{ borderRadius: color }}
          title={color}
        >
          □
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate sm:text-sm">{label}</div>
          <div className="text-muted-foreground font-mono text-xs truncate">
            {color || "undefined"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex items-center gap-2 sm:gap-3">
      <div
        className="border-border w-6 h-6 shrink-0 rounded border sm:w-8 sm:h-8 sm:rounded-md"
        style={{ backgroundColor: color }}
        title={color}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate sm:text-sm">{label}</div>
        <div className="text-muted-foreground font-mono text-xs truncate">
          {color || "undefined"}
        </div>
      </div>
    </div>
  );
}

export function ChatThemePreview({
  lightTokens,
  darkTokens,
}: {
  lightTokens: ThemePreviewTokens;
  darkTokens: ThemePreviewTokens;
}) {
  const hasLightTokens = lightTokens && Object.keys(lightTokens).length > 0;
  const hasDarkTokens = darkTokens && Object.keys(darkTokens).length > 0;

  if (!hasLightTokens && !hasDarkTokens) {
    return null;
  }
  const lightDots = useMemo(() => {
    if (!hasLightTokens) return [];
    const keys = ["primary", "secondary", "accent", "background", "border"];
    return keys
      .map((k) => lightTokens[k])
      .filter((v) => v && v.startsWith("#")) as string[];
  }, [lightTokens, hasLightTokens]);

  const darkDots = useMemo(() => {
    if (!hasDarkTokens) return [];
    const keys = ["primary", "secondary", "accent", "background", "border"];
    return keys
      .map((k) => darkTokens[k])
      .filter((v) => v && v.startsWith("#")) as string[];
  }, [darkTokens, hasDarkTokens]);

  const lightTokenKeys = useMemo(
    () => (hasLightTokens ? Object.keys(lightTokens) : []),
    [lightTokens, hasLightTokens],
  );
  const darkTokenKeys = useMemo(
    () => (hasDarkTokens ? Object.keys(darkTokens) : []),
    [darkTokens, hasDarkTokens],
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="theme-tokens" className="border-b-0">
          <AccordionTrigger className="p-2 hover:no-underline">
            <div className="w-full min-w-0 flex justify-between items-center gap-3">
              <span className="text-sm font-medium">Theme Preview</span>
              <div className="text-muted-foreground flex flex-col shrink-0 items-center gap-3 text-xs sm:flex-row">
                {lightDots.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="hidden sm:inline">Light</span>
                    {lightDots.map((c, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-sm border"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                )}
                {darkDots.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="hidden sm:inline">Dark</span>
                    {darkDots.map((c, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-sm border"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {/* Single scroll area with side-by-side headers */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="text-muted-foreground text-sm font-medium">
                Light Mode
              </div>
              <div className="text-muted-foreground text-sm font-medium">
                Dark Mode
              </div>
            </div>

            {/* Single unified scroll area */}
            <div className="max-h-48 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {/* Light Mode Column */}
                <div className="pr-2 space-y-2">
                  {lightTokenKeys.map((key) => (
                    <Swatch
                      key={`light-${key}`}
                      color={lightTokens[key]}
                      label={key
                        .replace(/-/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                      isRadius={key === "radius"}
                    />
                  ))}
                </div>

                {/* Dark Mode Column */}
                <div className="pr-2 space-y-2">
                  {darkTokenKeys.map((key) => (
                    <Swatch
                      key={`dark-${key}`}
                      color={darkTokens[key]}
                      label={key
                        .replace(/-/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                      isRadius={key === "radius"}
                    />
                  ))}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
