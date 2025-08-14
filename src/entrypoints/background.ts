/**
 * Background script orchestrating sidepanel coordination, site CSS lifecycle,
 * AI prompt flows (analyze/generate/chat), domain tracking, and broadcasts.
 */
import ExtMessage, {
  MessageFrom,
  MessageType,
  StyleSnapshot,
} from "@/entrypoints/types";
import {
  getSiteChatTranscript,
  getSiteEntry,
  setCachedModelAvailability,
  setSiteChatTranscript,
  setSiteEntry,
  type ChatMessage as StorageChatMessage,
} from "@/lib/storage";
import {
  SYSTEM_PROMPT_ANALYZE,
  SYSTEM_PROMPT_CUSTOM,
  SYSTEM_PROMPT_PRESET,
  buildAnalyzeThemePrompt,
  buildCustomThemePrompt,
  buildPresetThemePrompt,
} from "@/lib/system-prompt";
import { getRegistryThemeByName } from "@/lib/theme-registry";
import { browser } from "wxt/browser";

/**
 * Streaming chat sessions keyed by domain. Each session maintains its own LM state.
 */
const chatSessions: Record<string, any> = {};

/**
 * Tracks last known domain per tab to handle SPA navigations and early URL updates.
 */
const lastKnownDomainByTab = new Map<number, string>();

/**
 * Tracks last broadcasted domain per tab to avoid redundant emits.
 */
const lastBroadcastDomainByTab = new Map<number, string>();

/**
 * Tracks last broadcasted active domain when tabId is not resolved.
 */
let lastBroadcastActiveDomain: string = "";

/**
 * Throttle gate for model status checks.
 */
let lastModelStatusAt = 0;

/**
 * Cached last known availability to reduce LM status traffic.
 */
let lastModelAvailability:
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available" = "unavailable";

/**
 * Active sidepanel subscribers used to decide when to broadcast domain updates.
 */
const openSidepanelPorts = new Set<string>();
let modelStatusIntervalId: number | null = null;

/**
 * Entry point for background service worker.
 */
