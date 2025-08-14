import Header from "@/components/sidepanel/header";
import Sidebar, { SidebarType } from "@/components/sidepanel/sidebar";
import { useTheme } from "@/components/theme-provider";
import { EditorPage } from "@/entrypoints/sidepanel/views/editor";
import { Home } from "@/entrypoints/sidepanel/views/home";
import { InfoPage } from "@/entrypoints/sidepanel/views/info";
import { SettingsPage } from "@/entrypoints/sidepanel/views/settings";
import ExtMessage, { MessageType } from "@/entrypoints/types";
import { getSiteEntry } from "@/lib/storage";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import "@/entrypoints/main.css";

export default () => {
  const [sidebarType, setSidebarType] = useState<SidebarType>(SidebarType.home);
  const [headTitle, setHeadTitle] = useState("home");
  const { theme, toggleTheme } = useTheme();
  const [editorEnabled, setEditorEnabled] = useState(false);

  async function refreshEditorEnabled() {
    try {
      const resp = await browser.runtime.sendMessage({
        messageType: MessageType.requestActiveDomain,
        payload: {},
      } as any);
      const d = String(resp?.payload?.domain || "");
      if (!d) {
        setEditorEnabled(false);
        return;
      }
      const entry = await getSiteEntry(d);
      const hasCss = typeof entry?.css === "string" && entry.css.length > 0;
      setEditorEnabled(Boolean(hasCss));
    } catch {
      setEditorEnabled(false);
    }
  }

  useEffect(() => {
    const onMsg = (message: ExtMessage) => {
      if (message.messageType == MessageType.changeTheme) {
        const next =
          message.content === "light" || message.content === "dark"
            ? message.content
            : "dark";
        toggleTheme(next as any);
      } else if (message.messageType === MessageType.setSiteCss) {
        refreshEditorEnabled();
      } else if (
        message.messageType === MessageType.disableSiteCss ||
        message.messageType === MessageType.enableSiteCss
      ) {
        refreshEditorEnabled();
      } else if (message.messageType === MessageType.activeDomain) {
        refreshEditorEnabled();
      }
    };
    browser.runtime.onMessage.addListener(onMsg as any);

    return () => {
      try {
        browser.runtime.onMessage.removeListener(onMsg as any);
      } catch {}
    };
  }, []);

  useEffect(() => {
    refreshEditorEnabled();
  }, []);

  return (
    <div className={theme}>
      {
        <div className="fixed top-0 right-0 h-screen w-full bg-background z-[1000000000000] rounded-l-xl shadow-2xl">
          <Header headTitle={headTitle} />
          <Sidebar
            editorEnabled={editorEnabled}
            sideNav={(sidebarType: SidebarType) => {
              setSidebarType(sidebarType);
              setHeadTitle(sidebarType);
            }}
          />
          <main className="grid gap-4 p-0 pr-14 md:gap-8">
            {sidebarType === SidebarType.home && <Home />}
            {sidebarType === SidebarType.editor && <EditorPage />}
            {sidebarType === SidebarType.settings && <SettingsPage />}
            {sidebarType === SidebarType.info && <InfoPage />}
          </main>
        </div>
      }
    </div>
  );
};
