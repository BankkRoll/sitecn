import {
  Message,
  ThreadMessage,
} from "@/components/sidepanel/home/chat/message";
import { CheckCircle2, Circle, CircleDotDashed } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const FEEDBACK = [
  "Generating",
  "Tweaking color tokens",
  "This might take some time",
  "Generating a good theme takes time",
  "Still working on your theme",
  "Almost there",
];

export function ChatMessages({
  items,
  generating,
  onApply,
}: {
  items: ThreadMessage[];
  generating: boolean;
  onApply?: (css: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [items.length]);
  useEffect(() => {
    if (!generating) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [generating]);
  const tip = useMemo(
    () => FEEDBACK[Math.min(Math.floor(elapsed / 8), FEEDBACK.length - 1)],
    [elapsed],
  );

  function ThinkingProgress({ seconds }: { seconds: number }) {
    const stages = [
      { key: "understand", label: "Understanding request" },
      { key: "scan", label: "Scanning page styles" },
      { key: "palette", label: "Generating palette" },
      { key: "tokens", label: "Mapping tokens" },
      { key: "contrast", label: "Verifying contrast" },
      { key: "finalize", label: "Finalizing" },
    ];
    const activeIndex = Math.min(Math.floor(seconds / 6), stages.length - 1);
    return (
      <div className="bg-card border-border/80 text-foreground rounded-md border shadow-sm">
        <div className="border-border/60 px-3 py-2 border-b">
          <div className="text-xs font-medium">Model thinking</div>
          <div className="text-muted-foreground text-[11px]">{tip}…</div>
        </div>
        <ul className="p-2 space-y-1">
          {stages.map((s, idx) => {
            const state =
              idx < activeIndex
                ? "done"
                : idx === activeIndex
                  ? "active"
                  : "pending";
            return (
              <li
                key={s.key}
                className="flex items-center gap-2 px-2 py-1 rounded"
              >
                <div className="w-4 h-4 flex justify-center items-center">
                  {state === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : state === "active" ? (
                    <CircleDotDashed className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Circle className="text-muted-foreground w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 text-xs">
                  <span
                    className={
                      state === "done"
                        ? "text-muted-foreground line-through"
                        : ""
                    }
                  >
                    {s.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full px-2 space-y-2 md:px-4">
      {items.map((m) => (
        <Message key={m.id} m={m} onApply={onApply} />
      ))}
      {generating && (
        <div className="mx-2 md:mx-0">
          <ThinkingProgress seconds={elapsed} />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
