import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { MessageType } from "@/entrypoints/types";
import { getUiThemeName } from "@/lib/storage";
import {
  ensureThemeRegistryInjected,
  getThemeClassName,
} from "@/lib/theme-registry";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { browser } from "wxt/browser";
import App from "./App.tsx";

ensureThemeRegistryInjected();

function UiThemeShell() {
  const [cls, setCls] = useState<string>("");
  const { theme } = useTheme();
  useEffect(() => {
    (async () => {
      try {
        const initial = await getUiThemeName();
        setCls(initial ? getThemeClassName(initial) : "");
      } catch {}
    })();
    (async () => {
      try {
        const anyGlobal: any = globalThis as any;
        const LanguageModel = anyGlobal?.LanguageModel;
        if (LanguageModel?.availability) {
          const availability = await LanguageModel.availability();
          await browser.runtime.sendMessage({
            messageType: MessageType.modelStatus,
            payload: { availability },
          } as any);
        }
      } catch {}
    })();
    const onMsg = (msg: any) => {
      if (msg?.messageType === MessageType.changeUiTheme) {
        const name = String(msg?.payload?.name || "");
        setCls(name ? getThemeClassName(name) : "");
      }
    };
    browser.runtime.onMessage.addListener(onMsg as any);
    const onVis = async () => {
      if (document.visibilityState === "visible") {
        try {
          const anyGlobal: any = globalThis as any;
          const LanguageModel = anyGlobal?.LanguageModel;
          if (LanguageModel?.availability) {
            const availability = await LanguageModel.availability();
            await browser.runtime.sendMessage({
              messageType: MessageType.modelStatus,
              payload: { availability },
            } as any);
          }
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      try {
        browser.runtime.onMessage.removeListener(onMsg as any);
      } catch {}
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
    };
  }, []);
  return (
    <div className={`${cls || getThemeClassName("modern-minimal")} ${theme}`}>
      <App />
      <Toaster />
    </div>
  );
}

try {
  const id = `sp-${Date.now()}`;
  browser.runtime
    .sendMessage({
      messageType: MessageType.sidepanelSubscribe,
      payload: { id },
    } as any)
    .catch(() => {});
  window.addEventListener("beforeunload", () => {
    browser.runtime
      .sendMessage({
        messageType: MessageType.sidepanelUnsubscribe,
        payload: { id },
      } as any)
      .catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      browser.runtime
        .sendMessage({
          messageType: MessageType.sidepanelUnsubscribe,
          payload: { id },
        } as any)
        .catch(() => {});
    } else {
      browser.runtime
        .sendMessage({
          messageType: MessageType.sidepanelSubscribe,
          payload: { id },
        } as any)
        .catch(() => {});
    }
  });
} catch {}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <UiThemeShell />
    </ThemeProvider>
  </React.StrictMode>,
);
