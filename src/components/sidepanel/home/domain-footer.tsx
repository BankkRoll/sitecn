export function ModelFooter({ domain }: { domain: string }) {
  return (
    <div className="text-muted-foreground grid grid-cols-1 gap-2 px-3 py-2 text-xs border-t sm:grid-cols-2">
      <div className="min-w-0 flex items-center gap-2">
        <span className="shrink-0">Current Domain:</span>
        <span
          className="text-foreground font-medium truncate"
          title={domain || "—"}
        >
          {domain || "—"}
        </span>
      </div>
    </div>
  );
}
