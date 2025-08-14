import {
  DEFAULT_STARTER_SUGGESTIONS,
  sampleSuggestions,
} from "@/components/sidepanel/home/starter-suggestions";
import { useEffect, useState } from "react";

export function EmptyChat({
  onPick,
  items: externalItems,
  domain,
  mode,
}: {
  onPick: (text: string) => void;
  items?: string[];
  domain?: string;
  mode?: "base" | "preset" | "analyze";
}) {
  const [items, setItems] = useState<string[]>(externalItems ?? []);

  useEffect(() => {
    if (externalItems && externalItems.length > 0) {
      setItems(externalItems);
      return;
    }
    setItems(sampleSuggestions(DEFAULT_STARTER_SUGGESTIONS, 5));
  }, [externalItems]);

  const siteLabel = domain ? `https://${domain}` : undefined;

  return (
    <div className="max-w-2xl flex flex-col gap-10 pt-6 md:mx-auto md:justify-center">
      <div className="text-foreground text-xl font-semibold text-center">
        {mode === "analyze"
          ? "Analyze this site's stylesheet and generate a theme"
          : mode === "preset"
            ? "Pick a preset and describe adjustments to apply"
            : "What custom theme do you want to generate and import"}
        {siteLabel ? (
          <>
            {" "}
            into{" "}
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {siteLabel}
            </a>
            ?
          </>
        ) : (
          <> into this site?</>
        )}
      </div>
      <div className="mx-auto flex flex-col justify-center gap-1">
        {items.map((s, idx) => (
          <button
            key={idx}
            className="text-foreground w-full p-2 text-left rounded-md hover:bg-accent hover:text-accent-foreground"
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
