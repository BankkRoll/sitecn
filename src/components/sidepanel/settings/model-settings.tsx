import { Slider } from "@/components/ui/slider";
import {
  getModelOverrides,
  removeModelOverrides,
  setModelOverrides,
} from "@/lib/storage";
import { useEffect, useRef, useState } from "react";

export function ModelSettings() {
  const [modelParams, setModelParams] = useState<{
    defaultTopK: number;
    maxTopK: number;
    defaultTemperature: number;
    maxTemperature: number;
  } | null>(null);
  const mountedRef = useRef(true);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [topK, setTopK] = useState<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const anyGlobal: any = globalThis as any;
        const LanguageModel = anyGlobal?.LanguageModel;
        if (LanguageModel?.params) {
          try {
            const p = await LanguageModel.params();
            if (mountedRef.current) setModelParams(p);
            try {
              const overrides = await getModelOverrides();
              const t =
                typeof overrides?.temperature === "number"
                  ? overrides.temperature
                  : p?.defaultTemperature;
              const k =
                typeof overrides?.topK === "number"
                  ? overrides.topK
                  : p?.defaultTopK;
              if (mountedRef.current) {
                setTemperature(t);
                setTopK(k);
              }
            } catch {}
          } catch (e: any) {
            // best-effort: params unavailable
          }
        }
      } catch (e: any) {
        // noop
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function getDefaults() {
    return {
      t: modelParams?.defaultTemperature ?? 0,
      k: modelParams?.defaultTopK ?? 1,
    };
  }

  async function persistOverrides(nextT: number | null, nextK: number | null) {
    if (!modelParams) return;
    const { t: defT, k: defK } = getDefaults();
    const t = typeof nextT === "number" ? nextT : defT;
    const k = typeof nextK === "number" ? nextK : defK;
    try {
      if (t === defT && k === defK) {
        await removeModelOverrides();
      } else {
        await setModelOverrides({ temperature: t, topK: k });
      }
    } catch {}
  }

  return (
    <section className="text-foreground p-4 space-y-4 break-words">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Language Model</div>
      </div>
      {modelParams ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-muted-foreground">
                Temperature (default:{" "}
                {modelParams.defaultTemperature.toFixed(2)})
              </span>
              <span className="text-foreground font-medium">
                {(temperature ?? modelParams.defaultTemperature).toFixed(2)}
              </span>
            </div>
            <Slider
              value={[temperature ?? modelParams.defaultTemperature]}
              min={0}
              max={Math.max(2, modelParams.maxTemperature || 2)}
              step={0.01}
              className="w-full"
              onValueChange={(v) => {
                const next = v?.[0] ?? modelParams.defaultTemperature;
                setTemperature(next);
                void persistOverrides(next, topK);
              }}
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="text-muted-foreground">
                Top-K (default: {modelParams.defaultTopK})
              </span>
              <span className="text-foreground font-medium">
                {topK ?? modelParams.defaultTopK}
              </span>
            </div>
            <Slider
              value={[topK ?? modelParams.defaultTopK]}
              min={1}
              max={Math.max(8, modelParams.maxTopK || 8)}
              step={1}
              className="w-full"
              onValueChange={(v) => {
                const next = v?.[0] ?? modelParams.defaultTopK;
                setTopK(next);
                void persistOverrides(temperature, next);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground text-xs">
          Parameters unavailable
        </div>
      )}
    </section>
  );
}
