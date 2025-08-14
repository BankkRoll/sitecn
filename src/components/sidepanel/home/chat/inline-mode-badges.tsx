import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatMode = "base" | "preset" | "analyze";

export function InlineModeBadges({
  className,
  mode,
  onModeChange,
}: {
  className?: string;
  mode: ChatMode;
  onModeChange: (next: ChatMode) => void;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        size="sm"
        variant="secondary"
        className={cn(
          `h-6 px-2 rounded-md text-xs ${mode === "base" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`,
        )}
        onClick={() => onModeChange("base")}
      >
        Base
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className={cn(
          `h-6 px-2 rounded-md text-xs ${mode === "preset" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`,
        )}
        onClick={() => onModeChange("preset")}
      >
        Preset
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className={cn(
          `h-6 px-2 rounded-md text-xs ${mode === "analyze" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`,
        )}
        onClick={() => onModeChange("analyze")}
      >
        Analyze
      </Button>
    </div>
  );
}
