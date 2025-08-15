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
import { buildThemePrompt } from "@/lib/system-prompt";
import { getRegistryThemeByName } from "@/lib/theme-registry";
import { browser } from "wxt/browser";

// Enhanced error handling types
class SnapshotExtractionError extends Error {
  constructor(
    message: string,
    public domain: string,
    public tabId?: number,
  ) {
    super(message);
    this.name = "SnapshotExtractionError";
  }
}

/**
 * Streaming chat sessions keyed by domain. Each session maintains its own LM state.
 */
interface LanguageModelSession {
  prompt: (input: { role: string; content: string }) => Promise<string>;
  promptStreaming: (input: {
    role: string;
    content: string;
  }) => AsyncIterable<string>;
  destroy?: () => void;
}

const chatSessions: Record<string, LanguageModelSession> = {};

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
type ModelAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";
let lastModelAvailability: ModelAvailability = "unavailable";

/**
 * Active sidepanel subscribers used to decide when to broadcast domain updates.
 */
const openSidepanelPorts = new Set<string>();
let modelStatusIntervalId: number | null = null;

/**
 * Race condition prevention and resource management
 */
// Track ongoing snapshot extractions to prevent duplicates
const ongoingExtractions = new Map<
  string,
  Promise<StyleSnapshot | undefined>
>();

// Track active tabs to handle tab closure during operations
const activeTabs = new Set<number>();

// Track theme generation operations by domain
const ongoingGenerations = new Map<string, Promise<void>>();

// Cleanup for orphaned operations
const operationTimeouts = new Map<string, NodeJS.Timeout>();

// Model session cleanup tracking
const activeModelSessions = new Map<string, any>();

// Tab lifecycle management
browser.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  lastKnownDomainByTab.delete(tabId);
  lastBroadcastDomainByTab.delete(tabId);

  // Cleanup any ongoing operations for this tab
  cleanupTabOperations(tabId);
});

browser.tabs.onCreated.addListener((tab) => {
  if (tab.id) {
    activeTabs.add(tab.id);
  }
});

// Initialize active tabs
(async () => {
  try {
    const tabs = await browser.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) activeTabs.add(tab.id);
    });
  } catch {}
})();

function cleanupTabOperations(tabId: number) {
  // Find and cleanup operations related to this tab
  const domain = lastKnownDomainByTab.get(tabId);
  if (domain) {
    // Cancel ongoing extractions
    ongoingExtractions.delete(domain);
    ongoingGenerations.delete(domain);

    // Clear timeouts
    const extractionKey = `extraction_${domain}`;
    const generationKey = `generation_${domain}`;

    if (operationTimeouts.has(extractionKey)) {
      clearTimeout(operationTimeouts.get(extractionKey)!);
      operationTimeouts.delete(extractionKey);
    }

    if (operationTimeouts.has(generationKey)) {
      clearTimeout(operationTimeouts.get(generationKey)!);
      operationTimeouts.delete(generationKey);
    }

    // Cleanup model sessions
    const sessionKey = domain;
    if (activeModelSessions.has(sessionKey)) {
      try {
        const session = activeModelSessions.get(sessionKey);
        session?.destroy?.();
      } catch {}
      activeModelSessions.delete(sessionKey);
    }
  }
}

