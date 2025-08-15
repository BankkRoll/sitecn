import { Message, ThreadMessage } from "@/components/sidepanel/home/message";
import { ModelThinking } from "@/components/sidepanel/home/model-thinking";
import { useEffect, useRef, useState } from "react";

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

  return (
    <div className="mx-auto w-full space-y-2">
      {items.map((m) => (
        <Message key={m.id} m={m} onApply={onApply} />
      ))}
      {generating && <ModelThinking seconds={elapsed} />}
      <div ref={endRef} />
    </div>
  );
}
