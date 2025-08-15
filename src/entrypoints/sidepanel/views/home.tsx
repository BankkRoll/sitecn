import { Composer } from "@/components/sidepanel/home/chat/composer";
import { InlineModeBadges } from "@/components/sidepanel/home/chat/inline-mode-badges";
import type { ThreadMessage as ChatThreadMessage } from "@/components/sidepanel/home/chat/message";
import { ChatMessages } from "@/components/sidepanel/home/chat/messages";
import { type ChatMode } from "@/components/sidepanel/home/chat/mode-bar";
import { EmptyChat } from "@/components/sidepanel/home/empty-chat";
import { ModelFooter } from "@/components/sidepanel/home/model-footer";
import {
  DEFAULT_STARTER_SUGGESTIONS,
  sampleSuggestions,
} from "@/components/sidepanel/home/starter-suggestions";
import { MessageType } from "@/entrypoints/types";
import {
  getCachedModelAvailability as getModelAvailabilityRec,
  getThread as loadThread,
  saveThread,
  setCachedModelAvailability as setModelAvailabilityRec,
  setSiteEntry,
} from "@/lib/storage";
import { listRegistryThemes } from "@/lib/theme-registry";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { browser } from "wxt/browser";

export function Home() {
  const [domain, setDomain] = useState<string>("");
  const domainRef = useRef<string>("");
  const hasDomain = !!domain;
  const [prompt, setPrompt] = useState<string>("");
  const [mode, setMode] = useState<ChatMode>("base");
  const [loading, setLoading] = useState<{
    pending?: boolean;
    inject?: boolean;
    enable?: boolean;
    disable?: boolean;
    model?: boolean;
  }>({});
  const [modelAvailability, setModelAvailability] = useState<string>("");
  const [baseThemeName, setBaseThemeName] = useState<string>("");
  const [inputLocked, setInputLocked] = useState<boolean>(false);
  const [modelProgress, setModelProgress] = useState<number | undefined>(
    undefined,
  );
  const pending = useRef<{ css: boolean; model: boolean }>({
    css: false,
    model: false,
  });
  const spinnerTimeoutRef = useRef<number | null>(null);
  const MODEL_CACHE_TTL_MS = 30000;
  const themeNames = listRegistryThemes();

  type ThreadMessage = ChatThreadMessage;
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(
    null,
  );

  const [starterPrompts, setStarterPrompts] = useState<string[]>([]);
  const isFirstMessage = messages.length === 0;

  function handleModeChange(next: ChatMode) {
    setMode(next);
    if (next === "analyze") {
      setInputLocked(true);
      setPrompt("Analyze site styles and produce a theme.");
    } else if (next === "preset") {
      setInputLocked(!baseThemeName);
      setPrompt("");
    } else {
      // base
      setInputLocked(false);
      setPrompt("");
      setBaseThemeName("");
    }
  }

  function parseThemeFromCss(
    input?: string,
  ): Record<string, string> | undefined {
    if (!input) return undefined;
    try {
      const root = /:root\s*{([\s\S]*?)}/.exec(input)?.[1] || "";
      const vars: Record<string, string> = {};
      root.replace(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g, (_, k, v) => {
        vars[k] = String(v).trim();
        return "";
      });
      // Return ALL parsed CSS variables, not just a subset
      return Object.keys(vars).length > 0 ? vars : undefined;
    } catch {
      return undefined;
    }
  }

  async function getCachedModelAvailability(): Promise<string | undefined> {
    try {
      const rec = await getModelAvailabilityRec();
      if (rec && typeof rec.value === "string" && typeof rec.at === "number") {
        if (Date.now() - rec.at < MODEL_CACHE_TTL_MS) return rec.value;
      }
    } catch {}
    return undefined;
  }
  async function setCachedModelAvailability(value: string): Promise<void> {
    try {
      await setModelAvailabilityRec({ value, at: Date.now() });
    } catch {}
  }

  async function loadThreadIntoState(forDomain: string): Promise<void> {
    const arr = await loadThread(forDomain);
    setMessages(arr as ThreadMessage[]);
  }

  useEffect(() => {
    // Keep live domain for message listener comparisons
    domainRef.current = domain;
  }, [domain]);

  useEffect(() => {
    (async () => {
      const g: any = globalThis as any;
      if (g.__sitecnInit) return;
      g.__sitecnInit = true;
      try {
        setLoading((s) => ({ ...s, model: true }));
        const currentTabs = await browser.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        const currentTabId = currentTabs?.[0]?.id;
        const resp = await browser.runtime.sendMessage({
          messageType: MessageType.requestActiveDomain,
          payload: { tabId: currentTabId },
        } as any);
        const activeDomain = resp?.payload?.domain || "";
        setDomain(activeDomain);
        if (activeDomain) await loadThreadIntoState(activeDomain);
        setStarterPrompts(sampleSuggestions(DEFAULT_STARTER_SUGGESTIONS, 5));
        if (!pending.current.model) {
          try {
            pending.current.model = true;
            const cached = await getCachedModelAvailability();
            if (cached) setModelAvailability(cached);
            const model = await browser.runtime.sendMessage({
              messageType: MessageType.requestModelStatus,
              payload: {},
            } as any);
            const availability = model?.payload?.availability;
            if (typeof availability === "string") {
              setModelAvailability(availability);
              await setCachedModelAvailability(availability);
            }
          } catch (e) {
            console.warn("Failed to check model availability:", e);
            setModelAvailability("unavailable");
          } finally {
            pending.current.model = false;
          }
        }
      } finally {
        setLoading((s) => ({ ...s, model: false }));
      }
    })();

    const onMsg = (msg: any) => {
      if (msg?.messageType === MessageType.activeDomain) {
        const d = String(msg?.payload?.domain || "");
        if (d && d !== domain) {
          setDomain(d);
          void loadThreadIntoState(d);
          setStarterPrompts(sampleSuggestions(DEFAULT_STARTER_SUGGESTIONS, 5));
          (async () => {
            try {
              if (!pending.current.model) pending.current.model = true;
              const model = await browser.runtime.sendMessage({
                messageType: MessageType.requestModelStatus,
                payload: {},
              } as any);
              const availability = model?.payload?.availability;
              if (typeof availability === "string") {
                setModelAvailability(availability);
                await setCachedModelAvailability(availability);
              }
            } catch (e) {
              console.warn(
                "Failed to check model availability on domain change:",
                e,
              );
              setModelAvailability("unavailable");
            } finally {
              pending.current.model = false;
            }
          })();
        }
      } else if (
        msg?.messageType === MessageType.siteCssStatus &&
        msg?.payload?.domain === domainRef.current
      ) {
        // ignore in Home
      } else if (
        msg?.messageType === MessageType.siteCssPreview &&
        msg?.payload?.domain === domainRef.current
      ) {
        const nextCss = msg?.payload?.css;
        const error = msg?.payload?.error;
        const warning = msg?.payload?.warning;

        if (error) {
          // Handle error case
          toast.error(error);
          setMessages((cur) => {
            const errorMsg: ThreadMessage = {
              id: `error_${Date.now()}`,
              role: "assistant",
              text: `Error: ${error}`,
              createdAt: Date.now(),
            };
            const next = [...cur, errorMsg];
            if (domainRef.current) saveThread(domainRef.current, next);
            return next;
          });
        } else if (typeof nextCss === "string") {
          const derived = parseThemeFromCss(nextCss);

          // Show warning if present
          if (warning) {
            toast.warning(warning);
          }

          setMessages((cur) => {
            let next = cur;
            if (
              pendingAssistantId &&
              cur.some((m) => m.id === pendingAssistantId)
            ) {
              next = cur.map((m) =>
                m.id === pendingAssistantId
                  ? {
                      ...m,
                      css: nextCss,
                      theme: derived,
                      text: warning
                        ? `Theme generated with fallback: ${warning}`
                        : m.text || "Theme generated",
                    }
                  : m,
              );
            } else {
              const aId = `a_${Date.now()}`;
              next = [
                ...cur,
                {
                  id: aId,
                  role: "assistant",
                  text: warning
                    ? `Theme generated with fallback: ${warning}`
                    : "Theme generated",
                  css: nextCss,
                  theme: derived,
                  createdAt: Date.now(),
                } as any,
              ];
            }
            if (domainRef.current) saveThread(domainRef.current, next);
            return next;
          });
        }

        setLoading((s) => ({ ...s, pending: false }));
        setPendingAssistantId(null);
        setInputLocked(false);
        if (spinnerTimeoutRef.current) {
          try {
            clearTimeout(spinnerTimeoutRef.current);
          } catch {}
          spinnerTimeoutRef.current = null;
        }
      } else if (
        msg?.messageType === MessageType.themeGenerated &&
        msg?.payload?.domain === domainRef.current
      ) {
        const nextCss = msg?.payload?.css;
        const analysis = msg?.payload?.analysis;
        const error = msg?.payload?.error;
        const warning = msg?.payload?.warning;

        if (error) {
          // Handle error case with specific error type detection
          let userFriendlyError = error;
          let troubleshootingHint = "";

          if (error.includes("Could not establish connection")) {
            userFriendlyError = "Content script connection failed";
            troubleshootingHint =
              "The page may have security restrictions. Try refreshing the page or check the Info tab for troubleshooting.";
          } else if (error.includes("Content Security Policy")) {
            userFriendlyError = "Site security policy blocks analysis";
            troubleshootingHint =
              "This site has strict security policies that prevent style analysis.";
          } else if (error.includes("DOM not ready")) {
            userFriendlyError = "Page not fully loaded";
            troubleshootingHint =
              "Please wait for the page to finish loading and try again.";
          } else if (error.includes("Model unavailable")) {
            userFriendlyError = "AI model not available";
            troubleshootingHint =
              "Check that Chrome AI is enabled in chrome://flags/#prompt-api-for-gemini-nano";
          }

          toast.error(userFriendlyError);
          setMessages((cur) => {
            const errorMsg: ThreadMessage = {
              id: `error_${Date.now()}`,
              role: "assistant",
              text: `❌ ${userFriendlyError}${troubleshootingHint ? `\n\n💡 ${troubleshootingHint}` : ""}`,
              createdAt: Date.now(),
            };
            const next = [...cur, errorMsg];
            if (domainRef.current) saveThread(domainRef.current, next);
            return next;
          });
        } else {
          const derived = parseThemeFromCss(nextCss);

          // Show warning if present
          if (warning) {
            toast.warning(warning);
          }

          setMessages((cur) => {
            let next = cur;
            if (
              pendingAssistantId &&
              cur.some((m) => m.id === pendingAssistantId)
            ) {
              next = cur.map((m) =>
                m.id === pendingAssistantId
                  ? {
                      ...m,
                      text:
                        analysis ||
                        (warning
                          ? `Theme generated with fallback: ${warning}`
                          : m.text || "Theme generated"),
                      css: nextCss || m.css,
                      theme: derived || m.theme,
                    }
                  : m,
              );
            } else {
              next = [
                ...cur,
                {
                  id: `a_${Date.now()}`,
                  role: "assistant",
                  text:
                    analysis ||
                    (warning
                      ? `Theme generated with fallback: ${warning}`
                      : "Theme generated"),
                  css: nextCss || undefined,
                  theme: derived || undefined,
                  createdAt: Date.now(),
                } as any,
              ];
            }
            if (domainRef.current) saveThread(domainRef.current, next);
            return next;
          });
        }

        // Always end the thinking state
        setLoading((s) => ({ ...s, pending: false }));
        setPendingAssistantId(null);
        setInputLocked(false);
        if (spinnerTimeoutRef.current) {
          try {
            clearTimeout(spinnerTimeoutRef.current);
          } catch {}
          spinnerTimeoutRef.current = null;
        }
      } else if (
        msg?.messageType === MessageType.setSiteCss &&
        msg?.payload?.domain === domainRef.current
      ) {
        const nextCss = msg?.payload?.css;
        if (typeof nextCss === "string") {
          const derived = parseThemeFromCss(nextCss);
          setMessages((cur) => {
            const next = cur.map((m) =>
              m.css === nextCss ? { ...m, text: m.text + " (Applied)" } : m,
            );
            if (domainRef.current) saveThread(domainRef.current, next);
            return next;
          });
        }
      } else if (
        msg?.messageType === MessageType.enableSiteCss &&
        msg?.payload?.domain === domainRef.current
      ) {
        // ignore in Home
      } else if (
        msg?.messageType === MessageType.disableSiteCss &&
        msg?.payload?.domain === domainRef.current
      ) {
        // ignore in Home
      } else if (msg?.messageType === MessageType.modelStatus) {
        const availability = msg?.payload?.availability;
        if (
          typeof availability === "string" &&
          availability !== modelAvailability
        ) {
          setModelAvailability(availability);
          setCachedModelAvailability(availability);
        }
      }
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => browser.runtime.onMessage.removeListener(onMsg as any);
  }, []);

  function startPendingSpinner() {
    if (spinnerTimeoutRef.current) {
      try {
        clearTimeout(spinnerTimeoutRef.current);
      } catch {}
    }
    spinnerTimeoutRef.current = window.setTimeout(() => {
      console.warn("Theme generation timed out after 60 seconds");
      setLoading((s) => ({ ...s, pending: false }));
      setPendingAssistantId(null);
      setInputLocked(false);

      // Notify user of timeout
      toast.error(
        "Theme generation timed out. This might indicate an issue with the AI model or site analysis.",
      );

      // Add timeout message to chat
      setMessages((cur) => {
        const timeoutMsg: ThreadMessage = {
          id: `timeout_${Date.now()}`,
          role: "assistant",
          text: "Theme generation timed out after 60 seconds. Please try again or check the Info tab for troubleshooting.",
          createdAt: Date.now(),
        };
        const next = [...cur, timeoutMsg];
        if (domainRef.current) saveThread(domainRef.current, next);
        return next;
      });
    }, 60000) as unknown as number;
  }

  async function handleSend() {
    try {
      setLoading((s) => ({ ...s, pending: true }));
      const uId = `u_${Date.now()}`;
      const userText =
        mode === "analyze"
          ? baseThemeName
            ? `Analyze site styles using ${baseThemeName}`
            : "Analyze site styles"
          : prompt ||
            (mode === "preset" && baseThemeName
              ? `Generate theme using ${baseThemeName}`
              : "Generate theme");
      setMessages((cur) => {
        const next: ThreadMessage[] = [
          ...cur,
          { id: uId, role: "user", text: userText, createdAt: Date.now() },
        ];
        if (domain) saveThread(domain, next);
        return next;
      });
      setPendingAssistantId("new");
      setInputLocked(true);

      const modelReady = await ensureModelReady();
      if (!modelReady) {
        throw new Error(
          "AI model is not available. Please check your Chrome version and enable the Prompt API flag.",
        );
      }

      await browser.runtime.sendMessage({
        messageType: MessageType.generateTheme,
        payload: {
          domain,
          mode,
          prompt,
          baseThemeName: mode === "preset" ? baseThemeName : undefined,
        },
      } as any);
      startPendingSpinner();
    } catch (e: any) {
      console.error("handleSend failed:", e);
      setLoading((s) => ({ ...s, pending: false }));
      setInputLocked(false);
      setPendingAssistantId(null);

      // Clear any pending spinner
      if (spinnerTimeoutRef.current) {
        clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }

      // Show user-friendly error message
      const errorMessage =
        e?.message || "Failed to send message. Please try again.";
      toast.error(errorMessage);

      // Add error message to chat
      setMessages((cur) => {
        const errorMsg: ThreadMessage = {
          id: `error_${Date.now()}`,
          role: "assistant",
          text: `Error: ${errorMessage}`,
          createdAt: Date.now(),
        };
        const next = [...cur, errorMsg];
        if (domain) saveThread(domain, next);
        return next;
      });
    }
  }

  async function handleApplyTheme(css: string) {
    try {
      if (!domain) return;

      await setSiteEntry(domain, { enabled: true, css });

      await browser.runtime.sendMessage({
        messageType: MessageType.setSiteCss,
        payload: { domain, css },
      });

      setMessages((cur) => {
        const next = cur.map((m) =>
          m.css === css ? { ...m, applied: true } : m,
        );
        if (domain) saveThread(domain, next);
        return next;
      });
    } catch (e) {
      console.error("Failed to apply theme:", e);
    }
  }

  async function ensureModelReady(): Promise<boolean> {
    try {
      const anyGlobal: any = globalThis as any;
      const LanguageModel = anyGlobal?.LanguageModel;
      if (!LanguageModel) {
        setModelAvailability("unavailable");
        return false;
      }
      let availability: string = "unavailable";
      try {
        availability = await LanguageModel.availability();
      } catch {}
      setModelAvailability(availability);
      if (availability === "available") return true;
      if (availability === "downloadable" || availability === "downloading") {
        setModelProgress(0);
        try {
          const session = await LanguageModel.create({
            monitor(m: any) {
              m.addEventListener("downloadprogress", (e: any) => {
                if (typeof e.loaded === "number")
                  setModelProgress(Math.round(e.loaded * 100));
              });
            },
          });
          session.destroy?.();
          setModelAvailability("available");
          setModelProgress(undefined);
          await setCachedModelAvailability("available");
          return true;
        } catch (e) {
          // Remains unavailable
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  return (
    <div className="w-full flex flex-col h-[calc(100vh-40px)]">
      {messages.length > 0 && (
        <>
          <div className="bg-background sticky top-0 z-10 border-b">
            <div className="p-2">
              <InlineModeBadges mode={mode} onModeChange={handleModeChange} />
            </div>
          </div>
        </>
      )}
      <div className="w-full h-full overflow-y-auto flex flex-col p-2">
        {messages.length > 0 ? (
          <>
            <ChatMessages
              items={messages}
              generating={!!loading.pending}
              onApply={handleApplyTheme}
            />
          </>
        ) : (
          <div className="space-y-10">
            <EmptyChat
              onPick={setPrompt}
              items={starterPrompts}
              domain={domain}
              mode={mode}
            />
            <InlineModeBadges
              className="mx-auto justify-center"
              mode={mode}
              onModeChange={handleModeChange}
            />
          </div>
        )}
      </div>

      <Composer
        prompt={prompt}
        onPromptChange={setPrompt}
        onSend={handleSend}
        mode={mode}
        onModeChange={handleModeChange}
        baseThemeName={baseThemeName}
        onChangeBaseTheme={(next) => {
          setBaseThemeName(next);
          setInputLocked(mode === "preset" ? !next : false);
        }}
        themeNames={themeNames}
        canSend={
          hasDomain &&
          modelAvailability === "available" &&
          (mode === "analyze"
            ? true
            : mode === "preset"
              ? !!baseThemeName
              : prompt.trim().length > 0)
        }
        loading={!!loading.pending}
        readOnly={inputLocked}
      />
      <ModelFooter domain={domain} />
    </div>
  );
}
