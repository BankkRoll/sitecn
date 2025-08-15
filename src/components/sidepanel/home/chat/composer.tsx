import { BaseThemePicker } from "@/components/sidepanel/home/chat/base-theme-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  prompt,
  onPromptChange,
  onSend,
  mode,
  onModeChange,
  baseThemeName,
  onChangeBaseTheme,
  themeNames,
  canSend,
  loading,
  readOnly,
}: {
  prompt: string;
  onPromptChange: (next: string) => void;
  onSend: () => void;
  mode: "base" | "preset" | "analyze";
  onModeChange: (next: "base" | "preset" | "analyze") => void;
  baseThemeName: string;
  onChangeBaseTheme: (next: string) => void;
  themeNames: string[];
  canSend: boolean;
  loading: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="w-full max-w-5xl mx-auto bg-background/60 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="p-2">
        <Label htmlFor="prompt" className="sr-only">
          Prompt
        </Label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!loading && canSend && !readOnly) {
                onSend();
              }
            }
          }}
          rows={3}
          placeholder={
            mode === "analyze"
              ? "Analyze site stylesheet…"
              : mode === "preset"
                ? "Choose a preset to start from…"
                : "Describe your theme…"
          }
          readOnly={!!readOnly}
          maxLength={2500}
          bottomPanel={
            <div className="flex justify-between items-center gap-2">
              <BaseThemePicker
                value={baseThemeName}
                onChange={onChangeBaseTheme}
                themeNames={themeNames}
                disabled={mode !== "preset"}
              />
              <Button
                onClick={onSend}
                size="sm"
                disabled={!canSend || !!loading}
                aria-label={loading ? "Processing" : "Send"}
              >
                {loading ? (
                  <div className="flex items-center gap-1" aria-label="Loading">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.2s]" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.1s]" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" />
                  </div>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
