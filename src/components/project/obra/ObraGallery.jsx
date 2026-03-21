import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate } from "@/lib/utils";

// ─── Inline confirm popover ───────────────────────────────────────────────────
function ConfirmPopover({ trigger, title, description, confirmLabel = "Confirmar", variant = "destructive", onConfirm }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-4" side="top" align="end" sideOffset={6}>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={variant}
            size="sm"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Image with fallback ──────────────────────────────────────────────────────
function MediaThumb({ item, className = "" }) {
  const [errored, setErrored] = useState(false);
  const isVideo = ["video", "video_url"].includes(item.type);

  if (isVideo) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-slate-900 ${className}`}>
        <Video className="w-10 h-10 text-white/80" />
      </div>
    );
  }

  if (errored || !item.url) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center gap-1.5 bg-muted ${className}`}>
        <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/60 text-center px-2 leading-tight line-clamp-2">
          {item.name || "Sem prévia"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={item.url}
      alt={item.description || item.name || "Mídia"}
      className={`w-full h-full object-cover ${className}`}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

// ─── Drop zone wrapper ────────────────────────────────────────────────────────
function DropZone({ onFiles, children, className = "" }) {
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);

  const onDragEnter = (e) => {
    e.preventDefault();
    counter.current++;
    setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    counter.current--;
    if (counter.current === 0) setDragging(false);
  };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault();
    counter.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files || []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/") || f.type === "application/pdf"
    );
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`relative transition-all duration-150 ${dragging ? "ring-2 ring-primary ring-offset-2 rounded-2xl" : ""} ${className}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}
      {dragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
          <Upload className="w-8 h-8 text-primary animate-bounce" />
          <p className="text-sm font-semibold text-primary">Solte para adicionar</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ObraGallery({
  galleries,
  documents,
  emptyMessage,
  embedded = false,
  onOpenViewer,
  canEdit = false,
  managerInline = false,
  showOverview = true,
  onRenameGallery,
  onDeleteGallery,
  onUpdateMediaItem,
  onDeleteMediaItem,
  onUploadFiles,
  onBulkUpdateMediaItems,
  onBulkDeleteMediaItems,
}) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded
    ? "p-4 sm:p-6"
    : "bg-card rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6";

  const groups = Array.isArray(galleries) ? galleries : [];
  const docs = Array.isArray(documents) ? documents : [];
  const galleryNames = useMemo(() => groups.map((g) => g.name).filter(Boolean), [groups]);

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [isEditOpen, setIsEditOpen] = useState(false);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [view, setView] = useState("folders"); // "folders" | "images"
  const [selectedGallery, setSelectedGallery] = useState(null);

  // ── Gallery creation / rename ───────────────────────────────────────────────
  const [extraGalleries, setExtraGalleries] = useState([]);
  const [folderAction, setFolderAction] = useState(null); // { type, from?, value }

  // ── Selection mode ──────────────────────────────────────────────────────────
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());
  const [movePopoverOpen, setMovePopoverOpen] = useState(false);
  const [moveToNewGalleryName, setMoveToNewGalleryName] = useState("");

  // ── Pending folder delete ────────────────────────────────────────────────────
  const [pendingDeleteGallery, setPendingDeleteGallery] = useState(null); // { name, items }

  // ── Async loading ───────────────────────────────────────────────────────────
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  const fileInputRef = useRef(null);

  // ── Reset on close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditOpen) {
      setView("folders");
      setSelectedGallery(null);
      setExtraGalleries([]);
      setFolderAction(null);
      setIsSelecting(false);
      setSelectedItemIds(new Set());
      setMovePopoverOpen(false);
      setMoveToNewGalleryName("");
      setIsBulkLoading(false);
      setPendingDeleteGallery(null);
    }
  }, [isEditOpen]);

  // ── Reset selection when navigating ─────────────────────────────────────────
  useEffect(() => {
    setFolderAction(null);
    setIsSelecting(false);
    setSelectedItemIds(new Set());
    setMovePopoverOpen(false);
    setMoveToNewGalleryName("");
  }, [view, selectedGallery]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const allGalleryNames = useMemo(() => {
    const set = new Set(
      [...galleryNames, ...(Array.isArray(extraGalleries) ? extraGalleries : [])].filter(Boolean)
    );
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
  }, [extraGalleries, galleryNames]);

  const selectedGroup = useMemo(
    () => (selectedGallery ? groups.find((g) => g.name === selectedGallery) || null : null),
    [groups, selectedGallery]
  );
  const selectedItems = Array.isArray(selectedGroup?.items) ? selectedGroup.items : [];

  const selectedItemsCount = selectedItemIds.size;
  const allSelected = selectedItems.length > 0 && selectedItemsCount === selectedItems.length;
  const selectedItemsForBulk = useMemo(
    () => (selectedItemIds.size === 0 ? [] : selectedItems.filter((i) => selectedItemIds.has(i.id))),
    [selectedItemIds, selectedItems]
  );

  // ── Handlers ────────────────────────────────────────────────────────────────
  const goToGallery = (name) => {
    setSelectedGallery(name);
    setView("images");
    setFolderAction(null);
  };

  const goToFolders = () => {
    setView("folders");
    setSelectedGallery(null);
    setFolderAction(null);
  };

  const toggleSelectedItem = (id) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setIsSelecting(false);
    setSelectedItemIds(new Set());
    setMovePopoverOpen(false);
    setMoveToNewGalleryName("");
  };

  const toggleSelectAll = () => {
    if (!selectedItems.length) return;
    setSelectedItemIds(allSelected ? new Set() : new Set(selectedItems.map((i) => i.id)));
  };

  const bulkMoveSelected = useCallback(
    async (targetGalleryName) => {
      const name = String(targetGalleryName || "").trim();
      if (!name || !selectedItemsForBulk.length) return;
      const ids = selectedItemsForBulk.map((i) => i.id);
      setIsBulkLoading(true);
      try {
        if (typeof onBulkUpdateMediaItems === "function") {
          await onBulkUpdateMediaItems(ids, { gallery_name: name });
        } else {
          for (const id of ids) await onUpdateMediaItem?.(id, { gallery_name: name });
        }
        exitSelectionMode();
      } finally {
        setIsBulkLoading(false);
      }
    },
    [selectedItemsForBulk, onBulkUpdateMediaItems, onUpdateMediaItem]
  );

  const bulkDeleteSelected = useCallback(async () => {
    if (!selectedItemsForBulk.length) return;
    setIsBulkLoading(true);
    try {
      if (typeof onBulkDeleteMediaItems === "function") {
        await onBulkDeleteMediaItems(selectedItemsForBulk);
      } else {
        for (const it of selectedItemsForBulk) await onDeleteMediaItem?.(it.id, it.url);
      }
      exitSelectionMode();
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedItemsForBulk, onBulkDeleteMediaItems, onDeleteMediaItem]);

  const handleFiles = useCallback(
    (files) => {
      if (!selectedGallery || !files.length) return;
      onUploadFiles?.(selectedGallery, files);
    },
    [selectedGallery, onUploadFiles]
  );

  const triggerFileInput = () => {
    if (!selectedGallery) return;
    fileInputRef.current?.click();
  };

  const saveFolderAction = () => {
    const nextName = String(folderAction?.value || "").trim();
    if (!nextName) return;

    if (folderAction.type === "create") {
      if (!allGalleryNames.includes(nextName)) {
        setExtraGalleries((prev) => Array.from(new Set([...(prev || []), nextName])));
      }
      // Stay on folders view — let the user click into the new gallery
      setFolderAction(null);
      return;
    }

    if (folderAction.type === "rename") {
      const fromName = String(folderAction.from || "").trim();
      if (!fromName || fromName === nextName) { setFolderAction(null); return; }
      if (galleryNames.includes(fromName)) {
        onRenameGallery?.(fromName, nextName);
      } else {
        setExtraGalleries((prev) => (prev || []).map((n) => (n === fromName ? nextName : n)));
      }
      if (selectedGallery === fromName) setSelectedGallery(nextName);
      setFolderAction(null);
    }
  };

  const deleteGallery = (g, items) => {
    if (!galleryNames.includes(g.name) && items.length === 0) {
      setExtraGalleries((prev) => (prev || []).filter((n) => n !== g.name));
      return;
    }
    onDeleteGallery?.(g.name, items);
  };

  // ── Management panel ─────────────────────────────────────────────────────────
  const ManagementPanel = (
    <div className={managerInline ? "rounded-xl border border-border bg-muted/10 p-3 sm:p-4" : ""}>

      {/* ── Sticky header ── */}
      <div
        className="sticky top-0 z-10 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border"
      >
        {/* Top row */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={`h-9 w-9 rounded-full shrink-0 ${view === "folders" ? "invisible pointer-events-none" : ""}`}
            onClick={goToFolders}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Breadcrumb */}
          <div className="min-w-0 flex-1">
            {view === "folders" ? (
              <div className="text-base sm:text-lg font-semibold leading-tight tracking-tight">
                Minhas galerias
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={goToFolders}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0 font-medium"
                >
                  Galerias
                </button>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold text-foreground truncate">{selectedGallery}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {view === "folders"
                ? `${allGalleryNames.length} galeria${allGalleryNames.length === 1 ? "" : "s"}`
                : `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {view === "folders" ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => setFolderAction({ type: "create", value: "" })}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Nova galeria
              </Button>
            ) : isSelecting ? (
              <Button type="button" variant="outline" size="sm" onClick={exitSelectionMode}>
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsSelecting(true)}>
                  Selecionar
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={triggerFileInput}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Adicionar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Mobile bottom row */}
        <div className="pt-3 sm:hidden">
          {view === "folders" ? (
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={() => setFolderAction({ type: "create", value: "" })}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nova galeria
            </Button>
          ) : !isSelecting ? (
            <Button type="button" variant="default" className="w-full" onClick={triggerFileInput}>
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar mídia
            </Button>
          ) : null}
        </div>

        {/* Create / rename form */}
        {folderAction ? (
          <div className="pt-3">
            <div className="rounded-xl border border-border bg-muted/10 p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                className="flex-1"
                value={folderAction.value}
                onChange={(e) => setFolderAction((p) => ({ ...p, value: e.target.value }))}
                placeholder={folderAction.type === "rename" ? "Novo nome da galeria" : "Nome da nova galeria"}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveFolderAction(); if (e.key === "Escape") setFolderAction(null); }}
              />
              <div className="flex items-center gap-2 justify-end shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setFolderAction(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!String(folderAction.value || "").trim()}
                  onClick={saveFolderAction}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Body ── */}
      <div className={managerInline ? "pt-4" : "flex-1 overflow-y-auto pr-1 pt-4"}>

        {/* FOLDERS VIEW */}
        {view === "folders" ? (
          allGalleryNames.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl bg-muted/20">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                <FolderOpen className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground font-semibold">Nenhuma galeria criada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Crie uma galeria para adicionar fotos, vídeos e documentos.
              </p>
              <div className="mt-4 flex justify-center">
                <Button type="button" onClick={() => setFolderAction({ type: "create", value: "" })}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nova galeria
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {allGalleryNames.map((galleryName) => {
                const g = groups.find((x) => x.name === galleryName) || { name: galleryName, items: [] };
                const items = Array.isArray(g.items) ? g.items : [];
                const count = items.length;
                const previewImages = items.filter(
                  (i) => !["video", "video_url"].includes(i.type) && Boolean(i.url)
                );
                const cover = previewImages[0] || null;
                const thumbs = previewImages.slice(1, 4);

                return (
                  <div
                    key={g.name}
                    className="group relative rounded-2xl border border-border bg-background overflow-hidden shadow-sm hover:shadow-md hover:border-muted-foreground/30 transition cursor-pointer"
                    onClick={() => goToGallery(g.name)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToGallery(g.name);
                      }
                    }}
                  >
                    {/* Cover */}
                    <div className="relative aspect-[4/3] bg-gradient-to-br from-muted/40 via-background to-muted/10">
                      {cover ? (
                        <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-background/10" />

                      <div className="absolute left-3 top-3">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          {count} item{count === 1 ? "" : "s"}
                        </div>
                      </div>

                      {thumbs.length > 0 ? (
                        <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2">
                          {thumbs.map((p) => (
                            <div key={p.id} className="aspect-square rounded-lg border border-border/70 bg-background/50 overflow-hidden">
                              <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          ))}
                          {Array.from({ length: Math.max(0, 3 - thumbs.length) }).map((_, idx) => (
                            <div key={idx} className="aspect-square rounded-lg border border-border/60 bg-muted/20" />
                          ))}
                        </div>
                      ) : (
                      <></>
                      )}
                    </div>

                    {/* Name */}
                    <div className="px-3 py-3 sm:px-4 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground truncate">{g.name}</div>
                    </div>

                    {/* ⋮ menu — always visible, works on mobile */}
                    <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 rounded-full shadow-md bg-background/95 hover:bg-background border border-border"
                            aria-label="Opções da galeria"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() =>
                              setFolderAction({ type: "rename", from: g.name, value: g.name })
                            }
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Renomear
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => setPendingDeleteGallery({ name: g.name, items })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir galeria
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )

        ) : (
          /* IMAGES VIEW */
          <DropZone onFiles={handleFiles}>
            {selectedItems.length === 0 ? (
              <div
                className="py-14 text-center border-2 border-dashed border-border rounded-2xl bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={triggerFileInput}
              >
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-foreground font-semibold">Sem mídia ainda</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Clique para selecionar ou arraste arquivos aqui
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Fotos, vídeos e PDFs
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {selectedItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`group relative rounded-2xl border bg-background overflow-hidden shadow-sm transition ${
                      selectedItemIds.has(item.id)
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-muted-foreground/30 hover:shadow-md"
                    }`}
                    onClick={() => {
                      if (isSelecting) { toggleSelectedItem(item.id); return; }
                      onOpenViewer?.(selectedItems, idx);
                    }}
                  >
                    <div className="relative aspect-square bg-muted overflow-hidden">
                      <MediaThumb item={item} className="group-hover:scale-105 transition-transform duration-300" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 pointer-events-none" />
                      {item.created_at ? (
                        <div className="absolute left-2 bottom-2">
                          <div className="rounded-full bg-black/60 text-white text-[11px] px-2 py-1 backdrop-blur-sm">
                            {formatDate(item.created_at)}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Selection checkbox */}
                    {isSelecting ? (
                      <div className="absolute left-2 top-2">
                        <div
                          className={`h-7 w-7 rounded-full border flex items-center justify-center shadow-sm backdrop-blur transition-colors ${
                            selectedItemIds.has(item.id)
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-background/90 border-border text-transparent"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </div>
                      </div>
                    ) : null}

                    {/* Quick delete — visible on hover when not selecting */}
                    {!isSelecting ? (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ConfirmPopover
                          trigger={
                            <Button
                              type="button"
                              size="icon"
                              variant="secondary"
                              className="h-7 w-7 rounded-full bg-background/90 border border-border shadow-sm hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                              aria-label="Remover mídia"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          }
                          title="Remover esta mídia?"
                          description="Essa ação não pode ser desfeita."
                          confirmLabel="Remover"
                          onConfirm={() => onDeleteMediaItem?.(item.id, item.url)}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}

                {/* Add tile */}
                {!isSelecting ? (
                  <div
                    className="aspect-square rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-muted/20 hover:border-muted-foreground/40 transition-colors text-muted-foreground group"
                    onClick={triggerFileInput}
                  >
                    <div className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center group-hover:bg-muted/30 transition-colors">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-medium">Adicionar</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* ── Bulk action bar ── */}
            {isSelecting ? (
              <div className="mt-6 rounded-2xl border border-border bg-muted/30 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  {/* Count badge + select all */}
                  <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-xs font-semibold text-primary">
                        {selectedItemsCount > 0
                          ? `${selectedItemsCount} selecionado${selectedItemsCount > 1 ? "s" : ""}`
                          : "Nenhum"}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                      disabled={!selectedItems.length}
                      onClick={toggleSelectAll}
                    >
                      {allSelected ? "Limpar seleção" : "Selecionar tudo"}
                    </Button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto">
                    <Popover open={movePopoverOpen} onOpenChange={setMovePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={selectedItemsCount === 0 || isBulkLoading}
                          className="h-8"
                        >
                          {isBulkLoading ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Mover
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-72 max-w-[calc(100vw-2rem)] p-2"
                        align="end"
                        side="top"
                        sideOffset={8}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                          Mover para…
                        </div>
                        <div className="flex flex-col">
                          {allGalleryNames
                            .filter((name) => name !== selectedGallery)
                            .map((name) => (
                              <Button
                                key={name}
                                type="button"
                                variant="ghost"
                                className="justify-start px-2 h-9"
                                onClick={async () => {
                                  setMovePopoverOpen(false);
                                  await bulkMoveSelected(name);
                                }}
                              >
                                <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                                {name}
                              </Button>
                            ))}
                        </div>
                        <div className="mt-2 border-t border-border pt-2">
                          <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                            Nova galeria
                          </div>
                          <div className="flex gap-2 px-2 pb-1">
                            <Input
                              value={moveToNewGalleryName}
                              onChange={(e) => setMoveToNewGalleryName(e.target.value)}
                              placeholder="Nome da galeria"
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  const name = String(moveToNewGalleryName || "").trim();
                                  if (!name) return;
                                  setMovePopoverOpen(false);
                                  setMoveToNewGalleryName("");
                                  await bulkMoveSelected(name);
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={!String(moveToNewGalleryName || "").trim()}
                              onClick={async () => {
                                const name = String(moveToNewGalleryName || "").trim();
                                if (!name) return;
                                setMovePopoverOpen(false);
                                setMoveToNewGalleryName("");
                                await bulkMoveSelected(name);
                              }}
                            >
                              Criar
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <ConfirmPopover
                      trigger={
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={selectedItemsCount === 0 || isBulkLoading}
                          className="h-8"
                        >
                          {isBulkLoading ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Excluir
                        </Button>
                      }
                      title={`Excluir ${selectedItemsCount} item${selectedItemsCount > 1 ? "s" : ""}?`}
                      description="Essa ação não pode ser desfeita."
                      confirmLabel="Excluir"
                      onConfirm={bulkDeleteSelected}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </DropZone>
        )}
      </div>

      {/* ── Delete gallery confirmation dialog ── */}
      {pendingDeleteGallery ? (
        <Dialog open onOpenChange={(open) => { if (!open) setPendingDeleteGallery(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir galeria?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">"{pendingDeleteGallery.name}"</span> e todos os seus{" "}
              {pendingDeleteGallery.items.length} item{pendingDeleteGallery.items.length !== 1 ? "s" : ""} serão removidos permanentemente. Essa ação não pode ser desfeita.
            </p>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setPendingDeleteGallery(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  const { name, items } = pendingDeleteGallery;
                  setPendingDeleteGallery(null);
                  const g = groups.find((x) => x.name === name) || { name, items: [] };
                  deleteGallery(g, items);
                }}
              >
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,application/pdf"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          handleFiles(files);
        }}
      />
    </div>
  );

  // ─── Overview (read-only) ──────────────────────────────────────────────────
  return (
    <Container className={containerClassName}>
      {showOverview ? (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Galeria e Documentos</h2>
          {canEdit && !managerInline ? (
            <>
             
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditOpen(true)}
                className="inline-flex"
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Gerenciar
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {showOverview && groups.length === 0 && docs.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-border rounded-2xl bg-muted/20">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-foreground font-semibold">{emptyMessage || "Nenhuma mídia disponível"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            As fotos, vídeos e documentos aparecerão aqui.
          </p>
        </div>
      ) : showOverview ? (
        <div className="space-y-8">
          {groups.map((g) => {
            const items = Array.isArray(g.items) ? g.items : [];
            const displayItems = items.slice(0, 4);
            const hasMore = items.length > 4;

            return (
              <div key={g.name}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 tracking-tight min-w-0">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-muted/40 border border-border shrink-0">
                      <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    </span>
                    <span className="truncate">{g.name}</span>
                  </h4>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {displayItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="group cursor-pointer"
                      onClick={() => onOpenViewer?.(items, idx)}
                    >
                      <div className="aspect-[4/3] rounded-2xl overflow-hidden mb-2 relative bg-muted shadow-sm border border-border">
                        {["video", "video_url"].includes(item.type) ? (
                          <div className="w-full h-full flex items-center justify-center bg-slate-900">
                            <Video className="w-10 h-10 text-white/80 group-hover:scale-110 transition-transform" />
                          </div>
                        ) : (
                          <img
                            src={item.url}
                            alt={item.description || item.name || "Mídia"}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-70" />
                      </div>
                      <p className="text-xs text-muted-foreground font-medium pl-1">
                        {item.created_at ? formatDate(item.created_at) : "Data não informada"}
                      </p>
                    </div>
                  ))}

                  {hasMore ? (
                    <div
                      className="aspect-[4/3] rounded-2xl bg-muted/20 border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors group"
                      onClick={() => onOpenViewer?.(items, 4)}
                    >
                      <div className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center mb-2 group-hover:bg-muted/20 transition-colors">
                        <FolderOpen className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">Ver todas</span>
                      <span className="text-xs text-muted-foreground font-medium">
                        +{items.length - 4} itens
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {docs.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 tracking-tight">
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-muted/40 border border-border">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </span>
                  Documentos
                </h4>
                <div className="text-xs text-muted-foreground">
                  {docs.length} arquivo{docs.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {docs.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center p-3 rounded-2xl border border-border hover:border-muted-foreground/30 hover:bg-muted/20 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted/30 border border-border flex items-center justify-center text-muted-foreground mr-3 shrink-0 group-hover:bg-muted/40 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate">
                        {doc.title || doc.name || "Documento sem título"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {doc.created_at ? formatDate(doc.created_at) : "Data não informada"}
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 ml-auto group-hover:text-foreground transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {managerInline ? ManagementPanel : null}

      {/* ── Confirm delete gallery dialog ── */}
      <Dialog open={!!pendingDeleteGallery} onOpenChange={(open) => { if (!open) setPendingDeleteGallery(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir galeria?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A galeria <span className="font-semibold text-foreground">"{pendingDeleteGallery?.name}"</span> e todos os seus{" "}
            {(pendingDeleteGallery?.items?.length ?? 0) > 0
              ? `${pendingDeleteGallery.items.length} item(s) serão removidos`
              : "itens serão removidos"}{" "}
            permanentemente. Essa ação não pode ser desfeita.
          </p>
          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingDeleteGallery(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const { name, items } = pendingDeleteGallery;
                setPendingDeleteGallery(null);
                deleteGallery({ name }, items);
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!managerInline ? (
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent
            className="sm:max-w-4xl max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col overflow-x-hidden"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="sr-only">Gerenciar galerias</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1">{ManagementPanel}</div>
            <DialogFooter className="shrink-0 pt-3 border-t bg-background">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Fechar
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Container>
  );
}
