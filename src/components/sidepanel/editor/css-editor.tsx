import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CssEditor({
  id = "editor-css",
  value,
  onChange,
  disabled,
  disabledMessage,
  error,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  disabledMessage?: string;
  error?: string | null;
}) {
  return (
    <div className="h-full overflow-hidden flex flex-col">
      <Label htmlFor={id} className="mb-2">
        CSS
      </Label>
      <Textarea
        id={id}
        className="min-h-0 flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=":root { --primary: ... }"
        readOnly={!!disabled}
      />
      {disabled && disabledMessage && (
        <div className="text-muted-foreground mt-2 text-xs">
          {disabledMessage}
        </div>
      )}
      {error && <div className="text-destructive mt-2 text-xs">{error}</div>}
    </div>
  );
}
