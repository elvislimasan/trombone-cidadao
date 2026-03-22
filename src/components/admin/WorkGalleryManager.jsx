import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { ObraGallery } from "@/components/project/obra/ObraGallery";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Check, FileText, Pencil, Trash2, Upload, X } from "lucide-react";

export function WorkGalleryManager({
  workId,
  measurementId = null,
  embedded = false,
  inline = true,
  showMeasurementSelector = true,
  allowAll = true,
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const isFixedMeasurement = Boolean(measurementId);
  const [activeMeasurementId, setActiveMeasurementId] = useState(measurementId);
  const [hasLegacyMedia, setHasLegacyMedia] = useState(false);
  const [scope, setScope] = useState("phase"); // phase | legacy
  const [pendingDeleteDocument, setPendingDeleteDocument] = useState(null);
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false);
  const documentFileInputRef = useRef(null);
  const [renamingDocumentId, setRenamingDocumentId] = useState(null);
  const [renamingDocumentValue, setRenamingDocumentValue] = useState("");

  const loadMedia = useCallback(async () => {
    if (!workId) return;
    setLoading(true);
    try {
      let q = supabase.from("public_work_media").select("*").eq("work_id", workId).order("created_at", { ascending: false });
      if (!isFixedMeasurement && scope === "legacy") {
        q = q.is("measurement_id", null);
      } else {
        const mid = isFixedMeasurement ? measurementId : activeMeasurementId;
        if (mid) q = q.eq("measurement_id", mid);
        else if (!allowAll) {
          setMedia([]);
          setLoading(false);
          return;
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      setMedia(data || []);
    } catch (e) {
      toast({ title: "Erro ao carregar mídias", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeMeasurementId, allowAll, isFixedMeasurement, measurementId, scope, toast, workId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    if (!workId) return;
    if (!showMeasurementSelector) return;
    if (isFixedMeasurement) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("public_work_measurements")
          .select("id, title, created_at")
          .eq("work_id", workId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        setMeasurements(data || []);
        if (!activeMeasurementId && Array.isArray(data) && data.length > 0) {
          setActiveMeasurementId(data[0].id);
        }
      } catch (e) {
        toast({ title: "Erro ao carregar fases", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMeasurementId, isFixedMeasurement, showMeasurementSelector, toast, workId]);

  useEffect(() => {
    if (isFixedMeasurement) return;
    if (!showMeasurementSelector) return;
    if (!allowAll && activeMeasurementId == null && measurements.length > 0) {
      setActiveMeasurementId(measurements[0].id);
    }
  }, [activeMeasurementId, allowAll, isFixedMeasurement, measurements, showMeasurementSelector]);

  useEffect(() => {
    if (!workId) return;
    if (isFixedMeasurement) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("public_work_media")
          .select("id")
          .eq("work_id", workId)
          .is("measurement_id", null)
          .limit(1);
        if (error) throw error;
        if (cancelled) return;
        setHasLegacyMedia(Array.isArray(data) && data.length > 0);
      } catch (e) {
        if (cancelled) return;
        setHasLegacyMedia(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFixedMeasurement, workId]);

  useEffect(() => {
    if (isFixedMeasurement) return;
    if (!showMeasurementSelector) return;
    if (scope === "legacy") return;
    if (!allowAll && !activeMeasurementId && measurements.length > 0) {
      setActiveMeasurementId(measurements[0].id);
    }
  }, [activeMeasurementId, allowAll, isFixedMeasurement, measurements, scope, showMeasurementSelector]);

  useEffect(() => {
    if (isFixedMeasurement) return;
    if (!showMeasurementSelector) return;
    if (measurements.length === 0 && hasLegacyMedia) {
      setScope("legacy");
    } else {
      setScope("phase");
    }
  }, [hasLegacyMedia, isFixedMeasurement, measurements.length, showMeasurementSelector]);

  const galleries = useMemo(() => {
    const items = (media || []).filter((m) => ["image", "photo", "video", "video_url"].includes(m.type));
    const map = new Map();
    for (const it of items) {
      const name = it.gallery_name || "Geral";
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(it);
    }
    return Array.from(map.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([name, list]) => ({ name, items: list }));
  }, [media]);

  const documents = useMemo(() => {
    return (media || [])
      .filter((m) => ["pdf", "document", "file"].includes(m.type))
      .map((m) => ({ ...m, title: m.name }));
  }, [media]);

  const deleteFromStorageIfPossible = useCallback(async (url) => {
    try {
      const filePath = new URL(url).pathname.split("/work-media/")[1];
      if (!filePath) return;
      await supabase.storage.from("work-media").remove([decodeURIComponent(filePath)]);
    } catch (e) {
    }
  }, []);

  const handleRenameGallery = useCallback(
    async (oldName, newName) => {
      if (!user?.is_admin) return;
      if (!workId) return;
      const fromName = String(oldName || "").trim();
      const toName = String(newName || "").trim();
      if (!fromName || !toName || fromName === toName) return;

      try {
        let q = supabase.from("public_work_media").update({ gallery_name: toName }).eq("work_id", workId);
        if (!isFixedMeasurement && scope === "legacy") {
          q = q.is("measurement_id", null);
        } else {
          const mid = isFixedMeasurement ? measurementId : activeMeasurementId;
          if (mid) q = q.eq("measurement_id", mid);
        }
        if (fromName === "Geral") {
          q = q.or("gallery_name.is.null,gallery_name.eq.Geral");
        } else {
          q = q.eq("gallery_name", fromName);
        }
        const { error } = await q;
        if (error) throw error;
        toast({ title: "Galeria renomeada" });
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao renomear galeria", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [activeMeasurementId, isFixedMeasurement, loadMedia, measurementId, scope, toast, user?.is_admin, workId]
  );

  const handleDeleteGallery = useCallback(
    async (_galleryName, items) => {
      if (!user?.is_admin) return;
      const list = Array.isArray(items) ? items : [];
      const ids = list.map((i) => i?.id).filter(Boolean);
      if (ids.length === 0) return;

      try {
        const { error } = await supabase.from("public_work_media").delete().in("id", ids);
        if (error) throw error;

        const urls = list.map((i) => i?.url).filter(Boolean);
        for (const url of urls) {
          await deleteFromStorageIfPossible(url);
        }

        toast({ title: "Galeria excluída" });
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao excluir galeria", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [deleteFromStorageIfPossible, loadMedia, toast, user?.is_admin]
  );

  const handleUpdateMediaItem = useCallback(
    async (mediaId, patch) => {
      if (!user?.is_admin) return;
      const id = String(mediaId || "").trim();
      if (!id) return;
      try {
        const { error } = await supabase.from("public_work_media").update(patch || {}).eq("id", id);
        if (error) throw error;
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao atualizar mídia", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [loadMedia, toast, user?.is_admin]
  );

  const handleDeleteMediaItem = useCallback(
    async (mediaId, url) => {
      if (!user?.is_admin) return;
      const id = String(mediaId || "").trim();
      if (!id) return;
      try {
        const { error } = await supabase.from("public_work_media").delete().eq("id", id);
        if (error) throw error;
        if (url) await deleteFromStorageIfPossible(url);
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao remover mídia", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [deleteFromStorageIfPossible, loadMedia, toast, user?.is_admin]
  );

  const handleBulkUpdateMediaItems = useCallback(
    async (mediaIds, patch) => {
      if (!user?.is_admin) return;
      const ids = Array.isArray(mediaIds) ? mediaIds.map((x) => String(x).trim()).filter(Boolean) : [];
      if (ids.length === 0) return;
      try {
        const { error } = await supabase.from("public_work_media").update(patch || {}).in("id", ids);
        if (error) throw error;
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao atualizar mídias", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [loadMedia, toast, user?.is_admin]
  );

  const handleBulkDeleteMediaItems = useCallback(
    async (items) => {
      if (!user?.is_admin) return;
      const list = Array.isArray(items) ? items : [];
      const ids = list.map((i) => i?.id).filter(Boolean);
      if (ids.length === 0) return;
      try {
        const { error } = await supabase.from("public_work_media").delete().in("id", ids);
        if (error) throw error;

        const paths = list
          .map((i) => i?.url)
          .filter(Boolean)
          .map((url) => {
            try {
              const filePath = new URL(url).pathname.split("/work-media/")[1];
              return filePath ? decodeURIComponent(filePath) : null;
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean);

        if (paths.length > 0) {
          try {
            await supabase.storage.from("work-media").remove(paths);
          } catch (e) {
          }
        }

        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao remover mídias", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [loadMedia, toast, user?.is_admin]
  );

  const handleUploadFiles = useCallback(
    async (galleryName, files) => {
      if (!user?.is_admin) return;
      if (!workId) return;
      const list = Array.isArray(files) ? files : [];
      const images = list.filter((f) => f?.type?.startsWith("image/"));
      if (images.length === 0) {
        toast({ title: "Nenhuma imagem selecionada", variant: "destructive" });
        return;
      }

      const targetGalleryName = String(galleryName || "").trim() || "Geral";
      const mid = isFixedMeasurement ? measurementId : scope === "legacy" ? null : activeMeasurementId;
      const targetFolder = mid ? `measurements/${mid}` : `works/${workId}`;

      try {
        for (const file of images) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
          const path = `${targetFolder}/${fileName}`;

          const { error: uploadError } = await supabase.storage.from("work-media").upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("work-media").getPublicUrl(path);

          const type = "photo";

          const { error: dbError } = await supabase.from("public_work_media").insert({
            work_id: workId,
            measurement_id: mid || null,
            url: publicUrl,
            type,
            name: file.name,
            status: "approved",
            gallery_name: targetGalleryName,
            contributor_id: user?.id || null,
          });
          if (dbError) throw dbError;
        }

        toast({ title: "Arquivos adicionados" });
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao enviar arquivos", description: e?.message || "Tente novamente.", variant: "destructive" });
      }
    },
    [activeMeasurementId, isFixedMeasurement, loadMedia, measurementId, scope, toast, user?.id, user?.is_admin, workId]
  );

  const handleUploadDocuments = useCallback(
    async (files) => {
      if (!user?.is_admin) return;
      if (!workId) return;
      const list = Array.isArray(files) ? files : [];
      if (list.length === 0) return;

      const mid = isFixedMeasurement ? measurementId : scope === "legacy" ? null : activeMeasurementId;
      const targetFolder = mid ? `measurements/${mid}/documents` : `works/${workId}/documents`;

      setIsUploadingDocuments(true);
      try {
        for (const file of list) {
          const fileExt = file.name.split(".").pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
          const path = `${targetFolder}/${fileName}`;

          const { error: uploadError } = await supabase.storage.from("work-media").upload(path, file);
          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("work-media").getPublicUrl(path);

          const type = file.type === "application/pdf" ? "pdf" : "file";

          const { error: dbError } = await supabase.from("public_work_media").insert({
            work_id: workId,
            measurement_id: mid || null,
            url: publicUrl,
            type,
            name: file.name,
            status: "approved",
            gallery_name: null,
            contributor_id: user?.id || null,
          });
          if (dbError) throw dbError;
        }

        toast({ title: "Documento(s) adicionado(s)" });
        await loadMedia();
      } catch (e) {
        toast({ title: "Erro ao enviar documentos", description: e?.message || "Tente novamente.", variant: "destructive" });
      } finally {
        setIsUploadingDocuments(false);
      }
    },
    [activeMeasurementId, isFixedMeasurement, loadMedia, measurementId, scope, toast, user?.id, user?.is_admin, workId]
  );

  return (
    <div className={loading ? "opacity-70 pointer-events-none" : ""}>
      {showMeasurementSelector && !isFixedMeasurement ? (
        <div className="mb-4">
          {hasLegacyMedia ? (
            <div className="flex items-center gap-2 mb-3">
              <Button type="button" size="sm" variant={scope === "phase" ? "secondary" : "outline"} onClick={() => setScope("phase")}>
                Fases
              </Button>
              <Button type="button" size="sm" variant={scope === "legacy" ? "secondary" : "outline"} onClick={() => setScope("legacy")}>
                Galeria legado
              </Button>
            </div>
          ) : null}

          {scope === "phase" ? (
            <div className="text-sm font-semibold text-foreground mb-2">Fases / Licitações</div>
          ) : (
            <div className="text-sm font-semibold text-foreground mb-2">Galeria legado</div>
          )}

          <div className="flex flex-wrap gap-2">
            {allowAll ? (
              <Button
                type="button"
                variant={!activeMeasurementId ? "secondary" : "outline"}
                size="sm"
                onClick={() => setActiveMeasurementId(null)}
              >
                Todas
              </Button>
            ) : null}
           
            {scope === "phase"
              ? measurements.map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    variant={activeMeasurementId === m.id ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setActiveMeasurementId(m.id)}
                    className="max-w-full"
                  >
                    <span className="truncate">{m.title || "Fase"}</span>
                  </Button>
                ))
              : null}
          </div>
        </div>
      ) : null}

      <ObraGallery
        galleries={galleries}
        embedded={embedded}
        canEdit={Boolean(user?.is_admin)}
        managerInline={inline}
        showOverview={!inline}
        onRenameGallery={handleRenameGallery}
        onDeleteGallery={handleDeleteGallery}
        onUpdateMediaItem={handleUpdateMediaItem}
        onDeleteMediaItem={handleDeleteMediaItem}
        onUploadFiles={handleUploadFiles}
        onBulkUpdateMediaItems={handleBulkUpdateMediaItems}
        onBulkDeleteMediaItems={handleBulkDeleteMediaItems}
        phaseMoveOptions={measurements.map((m) => ({ id: m.id, label: m.title || "Fase" }))}
        currentMeasurementId={scope === "phase" ? activeMeasurementId : null}
        allowMoveToLegacy={scope === "phase"}
      />

      <div className="border-t mt-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-muted/40 border border-border">
              <FileText className="w-4 h-4 text-muted-foreground" />
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">Documentos</div>
              <div className="text-xs text-muted-foreground">{documents.length} arquivo{documents.length === 1 ? "" : "s"}</div>
            </div>
          </div>

          {user?.is_admin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => documentFileInputRef.current?.click()}
              disabled={isUploadingDocuments}
              className="w-full sm:w-auto"
            >
              <Upload className="w-4 h-4 mr-2" />
              Adicionar documento
            </Button>
          ) : null}
        </div>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 p-3 rounded-2xl border border-border hover:border-muted-foreground/30 hover:bg-muted/20 transition-all">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-muted/30 border border-border flex items-center justify-center text-muted-foreground mr-3 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    {renamingDocumentId === doc.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={renamingDocumentValue}
                          onChange={(e) => setRenamingDocumentValue(e.target.value)}
                          className="h-9"
                          onClick={(e) => e.preventDefault()}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-9 w-9"
                          onClick={(e) => {
                            e.preventDefault();
                            setRenamingDocumentId(null);
                            setRenamingDocumentValue("");
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="default"
                          className="h-9 w-9"
                          disabled={!String(renamingDocumentValue || "").trim()}
                          onClick={async (e) => {
                            e.preventDefault();
                            const nextName = String(renamingDocumentValue || "").trim();
                            if (!nextName) return;
                            await handleUpdateMediaItem(doc.id, { name: nextName });
                            setRenamingDocumentId(null);
                            setRenamingDocumentValue("");
                          }}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-foreground truncate">{doc.title || doc.name || "Documento"}</p>
                    )}
                  </div>
                </a>

                {user?.is_admin ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={(e) => {
                        e.preventDefault();
                        setRenamingDocumentId(doc.id);
                        setRenamingDocumentValue(String(doc.title || doc.name || "").trim());
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="h-9 w-9"
                      onClick={(e) => {
                        e.preventDefault();
                        setPendingDeleteDocument({ id: doc.id, name: doc.title || doc.name || "Documento", url: doc.url });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-2xl bg-muted/10">
            Nenhum documento anexado.
          </div>
        )}

        {user?.is_admin ? (
          <Input
            ref={documentFileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              handleUploadDocuments(files);
            }}
          />
        ) : null}

        <Dialog open={!!pendingDeleteDocument} onOpenChange={(open) => !open && setPendingDeleteDocument(null)}>
          <DialogContent className="sm:max-w-md bg-card">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground">Excluir documento?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              O documento <span className="font-semibold text-foreground">"{pendingDeleteDocument?.name}"</span> será removido permanentemente.
            </p>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isUploadingDocuments}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={isUploadingDocuments}
                onClick={async () => {
                  const doc = pendingDeleteDocument;
                  setPendingDeleteDocument(null);
                  if (!doc) return;
                  await handleDeleteMediaItem(doc.id, doc.url);
                }}
              >
                Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
