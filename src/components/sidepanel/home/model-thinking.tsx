import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { motion } from "motion/react";

const FEEDBACK = [
  "Generating",
  "Tweaking color tokens",
  "This might take some time",
  "Generating a good theme takes time",
  "Still working on your theme",
  "Almost there",
];

interface ThinkingProgressProps {
  seconds: number;
}

export function ModelThinking({ seconds }: ThinkingProgressProps) {
  const stages = [
    { key: "understand", label: "Understanding request" },
    { key: "scan", label: "Scanning page styles" },
    { key: "palette", label: "Generating palette" },
    { key: "tokens", label: "Mapping tokens" },
    { key: "contrast", label: "Verifying contrast" },
    { key: "finalize", label: "Finalizing" },
  ];

  const activeIndex = Math.min(Math.floor(seconds / 6), stages.length - 1);
  const tip = FEEDBACK[Math.min(Math.floor(seconds / 8), FEEDBACK.length - 1)];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border-border text-foreground max-w-sm overflow-hidden rounded-lg border"
    >
      <div className="bg-muted border-border px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Loader2 className="text-primary w-4 h-4 animate-spin" />
          <div className="text-sm font-medium">Model thinking</div>
        </div>
        <motion.div
          key={tip}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-muted-foreground mt-1 text-xs"
        >
          {tip}…
        </motion.div>
      </div>

      <div className="p-2">
        <ul className="space-y-1">
          {stages.map((stage, idx) => {
            const state =
              idx < activeIndex
                ? "done"
                : idx === activeIndex
                  ? "active"
                  : "pending";

            return (
              <motion.li
                key={stage.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08, ease: "easeOut" }}
                className={`flex items-center gap-2 px-2 rounded-md transition-all duration-500 ${
                  state === "active" ? "py-2" : "py-1"
                }`}
                layout
              >
                <motion.div
                  className="w-4 h-4 relative flex justify-center items-center"
                  layout
                >
                  {state === "done" ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      <CheckCircle2 className="text-primary w-4 h-4" />
                    </motion.div>
                  ) : state === "active" ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
                      <Loader2 className="text-primary w-4 h-4" />
                    </motion.div>
                  ) : (
                    <Circle className="text-muted-foreground w-4 h-4" />
                  )}
                </motion.div>

                <div className="min-w-0 flex-1">
                  <motion.span
                    className={`text-xs transition-all duration-500 ${
                      state === "done"
                        ? "text-muted-foreground line-through"
                        : state === "active"
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                    }`}
                    animate={{
                      opacity: state === "pending" ? 0.6 : 1,
                      scale: state === "active" ? 1.02 : 1,
                    }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    layout
                  >
                    {stage.label}
                  </motion.span>

                  {state === "active" && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "100%", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 6, ease: "linear" }}
                      className="bg-primary h-px mt-1 rounded-full"
                      layout
                    />
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
}
