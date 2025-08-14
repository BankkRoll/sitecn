import { CssEditor } from "@/components/sidepanel/editor/css-editor";
import { FooterActions } from "@/components/sidepanel/editor/footer-actions";
import { LivePreview } from "@/components/sidepanel/editor/live-preview";
import { MessageType } from "@/entrypoints/types";
import { getSiteEntry, setSiteEntry } from "@/lib/storage";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

export function EditorPage() {
  const [domain, setDomain] = useState<string>("");
  const [enabled, setEnabled] = useState(false);
  const [hasCss, setHasCss] = useState(false);
  const [css, setCss] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState<{ save?: boolean; revert?: boolean }>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await browser.runtime
          .sendMessage({
            messageType: MessageType.requestActiveDomain,
            payload: {},
          } as any)
          .catch(() => null as any);
        const d = resp?.payload?.domain ? String(resp.payload.domain) : "";
        if (d) setDomain(d);
      } catch {}
    })();
    const onMsg = (msg: any) => {
      if (msg?.messageType === MessageType.activeDomain) {
        const d = String(msg?.payload?.domain || "");
        if (d && d !== domain) {
          setDomain(d);
        }
      } else if (
        msg?.messageType === MessageType.setSiteCss &&
        msg?.payload?.domain === domain
      ) {
        const next = msg?.payload?.css;
        if (typeof next === "string") {
          setCss(next);
          setDraft(next);
          setHasCss(next.length > 0);
          setEnabled(true);
        }
      } else if (
        msg?.messageType === MessageType.enableSiteCss &&
        msg?.payload?.domain === domain
      ) {
        setEnabled(true);
      } else if (
        msg?.messageType === MessageType.disableSiteCss &&
        msg?.payload?.domain === domain
      ) {
        setEnabled(false);
      }
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => browser.runtime.onMessage.removeListener(onMsg as any);
  }, [domain]);

  useEffect(() => {
    if (!domain) return;
    (async () => {
      try {
        const entry = await getSiteEntry(domain);
        const en = Boolean(entry?.enabled);
        const c = typeof entry?.css === "string" ? entry.css : "";
        setEnabled(en);
        setCss(c);
        setDraft(c);
        setHasCss(c.length > 0);
      } catch {}
    })();
  }, [domain]);

  function validate(input: string): string | null {
    if (!input.trim()) return "No theme saved";
    if (!/--(background|primary|foreground)/.test(input))
      return "Missing core CSS variables";
    return null;
  }

  async function handleSave() {
    try {
      setLoading((s) => ({ ...s, save: true }));
      setError(null);
      const err = validate(draft);
      if (err) {
        setError(err);
        return;
      }
      await setSiteEntry(domain, { enabled: true, css: draft });
      await browser.runtime.sendMessage({
        messageType: MessageType.setSiteCss,
        payload: { domain, css: draft },
      });
      setCss(draft);
      setHasCss(true);
    } catch (e: any) {
      setError(String(e?.message || e) || "Failed to save");
    } finally {
      setLoading((s) => ({ ...s, save: false }));
    }
  }

  async function handleRevert() {
    try {
      setLoading((s) => ({ ...s, revert: true }));
      setError(null);
      setDraft(css);
    } finally {
      setLoading((s) => ({ ...s, revert: false }));
    }
  }

  const disabled = !hasCss || !enabled;

  return (
    <div className="flex flex-col h-[calc(100vh-40px)]">
      <div className="overflow-hidden grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <CssEditor
          value={draft}
          onChange={setDraft}
          disabled={disabled}
          disabledMessage="Generate a theme first to enable editing."
          error={error}
        />
        <LivePreview css={draft} />
      </div>
      <FooterActions
        onApply={handleSave}
        onCopy={() => navigator.clipboard.writeText(draft).catch(() => {})}
        onRevert={handleRevert}
        canApply={!disabled}
        applying={!!loading.save}
        copyDisabled={!draft}
        revertDisabled={disabled || !!loading.revert}
      />
    </div>
  );
}
