import { ModelSettings } from "@/components/sidepanel/settings/model-settings";
import { ThemeSettings } from "@/components/sidepanel/settings/theme-settings";
import { Separator } from "@/components/ui/separator";

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-2">
      <ThemeSettings />
      <div className="px-2 py-2 text-[10px] text-muted-foreground flex items-center justify-between">
        <span>Themes powered by </span>
        <a
          href="https://tweakcn.com/?utm_source=sitecn-extension"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground inline-flex items-center gap-1 align-middle hover:text-foreground/80"
          title="tweakcn"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            className="w-3.5 h-3.5"
            aria-hidden
          >
            <path fill="none" d="M0 0h256v256H0z"></path>
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="24"
              d="m208 128-.2.2M168.2 167.8 128 208M192 40l-76.2 76.2M76.2 155.8 40 192"
            ></path>
            <circle
              cx="188"
              cy="148"
              r="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="24"
            ></circle>
            <circle
              cx="96"
              cy="136"
              r="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="24"
            ></circle>
          </svg>
          <span className="font-semibold">tweakcn</span>
        </a>
      </div>
      <Separator />
      <ModelSettings />
    </div>
  );
}
