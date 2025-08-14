import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import {
  BsChatDots,
  BsFileEarmarkCode,
  BsGear,
  BsInfoCircle,
} from "react-icons/bs";

export enum SidebarType {
  "home" = "home",
  "editor" = "editor",
  "settings" = "settings",
  "info" = "info",
}

const Sidebar = ({
  sideNav,
  editorEnabled,
}: {
  sideNav: (sidebarType: SidebarType) => void;
  editorEnabled?: boolean;
}) => {
  const [sidebarType, setSidebarType] = useState<SidebarType>(SidebarType.home);
  return (
    <aside className="bg-background text-foreground w-14 absolute inset-y-0 right-0 z-10 flex flex-col border-r-0 border-l">
      <nav className="flex flex-col items-center gap-4 px-2 py-5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  sidebarType === SidebarType.home
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:cursor-pointer"
                }`}
                href="#"
                onClick={() => {
                  setSidebarType(SidebarType.home);
                  sideNav(SidebarType.home);
                }}
              >
                <BsChatDots className={`w-4 h-4`} />
                <span className="sr-only">home</span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Chat</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  sidebarType === SidebarType.editor
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground"
                } ${editorEnabled ? "hover:cursor-pointer hover:text-foreground" : "opacity-40 cursor-not-allowed"}`}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (!editorEnabled) return;
                  setSidebarType(SidebarType.editor);
                  sideNav(SidebarType.editor);
                }}
              >
                <BsFileEarmarkCode className={`w-4 h-4`} />
                <span className="sr-only">editor</span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Theme Editor</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-4 px-2 py-5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  sidebarType === SidebarType.info
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:cursor-pointer"
                } `}
                href="#"
                onClick={() => {
                  setSidebarType(SidebarType.info);
                  sideNav(SidebarType.info);
                }}
              >
                <BsInfoCircle className={`w-5 h-5`} />
                <span className="sr-only">Info</span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Info</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  sidebarType === SidebarType.settings
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:cursor-pointer"
                } `}
                href="#"
                onClick={() => {
                  setSidebarType(SidebarType.settings);
                  sideNav(SidebarType.settings);
                }}
              >
                <BsGear className={`w-5 h-5`} />
                <span className="sr-only">Settings</span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </nav>
    </aside>
  );
};

export default Sidebar;
