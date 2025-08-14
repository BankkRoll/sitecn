import { ReadinessChecklist } from "@/components/sidepanel/info/readiness";
import { Troubleshoot } from "@/components/sidepanel/info/troubleshoot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";

export function InfoPage() {
  const [chromeVersion, setChromeVersion] = useState<number | null>(null);
  const [platformLabel, setPlatformLabel] = useState<string>("");
  const [isMetered, setIsMetered] = useState<boolean | null>(null);
  const [storageQuota, setStorageQuota] = useState<number | null>(null);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [gpuVendor, setGpuVendor] = useState<string | null>(null);
  const [gpuRenderer, setGpuRenderer] = useState<string | null>(null);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      const match = ua.match(/Chrome\/(\d+)/);
      setChromeVersion(match ? parseInt(match[1], 10) : null);
      setPlatformLabel((navigator as any).platform || "");
      setIsMetered((navigator as any)?.connection?.metered ?? null);
      if ("storage" in navigator && "estimate" in (navigator.storage as any)) {
        void (navigator.storage as any)
          .estimate()
          .then((est: any) => {
            setStorageQuota(typeof est?.quota === "number" ? est.quota : null);
            setStorageUsage(typeof est?.usage === "number" ? est.usage : null);
          })
          .catch(() => {});
      }
      const canvas = document.createElement("canvas");
      const gl: any =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) {
          setGpuVendor(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
          setGpuRenderer(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
        }
      }
    } catch {}
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <ReadinessChecklist
        chromeVersion={chromeVersion}
        platformLabel={platformLabel}
        isMetered={isMetered}
        storageQuota={storageQuota}
        storageUsage={storageUsage}
        gpuVendor={gpuVendor}
        gpuRenderer={gpuRenderer}
      />
      <Separator />
      <Troubleshoot />
    </div>
  );
}
