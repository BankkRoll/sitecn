import {
  ChatThemePreview,
  ThemePreviewTokens,
} from "@/components/sidepanel/home/chat/theme-preview";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  css?: string;
  theme?: ThemePreviewTokens;
  createdAt: number;
  applied?: boolean;
};

export function Message({
  m,
  onApply,
}: {
  m: ThreadMessage;
  onApply?: (css: string) => void;
}) {
  const isAssistant = m.role === "assistant";
  const hasCss = !!m.css && !m.applied;

  return (
    <div
      className={cn(
        "w-full",
        isAssistant ? "flex justify-start" : "flex justify-end",
      )}
    >
      <div
        className={cn(
          "border-border/50 text-muted-foreground w-full mx-2 rounded-md border transition-colors md:w-fit",
          isAssistant ? "bg-muted/50" : "bg-accent/50",
        )}
      >
        {m.text ? (
          <div className="p-2 text-sm leading-6 whitespace-pre-wrap">
            {m.text}
          </div>
        ) : null}
        {m.theme ? (
          <div className="p-2">
            <ChatThemePreview tokens={m.theme} />
          </div>
        ) : null}
        {hasCss && onApply && (
          <div className="p-2">
            <button
              onClick={() => onApply(m.css!)}
              className="bg-primary text-primary-foreground w-full px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-primary/90"
            >
              Apply Theme
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