export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  (async () => {
    try {
      // @ts-ignore
      await browser.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch(() => {});
      try {
        const tabs = await browser.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        const tabId = tabs?.[0]?.id;
        if (typeof tabId === "number") await broadcastActiveDomainForTab(tabId);
        try {
          await probeAndBroadcastModelStatus(true);
        } catch {}
      } catch {}
    } catch (e) {
      console.error("Failed to apply side panel behavior", e);
    }
  })();

  /**
   * Monitor extension icon click (if supported) to open the sidepanel.
   */
  try {
    // @ts-ignore
    if (browser?.action?.onClicked?.addListener) {
      // @ts-ignore
      browser.action.onClicked.addListener(async (tab) => {
        try {
          // @ts-ignore
          await browser.sidePanel.open({ tabId: tab.id! }).catch(() => {});
        } catch (e) {
          console.error("action.onClicked failed", e);
        }
      });
    }
  } catch {}

  /**
   * Keep sidepanel in sync with the active tab domain via tab events.
   */
  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    await broadcastActiveDomainForTab(tabId);
    try {
      await probeAndBroadcastModelStatus(false);
    } catch {}
  });
  browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (typeof info.url === "string") {
      const d = extractDomain(info.url);
      if (d) lastKnownDomainByTab.set(tabId, d);
      else lastKnownDomainByTab.delete(tabId);
      if (tab?.active) await broadcastActiveDomainForTab(tabId);
    } else if (info.status === "complete") {
      await broadcastActiveDomainForTab(tabId);
    }
    try {
      await probeAndBroadcastModelStatus(false);
    } catch {}
  });
  try {
    // Some navigations (SPA) don't fire onUpdated with url; listen to webNavigation as a safety net
    // @ts-ignore
    browser.webNavigation?.onCommitted?.addListener?.(async (details: any) => {
      if (!details || typeof details.tabId !== "number") return;
      await broadcastActiveDomainForTab(details.tabId);
      try {
        await probeAndBroadcastModelStatus(false);
      } catch {}
    });
  } catch {}

  /**
   * Central message router for all extension messages.
   */
  browser.runtime.onMessage.addListener(
    async (
      message: ExtMessage,
      sender,
      sendResponse: (message: any) => void,
    ) => {
      const noisy: MessageType[] = [
        MessageType.requestModelStatus,
        MessageType.requestSiteCssStatus,
        MessageType.modelStatus,
        MessageType.siteCssStatus,
        MessageType.activeDomain,
      ];
      if (!noisy.includes(message.messageType)) {
        console.log("background:");
        console.log(message);
      }
      if (message.messageType === MessageType.changeUiTheme) {
        try {
          await browser.runtime.sendMessage(message as any);
        } catch {}
        return true;
      }
      if (
        message.messageType === MessageType.modelStatus &&
        (message as any)?.payload?.availability
      ) {
        try {
          await browser.runtime.sendMessage({
            messageType: MessageType.modelStatus,
            payload: { availability: (message as any).payload.availability },
          } as any);
          try {
            await setCachedModelAvailability({
              value: (message as any).payload.availability,
              at: Date.now(),
            });
          } catch {}
        } catch {}
        return true;
      }
      if ((message as any)?.from === MessageFrom.background) {
        return true;
      }
      /**
       * Extension icon clicked.
       */
      if (message.messageType === MessageType.clickExtIcon) {
        console.log(message);
        return true;
        /**
         * Theme change request from sidepanel; fan-out to active tabs.
         */
      } else if (message.messageType === MessageType.changeTheme) {
        let tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        console.log(`tabs:${tabs.length}`);
        if (tabs) {
          for (const tab of tabs) {
            await browser.tabs.sendMessage(tab.id!, message);
          }
        }
        /**
         * Apply CSS for a domain (user-accepted). Saves + injects immediately.
         */
      } else if (message.messageType === MessageType.setSiteCss) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        const css = message.payload?.css as string;
        if (domain && typeof css === "string") {
          await setSiteEntry(domain, { enabled: true, css });
          await broadcastToAll({
            ...message,
            from: MessageFrom.background,
          } as any);
          try {
            await injectCssIntoActiveDomainTabs(domain, css);
          } catch {}
        }
        /**
         * Preview only (no side effects). Used to show Apply button in UI.
         */
      } else if (message.messageType === MessageType.siteCssPreview) {
        await broadcastToAll({
          ...message,
          from: MessageFrom.background,
        } as any);
        /**
         * Enable previously saved CSS for a domain and inject it.
         */
      } else if (message.messageType === MessageType.enableSiteCss) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        if (domain) {
          const prev = (await getSiteEntry(domain)) || ({} as any);
          await setSiteEntry(domain, { ...prev, enabled: true });
          await broadcastToAll({
            ...message,
            from: MessageFrom.background,
          } as any);
          const css = String(prev?.css || "");
          if (css) {
            try {
              await injectCssIntoActiveDomainTabs(domain, css);
            } catch {}
          }
        }
        /**
         * Disable previously saved CSS for a domain and remove it from pages.
         */
      } else if (message.messageType === MessageType.disableSiteCss) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        if (domain) {
          const prev = (await getSiteEntry(domain)) || ({} as any);
          await setSiteEntry(domain, { ...prev, enabled: false });
          await broadcastToAll({
            ...message,
            from: MessageFrom.background,
          } as any);
          const css = String(prev?.css || "");
          if (css) {
            try {
              await removeCssFromActiveDomainTabs(domain, css);
            } catch {}
          }
        }
        /**
         * Generate a CSS theme for the current site. Sends preview only.
         */
      } else if (message.messageType === MessageType.generateSiteCss) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        let snapshot: StyleSnapshot | undefined = message.payload?.snapshot as
          | StyleSnapshot
          | undefined;
        if (!domain) return true;

        if (!snapshot) {
          const activeTabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          const active = activeTabs?.[0];
          if (active?.id) {
            await browser.tabs.sendMessage(active.id, {
              messageType: MessageType.extractSiteSnapshot,
              payload: { domain },
            });
            snapshot = await waitForSnapshot(domain, 5000);
          }
        }

        const currentEntry = (await getSiteEntry(domain)) || ({} as any);
        const siteStylesheet = currentEntry.css || "";

        let css = "";
        try {
          css = await generateCssWithLanguageModel(
            domain,
            snapshot,
            message.payload?.baseThemeName,
            message.payload?.prompt,
            siteStylesheet,
          );
        } catch (e) {
          console.error("LM generate failed, fallback to heuristic", e);
          css = fallbackCssFromSnapshot(snapshot);
        }

        if (css) {
          await broadcastToAll({
            messageType: MessageType.siteCssPreview,
            payload: { domain, css },
            from: MessageFrom.background,
          } as any);
        }
        /**
         * Analyze current site styles and propose a themed CSS. Sends preview only.
         */
      } else if (message.messageType === MessageType.analyzeSiteStyles) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        let snapshot: StyleSnapshot | undefined = message.payload?.snapshot as
          | StyleSnapshot
          | undefined;
        if (!domain) return true;

        if (!snapshot) {
          const activeTabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          const active = activeTabs?.[0];
          if (active?.id) {
            await browser.tabs.sendMessage(active.id, {
              messageType: MessageType.extractSiteSnapshot,
              payload: { domain },
            });
            snapshot = await waitForSnapshot(domain, 5000);
          }
        }

        const currentEntry = (await getSiteEntry(domain)) || ({} as any);
        const siteStylesheet = currentEntry.css || "";

        try {
          const anyGlobal: any = globalThis as any;
          const LanguageModel = anyGlobal?.LanguageModel;
          if (!LanguageModel)
            throw new Error("LanguageModel API not available");
          const availability = await LanguageModel.availability();
          if (availability === "unavailable")
            throw new Error("Model unavailable");
          const base = pickRegistryTheme(message.payload?.baseThemeName);
          const session = await LanguageModel.create({
            initialPrompts: [
              { role: "system", content: SYSTEM_PROMPT_ANALYZE },
            ],
          });
          const userPrompt = buildAnalyzeThemePrompt({
            domain,
            snapshot,
            baseTheme: base,
            notes: String(message.payload?.notes || ""),
            siteStylesheet,
          });
          const result = await session.prompt({
            role: "user",
            content: userPrompt,
          });
          session.destroy?.();
          const full = String(result || "");
          const analysis = full
            .replace(/^[\s\S]*?<analysis>/i, "")
            .replace(/<\/analysis>[\s\S]*$/i, "")
            .trim();
          const css = full
            .replace(/^[\s\S]*?<css>/i, "")
            .replace(/<\/css>[\s\S]*$/i, "")
            .trim();
          await broadcastToAll({
            messageType: MessageType.siteAnalysis,
            payload: { domain, analysis, css },
            from: MessageFrom.background,
          } as any);
        } catch (e) {
          await broadcastToAll({
            messageType: MessageType.siteAnalysis,
            payload: { domain, analysis: "Analysis failed", css: "" },
            from: MessageFrom.background,
          } as any);
        }
        /**
         * Query whether a domain has saved CSS and whether it's enabled.
         */
      } else if (message.messageType === MessageType.requestSiteCssStatus) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        if (domain) {
          const entry = (await getSiteEntry(domain)) || ({} as any);
          const enabled = Boolean(entry.enabled);
          const hasCss = typeof entry.css === "string" && entry.css.length > 0;
          const response = {
            messageType: MessageType.siteCssStatus,
            payload: { domain, enabled, hasCss },
          } as any;
          sendResponse(response);
          return true;
        }
        /**
         * Append a chat message to the site's chat transcript in storage.
         */
      } else if (message.messageType === MessageType.appendSiteChat) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        const msg = message.payload?.message;
        if (!domain || !msg) return true;
        const cur = await getSiteChatTranscript(domain);
        const next: StorageChatMessage[] = Array.isArray(cur)
          ? [...cur, msg as StorageChatMessage]
          : [msg as StorageChatMessage];
        await setSiteChatTranscript(domain, next);
        await broadcastToAll({
          messageType: MessageType.siteChat,
          payload: { domain, messages: next },
          from: MessageFrom.background,
        } as any);
        /**
         * Request the site's stored chat transcript.
         */
      } else if (message.messageType === MessageType.requestSiteChat) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        const cur = await getSiteChatTranscript(domain);
        const response = {
          messageType: MessageType.siteChat,
          payload: { domain, messages: Array.isArray(cur) ? cur : [] },
        } as any;
        sendResponse(response);
        await broadcastToAll({
          ...response,
          from: MessageFrom.background,
        } as any);
        return true;
        /**
         * Handle a chat prompt: stream assistant text and emit CSS preview if present.
         */
      } else if (message.messageType === MessageType.chatPrompt) {
        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        const userText = String(message.payload?.text || "");
        if (!domain || !userText) return true;
        try {
          const anyGlobal: any = globalThis as any;
          const LanguageModel = anyGlobal?.LanguageModel;
          if (!LanguageModel) {
            await browser.runtime.sendMessage({
              messageType: MessageType.chatResponse,
              payload: { domain, content: "Model unavailable", done: true },
            } as any);
            return true;
          }
          const availability = await LanguageModel.availability();
          if (availability !== "available") {
            await browser.runtime.sendMessage({
              messageType: MessageType.chatResponse,
              payload: { domain, content: `Model ${availability}`, done: true },
            } as any);
            return true;
          }
          if (!chatSessions[domain]) {
            chatSessions[domain] = await LanguageModel.create({
              initialPrompts: [
                { role: "system", content: SYSTEM_PROMPT_CUSTOM },
              ],
            });
          }
          const session = chatSessions[domain];

          const currentEntry = (await getSiteEntry(domain)) || ({} as any);
          const siteStylesheet = currentEntry.css || "";

          const prompt = buildCustomThemePrompt({
            domain,
            snapshot: null,
            siteStylesheet,
            userText,
          });

          let acc = "";
          const stream = session.promptStreaming({
            role: "user",
            content: prompt,
          });
          for await (const chunk of stream) {
            acc = String(chunk);
            await browser.runtime.sendMessage({
              messageType: MessageType.chatResponse,
              payload: { domain, content: acc, done: false },
              from: MessageFrom.background,
            } as any);
          }

          const cssMatch = acc.match(/<css>([\s\S]*?)<\/css>/i);
          if (cssMatch) {
            const css = cssMatch[1].trim();
            await browser.runtime.sendMessage({
              messageType: MessageType.siteCssPreview,
              payload: { domain, css },
              from: MessageFrom.background,
            } as any);
          }

          const cur = await getSiteChatTranscript(domain);
          const next: StorageChatMessage[] = Array.isArray(cur)
            ? [
                ...cur,
                { role: "assistant", content: acc } as StorageChatMessage,
              ]
            : [{ role: "assistant", content: acc } as StorageChatMessage];
          await setSiteChatTranscript(domain, next);
          await browser.runtime.sendMessage({
            messageType: MessageType.siteChat,
            payload: { domain, messages: next },
            from: MessageFrom.background,
          } as any);
          await browser.runtime.sendMessage({
            messageType: MessageType.chatResponse,
            payload: { domain, content: acc, done: true },
            from: MessageFrom.background,
          } as any);
          return true;
        } catch (e) {
          await browser.runtime.sendMessage({
            messageType: MessageType.chatResponse,
            payload: { domain, content: "Error", done: true },
            from: MessageFrom.background,
          } as any);
          return true;
        }
        /**
         * Lightweight, throttled model status probe used by sidepanel UI.
         */
      } else if (message.messageType === MessageType.requestModelStatus) {
        try {
          const anyGlobal: any = globalThis as any;
          const LanguageModel = anyGlobal?.LanguageModel;
          const now = Date.now();
          if (now - lastModelStatusAt > 2000) {
            lastModelStatusAt = now;
            let availability:
              | "unavailable"
              | "downloadable"
              | "downloading"
              | "available" = "unavailable";
            if (LanguageModel) {
              try {
                availability = await LanguageModel.availability();
              } catch {
                availability = "unavailable";
              }
            }
            lastModelAvailability = availability;
          }
          const response = {
            messageType: MessageType.modelStatus,
            payload: { availability: lastModelAvailability },
          } as any;
          sendResponse(response);
          return true;
        } catch (e) {
          const response = {
            messageType: MessageType.modelStatus,
            payload: { availability: "unavailable" },
          } as any;
          sendResponse(response);
          return true;
        }
        /**
         * Resolve the currently active domain for the requesting context.
         */
      } else if (message.messageType === MessageType.requestActiveDomain) {
        let d = "";
        try {
          const reqTabId = (message as any)?.payload?.tabId as
            | number
            | undefined;
          if (typeof reqTabId === "number") {
            const t = await browser.tabs.get(reqTabId);
            d = extractDomain(t?.url || "");
          }
        } catch {}
        if (!d) d = await getActiveTabDomain();
        const response = {
          messageType: MessageType.activeDomain,
          payload: { domain: d },
        } as any;
        sendResponse(response);
        return true;
        /**
         * Register a sidepanel subscription for domain broadcasts.
         */
      } else if (message.messageType === MessageType.sidepanelSubscribe) {
        const id = String(
          message?.payload?.id || sender?.tab?.id || sender?.url || Date.now(),
        );
        openSidepanelPorts.add(id);
        try {
          await probeAndBroadcastModelStatus(true);
        } catch {}
        if (!modelStatusIntervalId && openSidepanelPorts.size > 0) {
          modelStatusIntervalId = setInterval(
            () => void probeAndBroadcastModelStatus(false),
            15000,
          ) as unknown as number;
        }
        return true;
        /**
         * Unregister a sidepanel subscription.
         */
      } else if (message.messageType === MessageType.sidepanelUnsubscribe) {
        const id = String(
          message?.payload?.id || sender?.tab?.id || sender?.url || Date.now(),
        );
        openSidepanelPorts.delete(id);
        if (openSidepanelPorts.size === 0 && modelStatusIntervalId) {
          try {
            clearInterval(modelStatusIntervalId);
          } catch {}
          modelStatusIntervalId = null;
        }
        return true;
      }
    },
  );
});