// Enhanced CORS fetch with timeout and abort controller
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-cache",
      mode: "cors",
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
       * Handle ping messages from content scripts for connection testing
       */
      if ((message as any).messageType === "ping") {
        // Simple ping response - content script is alive
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
         * Generate a theme for the current site. Handles base, preset, and analyze modes.
         */
      } else if (message.messageType === MessageType.generateTheme) {
        console.log("🚀 === THEME GENERATION FLOW START ===");
        console.log("📥 1. RECEIVED generateTheme request:", {
          mode: message.payload?.mode,
          domain: message.payload?.domain,
          prompt: message.payload?.prompt,
          hasBaseTheme: !!message.payload?.baseThemeName,
          timestamp: new Date().toISOString(),
        });

        let domain = message.payload?.domain as string;
        if (!domain) domain = await getActiveTabDomain();
        let snapshot: StyleSnapshot | undefined = message.payload?.snapshot as
          | StyleSnapshot
          | undefined;
        const mode = message.payload?.mode || "base";

        console.log("🎯 2. DOMAIN RESOLUTION:", { domain, mode });

        if (!domain) {
          console.log("❌ 3. EARLY EXIT: No domain found");
          return true;
        }

        if (!snapshot) {
          console.log("📷 3. SNAPSHOT EXTRACTION NEEDED for:", domain);
          try {
            snapshot = await extractSnapshotWithRetry(domain, 3);
            console.log("✅ 4. SNAPSHOT EXTRACTION SUCCESS:", {
              domain,
              hasSnapshot: !!snapshot,
              snapshotSize: snapshot ? Object.keys(snapshot).length : 0,
            });
          } catch (error) {
            console.error("❌ 4. SNAPSHOT EXTRACTION FAILED:", {
              domain,
              error: error instanceof Error ? error.message : String(error),
              errorType:
                error instanceof Error ? error.constructor.name : typeof error,
            });

            const errorMessage =
              error instanceof Error ? error.message : String(error);
            await broadcastToAll({
              messageType: MessageType.themeGenerated,
              payload: {
                domain,
                css: "",
                error: `Failed to analyze site styles: ${errorMessage}`,
              },
              from: MessageFrom.background,
            } as any);
            console.log("📤 5. ERROR RESPONSE SENT to UI");
            return true;
          }
        } else {
          console.log("✅ 3. SNAPSHOT PROVIDED:", {
            domain,
            snapshotKeys: Object.keys(snapshot),
          });
        }

        // For analyze mode, we only need fresh site data, not stored themes
        const siteStylesheet =
          mode === "analyze" ? "" : (await getSiteEntry(domain))?.css || "";
        console.log("📄 6. SITE STYLESHEET DECISION:", {
          domain,
          mode,
          usingStoredCSS: mode !== "analyze",
          stylesheetLength: siteStylesheet.length,
        });

        try {
          console.log("🤖 7. INITIALIZING AI MODEL...");
          const anyGlobal: any = globalThis as any;
          const LanguageModel = anyGlobal?.LanguageModel;
          if (!LanguageModel) {
            throw new Error("LanguageModel API not available");
          }

          const availability = await LanguageModel.availability();
          console.log("🔍 8. AI MODEL STATUS:", { availability });
          if (availability === "unavailable") {
            throw new Error("Model unavailable");
          }

          console.log("🎨 9. BUILDING THEME PROMPT...");
          const base = pickRegistryTheme(message.payload?.baseThemeName);
          console.log("🏷️ 10. BASE THEME RESOLVED:", {
            baseThemeName: message.payload?.baseThemeName,
            hasBaseTheme: !!base,
          });

          console.log("📊 11. SNAPSHOT DATA ANALYSIS:", {
            domain,
            hasSnapshot: !!snapshot,
            snapshotKeys: snapshot ? Object.keys(snapshot) : [],
            snapshotType: typeof snapshot,
          });

          // Optimize snapshot: Remove Tailwind noise and limit data size
          const optimizedSnapshot = snapshot
            ? {
                domain: snapshot.domain,
                cssVariables: Object.fromEntries(
                  Object.entries(snapshot.cssVariables || {})
                    .filter(
                      ([key]) =>
                        !key.startsWith("--tw-") &&
                        !key.startsWith("--chat-") &&
                        !key.startsWith("--channel-"),
                    )
                    .slice(0, 10),
                ),
                computed: {
                  bodyBg: snapshot.computed?.bodyBg,
                  bodyColor: snapshot.computed?.bodyColor,
                  linkColor: snapshot.computed?.linkColor,
                  headingsColor: snapshot.computed?.headingsColor,
                  borderRadiusSamples:
                    snapshot.computed?.borderRadiusSamples?.slice(0, 3) || [],
                  shadowSamples:
                    snapshot.computed?.shadowSamples?.slice(0, 2) || [],
                },
                fonts: {
                  families:
                    snapshot.fonts?.families
                      ?.filter((f) => f !== "inherit" && !f.includes("Emoji"))
                      .slice(0, 3) || [],
                },
                paletteSamples: snapshot.paletteSamples?.slice(0, 8) || [],
              }
            : null;

          console.log("🔍 OPTIMIZED SNAPSHOT:", {
            originalKeys: snapshot
              ? Object.keys(snapshot.cssVariables || {}).length
              : 0,
            optimizedKeys: optimizedSnapshot
              ? Object.keys(optimizedSnapshot.cssVariables).length
              : 0,
            originalColors: snapshot?.paletteSamples?.length || 0,
            optimizedColors: optimizedSnapshot?.paletteSamples?.length || 0,
          });

          const { systemPrompt, userPrompt } = buildThemePrompt({
            mode: mode as "base" | "preset" | "analyze",
            domain,
            snapshot: optimizedSnapshot,
            siteStylesheet,
            baseTheme: base,
            userText: String(message.payload?.prompt || ""),
          });

          console.log("🔍 USER PROMPT DEBUG:", {
            userPromptStart: userPrompt.substring(0, 300),
            userPromptEnd: userPrompt.substring(userPrompt.length - 100),
            containsSnapshot: userPrompt.includes('"snapshot"'),
            containsDomain: userPrompt.includes('"domain"'),
            isValidJSON: (() => {
              try {
                JSON.parse(userPrompt);
                return true;
              } catch {
                return false;
              }
            })(),
          });

          console.log("📝 12. AI PROMPT BUILT:", {
            mode,
            systemPromptLength: systemPrompt.length,
            userPromptLength: userPrompt.length,
            userPromptPreview: userPrompt.substring(0, 300),
            userPromptSample: userPrompt.includes("[object Object]")
              ? "⚠️ CONTAINS [object Object]"
              : "✅ Valid JSON",
          });

          console.log("🧠 13. CREATING AI SESSION...");
          const session = await LanguageModel.create({
            initialPrompts: [{ role: "system", content: systemPrompt }],
          });
          console.log("✅ 14. AI SESSION CREATED");

          console.log("💭 15. SENDING PROMPT TO AI...");
          const result = await session.prompt({
            role: "user",
            content: userPrompt,
          });
          console.log("📨 16. AI RESPONSE RECEIVED:", {
            responseLength: result ? String(result).length : 0,
            responsePreview: result
              ? String(result).substring(0, 200) + "..."
              : "No response",
          });

          session.destroy?.();

          const full = String(result || "");
          const analysis = full
            .replace(/^[\s\S]*?<analysis>/i, "")
            .replace(/<\/analysis>[\s\S]*$/i, "")
            .trim();
          const css = full
            .replace(/^[\s\S]*?<theme-palette>/i, "")
            .replace(/<\/theme-palette>[\s\S]*$/i, "")
            .trim();

          console.log("🎨 17. PARSING AI RESPONSE:", {
            fullLength: full.length,
            hasAnalysis: !!analysis,
            analysisLength: analysis.length,
            hasCss: !!css,
            cssLength: css.length,
          });

          console.log("📤 18. BROADCASTING SUCCESS RESPONSE...");
          await broadcastToAll({
            messageType: MessageType.themeGenerated,
            payload: { domain, css, analysis: analysis || undefined },
            from: MessageFrom.background,
          } as any);
          console.log("✅ 19. SUCCESS RESPONSE SENT to UI");
        } catch (e) {
          console.error("❌ 20. THEME GENERATION ERROR:", {
            error: e instanceof Error ? e.message : String(e),
            errorType: e instanceof Error ? e.constructor.name : typeof e,
            stack: e instanceof Error ? e.stack?.substring(0, 300) : undefined,
          });

          const errorMessage = e instanceof Error ? e.message : String(e);

          // Try fallback for base/preset modes
          if (mode !== "analyze" && snapshot) {
            console.log("🔄 21. ATTEMPTING FALLBACK CSS...");
            const fallbackCss = fallbackCssFromSnapshot(snapshot);
            console.log("⚠️ 22. FALLBACK CSS GENERATED:", {
              cssLength: fallbackCss.length,
              cssPreview: fallbackCss.substring(0, 100) + "...",
            });

            await broadcastToAll({
              messageType: MessageType.themeGenerated,
              payload: {
                domain,
                css: fallbackCss,
                warning:
                  "AI generation failed, using fallback theme. Check Info tab for troubleshooting.",
              },
              from: MessageFrom.background,
            } as any);
            console.log("📤 23. FALLBACK RESPONSE SENT to UI");
          } else {
            console.log("📤 21. ERROR RESPONSE SENDING...");
            await broadcastToAll({
              messageType: MessageType.themeGenerated,
              payload: {
                domain,
                css: "",
                error: `Theme generation failed: ${errorMessage}`,
              },
              from: MessageFrom.background,
            } as any);
            console.log("❌ 22. ERROR RESPONSE SENT to UI");
          }
        }
        console.log("🏁 === THEME GENERATION FLOW END ===");

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
          const currentEntry = (await getSiteEntry(domain)) || ({} as any);
          const siteStylesheet = currentEntry.css || "";

          const { systemPrompt, userPrompt } = buildThemePrompt({
            mode: "base",
            domain,
            snapshot: null,
            siteStylesheet,
            userText,
          });

          if (!chatSessions[domain]) {
            chatSessions[domain] = await LanguageModel.create({
              initialPrompts: [{ role: "system", content: systemPrompt }],
            });
          }
          const session = chatSessions[domain];

          let acc = "";
          const stream = session.promptStreaming({
            role: "user",
            content: userPrompt,
          });
          for await (const chunk of stream) {
            acc = String(chunk);
            await browser.runtime.sendMessage({
              messageType: MessageType.chatResponse,
              payload: { domain, content: acc, done: false },
              from: MessageFrom.background,
            } as any);
          }

          const cssMatch = acc.match(
            /<theme-palette>([\s\S]*?)<\/theme-palette>/i,
          );
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
         * Handle CORS-blocked stylesheets by fetching them from background script.
         */
      } else if (message.messageType === MessageType.fetchCorsStylesheets) {
        const urls = message.payload?.urls as string[];
        if (Array.isArray(urls)) {
          try {
            const fetchedStyles = await Promise.allSettled(
              urls.map(async (url) => {
                try {
                  // Use enhanced fetch with timeout and abort controller
                  const response = await fetchWithTimeout(url, 10000);

                  if (!response.ok) {
                    throw new Error(
                      `HTTP ${response.status}: ${response.statusText}`,
                    );
                  }

                  const css = await response.text();

                  // Validate CSS content size
                  const MAX_CSS_SIZE = 5 * 1024 * 1024; // 5MB limit
                  if (css.length > MAX_CSS_SIZE) {
                    console.warn(
                      `Large CSS fetched from ${url}: ${css.length} bytes, truncating`,
                    );
                    return {
                      url,
                      css: css.substring(0, MAX_CSS_SIZE),
                      success: true,
                      truncated: true,
                    };
                  }

                  return { url, css, success: true };
                } catch (error: any) {
                  console.warn(
                    `Failed to fetch CORS stylesheet ${url}:`,
                    error,
                  );

                  // Categorize error types for better handling
                  let errorType = "unknown";
                  if (error.name === "AbortError") {
                    errorType = "timeout";
                  } else if (
                    error.message?.includes("network") ||
                    error.message?.includes("fetch")
                  ) {
                    errorType = "network";
                  } else if (error.message?.includes("CORS")) {
                    errorType = "cors";
                  }

                  return {
                    url,
                    css: "",
                    success: false,
                    error: String(error),
                    errorType,
                  };
                }
              }),
            );

            const results = fetchedStyles.map((result) =>
              result.status === "fulfilled"
                ? result.value
                : {
                    url: "",
                    css: "",
                    success: false,
                    error: "Promise rejected",
                    errorType: "promise_failed",
                  },
            );

            sendResponse({ corsStylesheets: results });
          } catch (error) {
            console.error("Failed to fetch CORS stylesheets:", error);
            sendResponse({ corsStylesheets: [], error: String(error) });
          }
        }
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
 * Extract snapshot with retry logic and proper error handling.
 * Prevents race conditions by tracking ongoing extractions.
 */
async function extractSnapshotWithRetry(
  domain: string,
  maxRetries: number = 3,
): Promise<StyleSnapshot | undefined> {
  // Check if extraction is already in progress for this domain
  if (ongoingExtractions.has(domain)) {
    console.log(
      `🔄 Snapshot extraction already in progress for ${domain}, waiting for existing operation...`,
    );
    return await ongoingExtractions.get(domain);
  }

  console.log("📷 === SNAPSHOT EXTRACTION FLOW START ===");
  console.log(`🚀 SNAPSHOT: Starting extraction for ${domain}`);

  // Create extraction promise
  const extractionPromise = (async (): Promise<StyleSnapshot | undefined> => {
    let lastError: Error | undefined;
    const extractionKey = `extraction_${domain}`;

    // Set operation timeout
    const timeoutId = setTimeout(() => {
      console.warn(`Snapshot extraction timeout for ${domain}`);
      ongoingExtractions.delete(domain);
    }, 60000); // 1 minute max

    operationTimeouts.set(extractionKey, timeoutId);

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `📸 SNAPSHOT: Attempt ${attempt}/${maxRetries} for ${domain}`,
          );

          const activeTabsQuery = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          const active = activeTabsQuery?.[0];

          if (!active?.id) {
            throw new SnapshotExtractionError(
              `No active tab found for ${domain}`,
              domain,
            );
          }

          // Check if tab is still active and valid
          if (!activeTabs.has(active.id)) {
            throw new SnapshotExtractionError(
              `Tab ${active.id} is no longer active for ${domain}`,
              domain,
              active.id,
            );
          }

          // Verify tab URL still matches domain
          const currentDomain = extractDomain(active.url || "");
          if (currentDomain !== domain) {
            throw new SnapshotExtractionError(
              `Domain changed during extraction: ${currentDomain} !== ${domain}`,
              domain,
              active.id,
            );
          }

          // Test if content script is available before sending extraction request
          try {
            await browser.tabs.sendMessage(active.id, {
              messageType: "ping",
              payload: { domain },
            });
          } catch (pingError) {
            // Content script not available, try to inject it
            try {
              await browser.scripting.executeScript({
                target: { tabId: active.id },
                files: ["content-scripts/content.js"],
              });

              // Wait a bit for injection to complete
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (injectionError) {
              throw new SnapshotExtractionError(
                `Failed to inject content script: ${injectionError instanceof Error ? injectionError.message : String(injectionError)}`,
                domain,
                active.id,
              );
            }
          }

          // Wait for response with appropriate timeout
          const timeout = Math.min(5000 + attempt * 2000, 15000); // Increasing timeout per attempt
          console.log(
            `⏰ SNAPSHOT: Waiting for response (${timeout}ms timeout)`,
          );

          // Start waiting BEFORE sending the message
          const snapshotPromise = waitForSnapshot(domain, timeout);

          // Send extraction request
          console.log(`📤 SNAPSHOT: Sending request to tab ${active.id}`);
          await browser.tabs.sendMessage(active.id, {
            messageType: MessageType.extractSiteSnapshot,
            payload: { domain },
          });

          // Now await the response
          const snapshot = await snapshotPromise;

          if (snapshot) {
            console.log(
              `✅ SNAPSHOT: SUCCESS on attempt ${attempt}! Keys:`,
              Object.keys(snapshot),
            );
            return snapshot;
          } else {
            console.log(
              `⏰ SNAPSHOT: TIMEOUT after ${timeout}ms on attempt ${attempt}`,
            );
            throw new SnapshotExtractionError(
              `Snapshot extraction timed out after ${timeout}ms for ${domain}`,
              domain,
              active.id,
            );
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `❌ SNAPSHOT: Attempt ${attempt} failed:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            break;
          }

          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }

      const finalError = new SnapshotExtractionError(
        `Failed to extract snapshot after ${maxRetries} attempts: ${lastError?.message}`,
        domain,
      );
      finalError.cause = lastError;
      throw finalError;
    } finally {
      // Cleanup
      console.log(`🧹 SNAPSHOT: Cleaning up extraction for ${domain}`);
      clearTimeout(timeoutId);
      operationTimeouts.delete(extractionKey);
      ongoingExtractions.delete(domain);
      console.log("📷 === SNAPSHOT EXTRACTION FLOW END ===");
    }
  })();

  // Track the ongoing extraction
  ongoingExtractions.set(domain, extractionPromise);

  return extractionPromise;
}

/**
 * Await a snapshot response for a domain, or resolve undefined on timeout.
 */
async function waitForSnapshot(
  domain: string,
  timeoutMs: number,
): Promise<StyleSnapshot | undefined> {
  return new Promise((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      browser.runtime.onMessage.removeListener(listener);
    };

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        console.warn(
          `Snapshot extraction timeout for ${domain} after ${timeoutMs}ms`,
        );
        resolve(undefined);
      }
    }, timeoutMs);

    const listener = (msg: any) => {
      console.log(`📡 SNAPSHOT LISTENER: Message received for ${domain}:`, {
        messageType: msg?.messageType,
        payloadDomain: msg?.payload?.domain,
        isMatch:
          msg?.messageType === MessageType.siteSnapshotExtracted &&
          msg?.payload?.domain === domain,
        done: done,
      });

      if (
        msg?.messageType === MessageType.siteSnapshotExtracted &&
        msg?.payload?.domain === domain
      ) {
        if (!done) {
          done = true;
          cleanup();

          console.log(
            `📥 SNAPSHOT LISTENER: Processing response for ${domain}:`,
            {
              hasSnapshot: !!msg.payload.snapshot,
              hasError: !!msg.payload.error,
              snapshotKeys: msg.payload.snapshot
                ? Object.keys(msg.payload.snapshot)
                : [],
              timestamp: Date.now(),
            },
          );

          if (msg.payload.error) {
            console.log(
              `❌ SNAPSHOT LISTENER: Rejecting with error: ${msg.payload.error}`,
            );
            reject(new Error(`Content script error: ${msg.payload.error}`));
          } else if (msg.payload.snapshot) {
            console.log(`✅ SNAPSHOT LISTENER: Resolving with snapshot`);
            resolve(msg.payload.snapshot as StyleSnapshot);
          } else {
            console.log(
              `⚠️ SNAPSHOT LISTENER: Resolving with undefined (no snapshot or error)`,
            );
            resolve(undefined);
          }
        } else {
          console.warn(
            `⏰ Late snapshot response received for ${domain}, ignoring`,
          );
        }
      }
    };
    browser.runtime.onMessage.addListener(listener);
  });
}

/**
 * Generate a CSS theme using the built-in LanguageModel API with proper
 * system prompts and contextual inputs (snapshot, siteStylesheet, baseTheme).
 * Returns only the <theme-palette>...</theme-palette> contents.
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
  const mode = base ? "preset" : "base";
  const { systemPrompt, userPrompt } = buildThemePrompt({
    mode,
    domain,
    snapshot,
    baseTheme: base,
    userText,
    siteStylesheet,
  });

  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: systemPrompt }],
  });
  const result = await session.prompt({ role: "user", content: userPrompt });
  session.destroy?.();
  const css = String(result || "")
    .replace(/^[\s\S]*?<theme-palette>/i, "")
    .replace(/<\/theme-palette>[\s\S]*$/i, "")
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

/**
 * Remove CSS from active domain tabs.
 */
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
