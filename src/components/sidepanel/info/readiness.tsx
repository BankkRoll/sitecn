import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function ReadinessChecklist({
  chromeVersion,
  platformLabel,
  isMetered,
  storageQuota,
  storageUsage,
  gpuVendor,
  gpuRenderer,
}: {
  chromeVersion: number | null;
  platformLabel: string;
  isMetered: boolean | null;
  storageQuota: number | null;
  storageUsage: number | null;
  gpuVendor: string | null;
  gpuRenderer: string | null;
}) {
  const versionOk = (chromeVersion ?? 0) >= 138;
  const platformOk = !/(Android|iPhone|iPad|Mobile)/i.test(platformLabel);
  const connectionOk = isMetered === null ? true : !isMetered;

  function formatBytes(n: number | null) {
    if (n == null) return "unknown";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  }

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
      <div className="text-foreground text-sm font-medium">Readiness</div>
      <ul className="space-y-2">
        <li className="flex items-start gap-2 text-xs">
          <span
            aria-hidden
            className={versionOk ? "text-green-600" : "text-destructive"}
          >
            {versionOk ? "✔" : "✖"}
          </span>
          <span className="text-muted-foreground">
            Chrome version ≥ 138. Detected:{" "}
            <CopyText text={String(chromeVersion ?? "unknown")}>
              {chromeVersion ?? "unknown"}
            </CopyText>
          </span>
        </li>
        <li className="flex items-start gap-2 text-xs">
          <span
            aria-hidden
            className={platformOk ? "text-green-600" : "text-destructive"}
          >
            {platformOk ? "✔" : "✖"}
          </span>
          <span className="text-muted-foreground">
            Desktop platform required (Windows 10/11, macOS 13+, or Linux).
            Detected:{" "}
            <CopyText text={platformLabel || "unknown"}>
              {platformLabel || "unknown"}
            </CopyText>
          </span>
        </li>
        <li className="flex items-start gap-2 text-xs">
          <span
            aria-hidden
            className={connectionOk ? "text-green-600" : "text-amber-600"}
          >
            {connectionOk ? "✔" : "!"}
          </span>
          <span className="text-muted-foreground">
            Unmetered network recommended. Metered:{" "}
            <CopyText
              text={isMetered == null ? "unknown" : isMetered ? "yes" : "no"}
            >
              {isMetered == null ? "unknown" : isMetered ? "yes" : "no"}
            </CopyText>
          </span>
        </li>
        <li className="flex items-start gap-2 text-xs">
          <span aria-hidden className={"text-amber-600"}>
            i
          </span>
          <span className="text-muted-foreground">
            At least ~22 GB free disk space recommended for model download.
            Origin storage quota:{" "}
            <CopyText text={String(storageQuota ?? "unknown")}>
              {formatBytes(storageQuota)}
            </CopyText>{" "}
            (usage:{" "}
            <CopyText text={String(storageUsage ?? "unknown")}>
              {formatBytes(storageUsage)}
            </CopyText>
            )
          </span>
        </li>
        <li className="flex items-start gap-2 text-xs">
          <span aria-hidden className={"text-amber-600"}>
            i
          </span>
          <span className="text-muted-foreground">
            GPU with &gt; 4 GB VRAM recommended. GPU:{" "}
            <CopyText text={String(gpuRenderer || gpuVendor || "unknown")}>
              {gpuRenderer || gpuVendor || "unknown"}
            </CopyText>
          </span>
        </li>
      </ul>
    </section>
  );
}