/**
 * Broadcast a message to all tabs and runtime pages.
 */
async function broadcastToAll(message: ExtMessage) {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await browser.tabs.sendMessage(tab.id, message);
      } catch {}
    }
  }
  try {
    await browser.runtime.sendMessage(message as any);
  } catch {}
}

/**
 * Probes LanguageModel.availability with throttling and broadcasts if changed.
 */
async function probeAndBroadcastModelStatus(force: boolean): Promise<void> {
  try {
    const anyGlobal: any = globalThis as any;
    const LanguageModel = anyGlobal?.LanguageModel;
    const now = Date.now();
    if (!force && now - lastModelStatusAt <= 2000) return;
    lastModelStatusAt = now;
    let availability:
      | "unavailable"
      | "downloadable"
      | "downloading"
      | "available" = "unavailable";
    if (LanguageModel) {
      try {
        availability = await LanguageModel.availability();
      } catch {
        availability = "unavailable";
      }
    }
    if (availability !== lastModelAvailability) {
      lastModelAvailability = availability;
      await broadcastToAll({
        messageType: MessageType.modelStatus,
        payload: { availability },
      } as any);
      try {
        await setCachedModelAvailability({ value: availability, at: now });
      } catch {}
    }
  } catch {}
}

/**
 * Resolve the active http(s) domain using multiple fallbacks.
 */
