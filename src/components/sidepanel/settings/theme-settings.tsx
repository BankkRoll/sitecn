import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageType } from "@/entrypoints/types";
import { getUiThemeName, setUiThemeName } from "@/lib/storage";
import {
  formatThemeName,
  getRegistryThemeSwatch,
  listRegistryThemes,
} from "@/lib/theme-registry";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";

export function ThemeSettings() {
  const { theme, toggleTheme } = useTheme();
  const [uiTheme, setUiTheme] = useState<string>("");
  const names = listRegistryThemes();
  const items = useMemo(
    () =>
      names
        .slice()
        .sort((a, b) =>
          formatThemeName(a).localeCompare(formatThemeName(b), undefined, {
            sensitivity: "base",
          }),
        )
        .map((n) => ({ name: n, sw: getRegistryThemeSwatch(n) })),
    [names],
  );

  useEffect(() => {
    (async () => {
      const v = await getUiThemeName();
      setUiTheme(v || "");
    })();
  }, []);

  return (
    <section className="text-foreground p-4 space-y-2">
      <div className="flex justify-between items-center">
        <div className="text-sm font-medium">Theme</div>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            const next = theme === "dark" ? "light" : "dark";
            toggleTheme(next as any);
            await browser.runtime.sendMessage({
              messageType: MessageType.changeTheme,
              content: next,
            } as any);
            await browser.storage.local.set({ theme: next });
          }}
        >
          {theme === "dark" ? <Moon /> : <Sun />}
        </Button>
      </div>
      <ScrollArea className="h-[30rem] rounded-md pr-2">
        <div className="grid grid-cols-1 gap-2 pr-2 md:grid-cols-2">
          <button
            className={`text-left px-2 py-1.5 rounded-md border ${uiTheme ? "text-muted-foreground" : "text-foreground"}`}
            onClick={async () => {
              setUiTheme("");
              await setUiThemeName("");
              await browser.runtime.sendMessage({
                messageType: MessageType.changeUiTheme,
                payload: { name: "" },
              } as any);
            }}
          >
            Default
          </button>
          {items.map(({ name, sw }) => (
            <button
              key={name}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${uiTheme === name ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
              title={name}
              onClick={async () => {
                setUiTheme(name);
                await setUiThemeName(name);
                await browser.runtime.sendMessage({
                  messageType: MessageType.changeUiTheme,
                  payload: { name },
                } as any);
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
              <span className="truncate">{formatThemeName(name)}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
