import { BaseThemePicker } from "@/components/sidepanel/home/chat/base-theme-picker";
import { Button } from "@/components/ui/button";

export type ChatMode = "base" | "preset" | "analyze";

export function ModeBar({
  mode,
  onModeChange,
  baseThemeName,
  onChangeBaseTheme,
  themeNames,
}: {
  mode: ChatMode;
  onModeChange: (next: ChatMode) => void;
  baseThemeName: string;
  onChangeBaseTheme: (next: string) => void;
  themeNames: string[];
}) {
  return (
    <div className="border-t bg-background/80 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-wrap items-center gap-2 px-6 py-2">
        <div className="text-muted-foreground text-xs">Modes</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === "base" ? "default" : "secondary"}
            onClick={() => onModeChange("base")}
          >
            Chat – Base
          </Button>
          <Button
            size="sm"
            variant={mode === "preset" ? "default" : "secondary"}
            onClick={() => onModeChange("preset")}
          >
            Chat – Start with Theme
          </Button>
          <Button
            size="sm"
            variant={mode === "analyze" ? "default" : "secondary"}
            onClick={() => onModeChange("analyze")}
          >
            Analyze
          </Button>
        </div>

        {mode === "preset" && (
          <div className="ml-auto">
            <BaseThemePicker
              value={baseThemeName}
              onChange={onChangeBaseTheme}
              themeNames={themeNames}
            />
          </div>
        )}
      </div>
    </div>
  );
}