async function getActiveTabDomain(): Promise<string> {
  try {
    let tabs = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    let tab = tabs?.[0];
    if (tab?.id) {
      const direct = extractDomain(tab.url || "");
      if (direct) return direct;
      const cached = lastKnownDomainByTab.get(tab.id);
      if (cached) return cached;
    }
    tabs = await browser.tabs.query({ active: true });
    for (const t of tabs) {
      const d = extractDomain(t.url || "");
      if (d) return d;
    }
    for (const [, d] of lastKnownDomainByTab) {
      if (d) return d;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Extract a hostname from a url if it is http(s), else empty string.
 */
function extractDomain(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.hostname || "";
  } catch {
    return "";
  }
}

/**
 * Broadcast active domain for a given tab, suppressing duplicates.
 */
async function broadcastActiveDomainForTab(
  tabId: number | undefined,
): Promise<void> {
  try {
    let domain = "";
    let resolvedTabId: number | undefined = tabId;
    if (typeof tabId === "number") {
      try {
        const tab = await browser.tabs.get(tabId);
        domain = extractDomain(tab?.url || "");
        if (!domain) {
          const cached = lastKnownDomainByTab.get(tabId);
          if (cached) domain = cached;
        } else {
          lastKnownDomainByTab.set(tabId, domain);
        }
      } catch {}
    } else {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        resolvedTabId = tabs?.[0]?.id;
      } catch {}
    }
    if (!domain) domain = await getActiveTabDomain();
    if (!domain) return;

    if (typeof resolvedTabId === "number") {
      const prev = lastBroadcastDomainByTab.get(resolvedTabId) || "";
      if (prev === domain) return;
      lastBroadcastDomainByTab.set(resolvedTabId, domain);
    } else {
      if (lastBroadcastActiveDomain === domain) return;
      lastBroadcastActiveDomain = domain;
    }

    if (openSidepanelPorts.size > 0) {
      await browser.runtime.sendMessage({
        messageType: MessageType.activeDomain,
        payload: { domain },
      } as any);
    }
  } catch {}
}

/**
 * Await a snapshot response for a domain, or resolve undefined on timeout.
 */
async function waitForSnapshot(
  domain: string,
  timeoutMs: number,
): Promise<StyleSnapshot | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(undefined);
      }
    }, timeoutMs);

    const listener = (msg: any) => {
      if (
        msg?.messageType === MessageType.siteSnapshotExtracted &&
        msg?.payload?.domain === domain
      ) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          browser.runtime.onMessage.removeListener(listener);
          resolve(msg.payload.snapshot as StyleSnapshot);
        }
      }
    };
    browser.runtime.onMessage.addListener(listener);
  });
}

