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

function useUiThemeClass(): string {
  const [uiThemeClass, setUiThemeClass] = useState<string>("");
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const initial = await getUiThemeName();
        if (!disposed)
          setUiThemeClass(initial ? getThemeClassName(initial) : "");
      } catch {}
    })();
    const onMsg = (msg: any) => {
      if (msg?.messageType === MessageType.changeUiTheme) {
        const name = String(msg?.payload?.name || "");
        setUiThemeClass(name ? getThemeClassName(name) : "");
      }
    };
    try {
      browser.runtime.onMessage.addListener(onMsg as any);
    } catch {}
    return () => {
      disposed = true;
      try {
        browser.runtime.onMessage.removeListener(onMsg as any);
      } catch {}
    };
  }, []);
  return uiThemeClass;
}

function useModelAvailabilityReporter(): void {
  useEffect(() => {
    let disposed = false;
    const report = async () => {
      try {
        const anyGlobal: any = globalThis as any;
        const LanguageModel = anyGlobal?.LanguageModel;
        if (LanguageModel?.availability) {
          const availability = await LanguageModel.availability();
          if (!disposed) {
            await browser.runtime.sendMessage({
              messageType: MessageType.modelStatus,
              payload: { availability },
            } as any);
          }
        }
      } catch {}
    };
    void report();
    const onVis = () => {
      if (document.visibilityState === "visible") void report();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
    };
  }, []);
}

function useSidepanelPresence(): void {
  useEffect(() => {
    const id = `sp-${Date.now()}`;
    try {
      browser.runtime
        .sendMessage({
          messageType: MessageType.sidepanelSubscribe,
          payload: { id },
        } as any)
        .catch(() => {});
    } catch {}
    const onBeforeUnload = () => {
      try {
        browser.runtime
          .sendMessage({
            messageType: MessageType.sidepanelUnsubscribe,
            payload: { id },
          } as any)
          .catch(() => {});
      } catch {}
    };
    const onVis = () => {
      try {
        const messageType =
          document.visibilityState === "hidden"
            ? MessageType.sidepanelUnsubscribe
            : MessageType.sidepanelSubscribe;
        browser.runtime
          .sendMessage({ messageType, payload: { id } } as any)
          .catch(() => {});
      } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      try {
        window.removeEventListener("beforeunload", onBeforeUnload);
      } catch {}
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
    };
  }, []);
}

function SidepanelRoot() {
  const { theme } = useTheme();
  const uiThemeClass = useUiThemeClass();
  useModelAvailabilityReporter();
  useSidepanelPresence();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const containerClass = `${
    uiThemeClass || getThemeClassName("modern-minimal")
  } ${theme} transition-[opacity,background-color,color,border-color,text-decoration-color,fill,stroke] duration-300 ease-in-out ${
    mounted ? "opacity-100" : "opacity-0"
  }`;
  return (
    <div className={containerClass}>
      <App />
      <Toaster />
    </div>
  );
}

(function initSidepanelPresence() {
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
      const messageType =
        document.visibilityState === "hidden"
          ? MessageType.sidepanelUnsubscribe
          : MessageType.sidepanelSubscribe;
      browser.runtime
        .sendMessage({ messageType, payload: { id } } as any)
        .catch(() => {});
    });
  } catch {}
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SidepanelRoot />
    </ThemeProvider>
  </React.StrictMode>,
);
