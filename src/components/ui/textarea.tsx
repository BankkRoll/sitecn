import * as React from "react";

import { cn } from "@/lib/utils";

type BaseTextareaProps = React.ComponentProps<"textarea">;

type EnhancedTextareaProps = BaseTextareaProps & {
  bottomPanel?: React.ReactNode;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, EnhancedTextareaProps>(
  ({ className, style, bottomPanel, ...props }, ref) => {
    if (!bottomPanel) {
      return (
        <textarea
          className={cn(
            "bg-background border-input min-h-[80px] ring-offset-background w-full flex px-3 py-2 text-base rounded-md border disabled:opacity-50 disabled:cursor-not-allowed md:text-sm placeholder:text-muted-foreground",
            className,
          )}
          style={style}
          ref={ref}
          {...props}
        />
      );
    }

    return (
      <div
        className={cn(
          "bg-background border-input rounded-md border",
          className,
        )}
      >
        <textarea
          className={cn(
            "bg-background min-h-[80px] w-full flex px-3 py-2 text-base rounded-t-md border-0 disabled:opacity-50 disabled:cursor-not-allowed md:text-sm placeholder:text-muted-foreground",
          )}
          style={style}
          ref={ref}
          {...props}
        />
        <div className="px-2 py-2 border-t">{bottomPanel}</div>
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