/**
 * Generate a CSS theme using the built-in LanguageModel API with proper
 * system prompts and contextual inputs (snapshot, siteStylesheet, baseTheme).
 * Returns only the <css>...</css> contents.
 */
async function generateCssWithLanguageModel(
  domain: string,
  snapshot?: StyleSnapshot,
  baseThemeName?: string,
  userText?: string,
  siteStylesheet?: string,
): Promise<string> {
  const anyGlobal: any = globalThis as any;
  const LanguageModel = anyGlobal?.LanguageModel;
  if (!LanguageModel) throw new Error("LanguageModel API not available");

  const availability = await LanguageModel.availability();
  if (availability === "unavailable") throw new Error("Model unavailable");

  const base = pickRegistryTheme(baseThemeName);
  const system = base ? SYSTEM_PROMPT_PRESET : SYSTEM_PROMPT_CUSTOM;
  const prompt = base
    ? buildPresetThemePrompt({
        domain,
        snapshot,
        baseTheme: base,
        userText,
        siteStylesheet,
      })
    : buildCustomThemePrompt({ domain, snapshot, userText, siteStylesheet });

  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: system }],
  });
  const result = await session.prompt({ role: "user", content: prompt });
  session.destroy?.();
  const css = String(result || "")
    .replace(/^[\s\S]*?<css>/i, "")
    .replace(/<\/css>[\s\S]*$/i, "")
    .trim();
  if (!css) throw new Error("Empty CSS");
  return css;
}

