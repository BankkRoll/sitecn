import { Button } from "@/components/ui/button";

export function FooterActions({
  onApply,
  onCopy,
  onRevert,
  canApply,
  applying,
  copyDisabled,
  revertDisabled,
}: {
  onApply: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onRevert: () => void | Promise<void>;
  canApply: boolean;
  applying?: boolean;
  copyDisabled?: boolean;
  revertDisabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex justify-end items-center gap-2 p-3">
        <Button onClick={onApply} disabled={!canApply || !!applying}>
          {applying ? "Injecting…" : "Apply to Page"}
        </Button>
        <Button variant="secondary" onClick={onCopy} disabled={!!copyDisabled}>
          Copy CSS
        </Button>
        <Button
          variant="secondary"
          onClick={onRevert}
          disabled={!!revertDisabled}
        >
          Revert
        </Button>
      </div>
    </div>
  );
}
