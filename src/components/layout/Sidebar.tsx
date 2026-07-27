import {
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  Layers,
  Play,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { LayerState } from "@/components/gis/GISMap";
type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";
type SidebarProps = {
  open: boolean;

  onToggle: () => void;

  layers: LayerState;

  setLayers: React.Dispatch<
    React.SetStateAction<LayerState>
  >;

  onPushLog: (
    level: LogLevel,
    msg: string
  ) => void;
};

export default function Sidebar({
  open,
  onToggle,
  layers,
  setLayers,
  onPushLog,
}: SidebarProps) {
return (
<aside
className={`relative flex shrink-0 flex-col border-r border-border bg-[var(--surface-0)] transition-[width] duration-300 ease-out ${
open ? "w-[340px]" : "w-14"
}`}
>
{
  /* Copy Sidebar JSX here */
  
}
</aside>
)
}