import { useEffect, useState } from "react";
import { X, Folder, FolderPlus, ArrowLeft, Check, AlertCircle, RefreshCw } from "lucide-react";
import { api, type DirectoriesResponse, type DirectoryItem } from "@/lib/api/client";
import { toast } from "sonner";

interface DirectoryBrowserModalProps {
  open: boolean;
  scope: "input" | "output";
  initialRelativePath?: string;
  onClose: () => void;
  onSelect: (relativePath: string) => void;
}

export default function DirectoryBrowserModal({
  open,
  scope,
  initialRelativePath = "",
  onClose,
  onSelect,
}: DirectoryBrowserModalProps) {
  const [currentRel, setCurrentRel] = useState<string>(initialRelativePath);
  const [parentRel, setParentRel] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New folder creation state (output scope only)
  const [isCreating, setIsCreating] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadDirectories(initialRelativePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, initialRelativePath]);

  const loadDirectories = async (relPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const data: DirectoriesResponse = await api.getDirectories(scope, relPath);
      setCurrentRel(data.current_relative_path);
      setParentRel(data.parent_relative_path);
      setDirectories(data.directories);
    } catch (err: any) {
      const msg = err.message || "Failed to load directory list";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDirectory = async () => {
    if (!newDirName.trim() || createLoading) return;
    setCreateLoading(true);
    try {
      const data = await api.createDirectory("output", currentRel, newDirName.trim());
      toast.success(`Created folder "${newDirName.trim()}"`);
      setCurrentRel(data.current_relative_path);
      setParentRel(data.parent_relative_path);
      setDirectories(data.directories);
      setNewDirName("");
      setIsCreating(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create directory");
    } finally {
      setCreateLoading(false);
    }
  };

  if (!open) return null;

  const scopeTitle = scope === "input" ? "Select Sentinel ZIP Input Folder" : "Select Output Folder";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 font-mono select-none">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-border bg-[var(--surface-0)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-ticker">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{scopeTitle}</h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                Root: <span className="text-foreground font-semibold">{scope.toUpperCase()}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Path Breadcrumb & Actions Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2.5 bg-[var(--surface-1)] text-xs shrink-0 font-medium">
          <div className="flex items-center gap-2 min-w-0 truncate">
            {parentRel !== null && (
              <button
                onClick={() => loadDirectories(parentRel)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded border border-border bg-[var(--surface-2)] text-foreground hover:bg-primary/20 transition cursor-pointer"
                title="Go to parent directory"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="flex flex-1 items-center gap-1 min-w-0">
              <span className="text-[11px] font-bold text-muted-foreground">/</span>
              <input
                type="text"
                value={currentRel}
                onChange={(e) => setCurrentRel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadDirectories(currentRel)}
                placeholder="Type or edit relative path..."
                className="w-full rounded border border-border bg-[var(--surface-0)] px-2 py-1 text-[11px] font-mono text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => loadDirectories(currentRel)}
              className="grid h-7 w-7 place-items-center rounded border border-border bg-[var(--surface-0)] text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Refresh directory"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            </button>

            {scope === "output" && (
              <button
                onClick={() => setIsCreating(!isCreating)}
                className="flex items-center gap-1.5 rounded border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>New Folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Folder Creation Input (Output scope) */}
        {isCreating && scope === "output" && (
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-3 text-xs shrink-0">
            <input
              type="text"
              placeholder="Enter new folder name..."
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateDirectory()}
              className="flex-1 rounded-md border border-border bg-[var(--surface-0)] px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
            <button
              onClick={handleCreateDirectory}
              disabled={!newDirName.trim() || createLoading}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
            >
              Create
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-[var(--surface-2)] transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Directory List Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 font-medium">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span>Scanning server filesystem...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-600 dark:text-red-400 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : directories.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground font-medium text-[11px]">
              No subdirectories found in <span className="font-semibold text-foreground">/{currentRel || "root"}</span>
            </div>
          ) : (
            directories.map((dir) => (
              <button
                key={dir.relative_path}
                onClick={() => loadDirectories(dir.relative_path)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-[var(--surface-0)] px-3 py-2 text-left hover:border-primary/60 hover:bg-[var(--surface-1)] transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate font-semibold text-foreground text-xs">{dir.name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">Subfolder</span>
              </button>
            ))
          )}
        </div>

        {/* Footer Selection Buttons */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 bg-[var(--surface-1)] shrink-0 text-xs">
          <div className="text-[11px] text-muted-foreground truncate font-medium max-w-[60%]">
            Selected: <span className="font-bold text-foreground">/{currentRel || "(root)"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--surface-2)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSelect(currentRel);
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Select This Folder</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
