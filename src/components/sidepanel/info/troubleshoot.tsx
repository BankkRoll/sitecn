import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function Troubleshoot() {
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    } catch {}
  }
  function CopyText({ text, children }: { text: string; children: any }) {
    return (
      <button
        type="button"
        className="text-foreground font-medium underline-offset-2 hover:underline"
        onClick={() => copyToClipboard(text)}
      >
        {children}
      </button>
    );
  }
  return (
    <section className="text-foreground p-4 space-y-2">
      <div className="text-foreground text-sm font-medium">
        Setup and troubleshooting
      </div>
      <ol className="text-muted-foreground pl-4 space-y-2 text-xs list-decimal">
        <li>
          Confirm Chrome version is 138 or newer. In the address bar, visit{" "}
          <CopyText text="chrome://version">chrome://version</CopyText>.
        </li>
        <li>
          Enable the Prompt API flag, then restart Chrome:{" "}
          <CopyText text="chrome://flags/#prompt-api-for-gemini-nano">
            chrome://flags/#prompt-api-for-gemini-nano
          </CopyText>
        </li>
        <li>
          Ensure enough free disk space (~22 GB) and an unmetered connection for
          first-time model download.
        </li>
        <li>
          Open{" "}
          <CopyText text="chrome://on-device-internals">
            chrome://on-device-internals
          </CopyText>{" "}
          → Model status to check download progress
        </li>
        <li>
          Use the Enable button in Model Settings if status is
          downloadable/downloading.
        </li>
        <li>
          If status stays unavailable, review the docs:
          <ul className="pl-4 mt-1 space-y-1 list-disc">
            <li>
              <a
                className="underline hover:text-foreground"
                href="https://developer.chrome.com/docs/ai/get-started"
                target="_blank"
                rel="noreferrer"
              >
                Get started with built-in AI
              </a>
            </li>
            <li>
              <a
                className="underline hover:text-foreground"
                href="https://developer.chrome.com/docs/ai/prompt-api"
                target="_blank"
                rel="noreferrer"
              >
                Prompt API
              </a>
            </li>
            <li>
              <a
                className="underline hover:text-foreground"
                href="https://developer.chrome.com/docs/ai/session-management"
                target="_blank"
                rel="noreferrer"
              >
                Session management
              </a>
            </li>
            <li>
              <a
                className="underline hover:text-foreground"
                href="https://developer.chrome.com/docs/ai/structured-output-for-prompt-api"
                target="_blank"
                rel="noreferrer"
              >
                Structured output
              </a>
            </li>
            <li>
              <a
                className="underline hover:text-foreground"
                href="https://developer.chrome.com/docs/extensions/ai"
                target="_blank"
                rel="noreferrer"
              >
                Extensions and AI
              </a>
            </li>
          </ul>
        </li>
      </ol>
    </section>
  );
}
