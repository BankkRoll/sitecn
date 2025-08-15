import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatThemeName, getRegistryThemeSwatch } from "@/lib/theme-registry";
import { useEffect, useMemo, useRef, useState } from "react";

export function BaseThemePicker({
  value,
  onChange,
  themeNames,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  themeNames: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const sortedNames = useMemo(() => {
    return [...themeNames].sort((a, b) =>
      formatThemeName(a).localeCompare(formatThemeName(b), undefined, {
        sensitivity: "base",
      }),
    );
  }, [themeNames]);

  const filteredNames = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedNames;
    return sortedNames.filter((n) => n.toLowerCase().includes(q));
  }, [sortedNames, query]);

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        disabled={!!disabled}
        aria-disabled={!!disabled}
        title={disabled ? "Enable Preset mode to choose a theme" : undefined}
      >
        {value ? formatThemeName(value) : "Custom"}
      </Button>
      {open && !disabled && (
        <div className="bg-card text-card-foreground w-64 h-80 absolute left-0 bottom-full z-50 flex flex-col mb-1 rounded-md border shadow-md">
          <div className="px-2 py-2">
            <div className="text-muted-foreground flex justify-between mb-2 text-xs">
              <div>Select a preset</div>
              <div>{themeNames.length} presets</div>
            </div>
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search themes…"
              className="w-full rounded-md border bg-background text-foreground px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Separator />
          <div className="p-1">
            <button
              className="w-full text-left px-2 py-1.5 rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground text-sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Custom
            </button>
          </div>
          <Separator />
          <ScrollArea className="min-h-0 flex-1 pr-2">
            <div className="p-1">
              {filteredNames.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No results
                </div>
              ) : (
                filteredNames.map((name) => {
                  const sw = getRegistryThemeSwatch(name);
                  return (
                    <button
                      key={name}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground text-sm"
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded-sm border"
                          style={{ backgroundColor: sw.primary }}
                        />
                        <span
                          className="w-3 h-3 rounded-sm border"
                          style={{ backgroundColor: sw.accent }}
                        />
                        <span
                          className="w-3 h-3 rounded-sm border"
                          style={{ backgroundColor: sw.secondary }}
                        />
                        <span
                          className="w-3 h-3 rounded-sm border"
                          style={{ backgroundColor: sw.border }}
                        />
                      </span>
                      <span>{formatThemeName(name)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
          <Separator />
          <div className="px-2 py-2 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Themes powered by </span>
            <a
              href="https://tweakcn.com/?utm_source=sitecn-extension"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground inline-flex items-center gap-1 align-middle hover:text-foreground/80"
              title="tweakcn"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                className="w-3.5 h-3.5"
                aria-hidden
              >
                <path fill="none" d="M0 0h256v256H0z"></path>
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="24"
                  d="m208 128-.2.2M168.2 167.8 128 208M192 40l-76.2 76.2M76.2 155.8 40 192"
                ></path>
                <circle
                  cx="188"
                  cy="148"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="24"
                ></circle>
                <circle
                  cx="96"
                  cy="136"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="24"
                ></circle>
              </svg>
              <span className="font-semibold">tweakcn</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