/**
 * Look up a registry theme by name (case-insensitive); returns null if missing.
 */
function pickRegistryTheme(name?: string) {
  return getRegistryThemeByName(name);
}

/**
 * Minimal CSS fallback using snapshot data when LM is unavailable.
 */
function fallbackCssFromSnapshot(snapshot?: StyleSnapshot): string {
  const bg = snapshot?.computed?.bodyBg || "#111111";
  const fg = snapshot?.computed?.bodyColor || "#f5f5f5";
  const link = snapshot?.computed?.linkColor || "#4f46e5";
  const border = snapshot?.cssVariables?.["--border"] || "220 13% 91%";
  return `:root{--background:${bg};--foreground:${fg};--primary:${link};--primary-foreground:#ffffff;--border:${border}}\n.dark{--background:#0a0a0a;--foreground:#e5e7eb;--primary:${link};--primary-foreground:#111827;}`;
}

/**
 * CSS injection helpers (no content script required)
 */
async function injectCssIntoActiveDomainTabs(
  domain: string,
  css: string,
): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});
    const targets = tabs.filter((t) => (t?.url || "").includes(`://${domain}`));
    await Promise.all(
      targets.map((t) =>
        t.id
          ? browser.scripting
              .insertCSS?.({ target: { tabId: t.id }, css })
              .catch(() => {})
          : Promise.resolve(),
      ),
    );
  } catch {}
}

async function removeCssFromActiveDomainTabs(
  domain: string,
  css: string,
): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});
    const targets = tabs.filter((t) => (t?.url || "").includes(`://${domain}`));
    await Promise.all(
      targets.map((t) =>
        t.id
          ? browser.scripting
              .removeCSS?.({ target: { tabId: t.id }, css })
              .catch(() => {})
          : Promise.resolve(),
      ),
    );
  } catch {}
}
