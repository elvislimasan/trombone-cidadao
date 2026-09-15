import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Home,
  MoreVertical,
  MoveRight,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ROOT = 'root';

const byOrder = (a, b) =>
  (Number(a.sort_order ?? a.document_order) || 0) - (Number(b.sort_order ?? b.document_order) || 0)
  || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');

const itemName = (item, fallback) => String(item?.name || fallback).trim();

export default function WorkDocumentOrganizer({
  documents = [],
  folders = [],
  canEdit = false,
  busy = false,
  onUpload,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onUpdateDocument,
  onDeleteDocument,
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [editDialog, setEditDialog] = useState(null);
  const [editName, setEditName] = useState('');
  const [moveDialog, setMoveDialog] = useState(null);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTargetKey, setDropTargetKey] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const foldersById = useMemo(
    () => new Map(folders.map((folder) => [String(folder.id), folder])),
    [folders],
  );

  const childrenByParent = useMemo(() => {
    const result = new Map();
    folders.forEach((folder) => {
      const key = folder.parent_id ? String(folder.parent_id) : ROOT;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(folder);
    });
    result.forEach((items) => items.sort(byOrder));
    return result;
  }, [folders]);

  const documentsByFolder = useMemo(() => {
    const result = new Map();
    documents.forEach((document) => {
      const key = document.document_folder_id ? String(document.document_folder_id) : ROOT;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(document);
    });
    result.forEach((items) => items.sort(byOrder));
    return result;
  }, [documents]);

  useEffect(() => {
    if (currentFolderId && !foldersById.has(String(currentFolderId))) setCurrentFolderId(null);
  }, [currentFolderId, foldersById]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const closeWithEscape = (event) => event.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [contextMenu]);

  const breadcrumbs = useMemo(() => {
    const result = [];
    const visited = new Set();
    let cursor = currentFolderId ? foldersById.get(String(currentFolderId)) : null;
    while (cursor && !visited.has(String(cursor.id))) {
      visited.add(String(cursor.id));
      result.unshift(cursor);
      cursor = cursor.parent_id ? foldersById.get(String(cursor.parent_id)) : null;
    }
    return result;
  }, [currentFolderId, foldersById]);

  const descendantIds = (folderId) => {
    const descendants = new Set([String(folderId)]);
    const queue = [String(folderId)];
    while (queue.length) {
      const parentId = queue.shift();
      for (const child of childrenByParent.get(parentId) || []) {
        const id = String(child.id);
        if (!descendants.has(id)) {
          descendants.add(id);
          queue.push(id);
        }
      }
    }
    return descendants;
  };

  const currentKey = currentFolderId ? String(currentFolderId) : ROOT;
  const visibleFolders = childrenByParent.get(currentKey) || [];
  const visibleDocuments = documentsByFolder.get(currentKey) || [];

  const openCreate = () => {
    setFolderName('');
    setFolderDialog({ parentId: currentFolderId || null });
  };

  const submitFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    const created = await onCreateFolder?.(folderDialog?.parentId || null, name);
    setFolderDialog(null);
    setFolderName('');
    if (created?.id) setCurrentFolderId(created.id);
  };

  const openEdit = (type, item) => {
    setContextMenu(null);
    setEditName(itemName(item, type === 'folder' ? 'Nova pasta' : 'Documento'));
    setEditDialog({ type, item });
  };

  const submitEdit = async () => {
    const name = editName.trim();
    if (!name || !editDialog?.item) return;
    if (editDialog.type === 'folder') await onRenameFolder?.(editDialog.item.id, name);
    else await onUpdateDocument?.(editDialog.item.id, { name });
    setEditDialog(null);
    setEditName('');
  };

  const moveOptions = useMemo(() => {
    const blocked = moveDialog?.type === 'folder' ? descendantIds(moveDialog.item.id) : new Set();
    return folders
      .filter((folder) => !blocked.has(String(folder.id)))
      .map((folder) => {
        const path = [];
        const visited = new Set();
        let cursor = folder;
        while (cursor && !visited.has(String(cursor.id))) {
          visited.add(String(cursor.id));
          path.unshift(cursor.name);
          cursor = cursor.parent_id ? foldersById.get(String(cursor.parent_id)) : null;
        }
        return { id: String(folder.id), label: path.join(' / ') };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  // descendantIds is intentionally derived from the same folder maps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childrenByParent, folders, foldersById, moveDialog]);

  const openMove = (type, item) => {
    setContextMenu(null);
    setMoveTargetId(type === 'folder' ? String(item.parent_id || '') : String(item.document_folder_id || ''));
    setMoveDialog({ type, item });
  };

  const submitMove = async () => {
    if (!moveDialog?.item) return;
    const targetId = moveTargetId || null;
    if (moveDialog.type === 'folder') await onMoveFolder?.(moveDialog.item.id, targetId);
    else {
      const destinationKey = targetId || ROOT;
      await onUpdateDocument?.(moveDialog.item.id, {
        document_folder_id: targetId,
        document_order: (documentsByFolder.get(destinationKey) || []).length,
      });
    }
    setMoveDialog(null);
  };

  const startDragging = (event, type, item) => {
    if (!canEdit || busy) return;
    const payload = { type, id: String(item.id) };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(payload));
    setDraggedItem(payload);
    setContextMenu(null);
  };

  const canDropInto = (folderId) => {
    if (!draggedItem) return false;
    if (draggedItem.type !== 'folder') return true;
    return !descendantIds(draggedItem.id).has(String(folderId || ROOT));
  };

  const allowItemDrop = (event, folderId = null) => {
    if (!canEdit || !canDropInto(folderId)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetKey(folderId ? String(folderId) : ROOT);
  };

  const dropItem = async (event, folderId = null) => {
    if (!canEdit || !draggedItem || !canDropInto(folderId)) return;
    event.preventDefault();
    event.stopPropagation();
    const targetId = folderId || null;
    const payload = draggedItem;
    setDraggedItem(null);
    setDropTargetKey(null);

    if (payload.type === 'folder') {
      const folder = foldersById.get(payload.id);
      if (!folder || String(folder.parent_id || '') === String(targetId || '')) return;
      await onMoveFolder?.(folder.id, targetId);
      return;
    }

    const document = documents.find((item) => String(item.id) === payload.id);
    if (!document || String(document.document_folder_id || '') === String(targetId || '')) return;
    const destinationKey = targetId || ROOT;
    await onUpdateDocument?.(document.id, {
      document_folder_id: targetId,
      document_order: (documentsByFolder.get(destinationKey) || []).length,
    });
  };

  const finishDragging = () => {
    setDraggedItem(null);
    setDropTargetKey(null);
  };

  const openContextMenu = (event, type, item) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ type, item, x: event.clientX, y: event.clientY });
  };

  const openButtonMenu = (event, type, item) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({ type, item, x: rect.right, y: rect.bottom + 4 });
  };

  const deleteContextItem = () => {
    const menu = contextMenu;
    setContextMenu(null);
    if (menu?.type === 'folder') onDeleteFolder?.(menu.item);
    else if (menu?.item) onDeleteDocument?.(menu.item);
  };

  return (
    <section className={busy ? 'pointer-events-none opacity-70' : ''}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50"><FolderInput className="h-4 w-4 text-muted-foreground" /></span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Documentos</h3>
            <p className="text-xs text-muted-foreground">{documents.length} arquivo{documents.length === 1 ? '' : 's'} · {folders.length} pasta{folders.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="flex-1 gap-2 sm:flex-none" onClick={openCreate}><FolderPlus className="h-4 w-4" /> Nova pasta</Button>
            <Button type="button" size="sm" className="flex-1 gap-2 sm:flex-none" onClick={() => onUpload?.(currentFolderId || null)}><Upload className="h-4 w-4" /> Adicionar</Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <nav className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-border bg-muted/20 px-2" aria-label="Caminho da pasta">
          <button type="button" onClick={() => setCurrentFolderId(null)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Home className="h-3.5 w-3.5" /> Documentos
          </button>
          {breadcrumbs.map((folder) => (
            <span key={folder.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button type="button" onClick={() => setCurrentFolderId(folder.id)} className="h-8 max-w-44 truncate rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted">{folder.name}</button>
            </span>
          ))}
        </nav>

        {canEdit && (
          <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
            Arraste arquivos ou pastas para movê-los. Clique com o botão direito para mais ações.
          </p>
        )}

        <div
          className={`min-h-44 p-3 transition-colors ${dropTargetKey === currentKey ? 'bg-primary/5 ring-2 ring-inset ring-primary/40' : ''}`}
          onDragEnter={(event) => allowItemDrop(event, currentFolderId)}
          onDragOver={(event) => allowItemDrop(event, currentFolderId)}
          onDrop={(event) => dropItem(event, currentFolderId)}
        >
          {visibleFolders.length || visibleDocuments.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleFolders.map((folder) => {
                const count = (childrenByParent.get(String(folder.id)) || []).length + (documentsByFolder.get(String(folder.id)) || []).length;
                return (
                  <div
                    key={folder.id}
                    draggable={!busy && canEdit}
                    onDragStart={(event) => startDragging(event, 'folder', folder)}
                    onDragEnd={finishDragging}
                    onDragEnter={(event) => allowItemDrop(event, folder.id)}
                    onDragOver={(event) => allowItemDrop(event, folder.id)}
                    onDrop={(event) => dropItem(event, folder.id)}
                    onContextMenu={(event) => openContextMenu(event, 'folder', folder)}
                    className={`group relative min-w-0 rounded-xl border bg-background transition ${draggedItem?.id === String(folder.id) ? 'opacity-40' : ''} ${dropTargetKey === String(folder.id) ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-transparent hover:border-border hover:bg-muted/30'}`}
                  >
                    <button type="button" onClick={() => setCurrentFolderId(folder.id)} className="flex min-h-28 w-full flex-col items-center justify-center gap-2 px-3 py-4 text-center">
                      <Folder className="h-12 w-12 fill-amber-400/25 text-amber-500" />
                      <span className="w-full truncate text-sm font-medium text-foreground">{folder.name}</span>
                      <span className="text-[10px] text-muted-foreground">{count} {count === 1 ? 'item' : 'itens'}</span>
                    </button>
                    {canEdit && <button type="button" aria-label={`Opções de ${folder.name}`} onClick={(event) => openButtonMenu(event, 'folder', folder)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"><MoreVertical className="h-4 w-4" /></button>}
                  </div>
                );
              })}

              {visibleDocuments.map((document) => (
                <div
                  key={document.id}
                  draggable={!busy && canEdit}
                  onDragStart={(event) => startDragging(event, 'document', document)}
                  onDragEnd={finishDragging}
                  onContextMenu={(event) => openContextMenu(event, 'document', document)}
                  className={`group relative min-w-0 rounded-xl border border-transparent bg-background transition hover:border-border hover:bg-muted/30 ${draggedItem?.id === String(document.id) ? 'opacity-40' : ''}`}
                >
                  <a href={document.url} target="_blank" rel="noopener noreferrer" draggable={false} className="flex min-h-28 flex-col items-center justify-center gap-2 px-3 py-4 text-center">
                    <span className="relative flex h-12 w-10 items-center justify-center rounded-md border border-border bg-muted/30">
                      <FileText className="h-7 w-7 text-muted-foreground" />
                      <span className="absolute -bottom-1 rounded bg-primary px-1 text-[8px] font-bold uppercase text-primary-foreground">{String(document.name || '').split('.').pop().slice(0, 4) || 'DOC'}</span>
                    </span>
                    <span className="w-full truncate text-sm font-medium text-foreground">{itemName(document, 'Documento')}</span>
                    <span className="text-[10px] text-muted-foreground">Abrir arquivo</span>
                  </a>
                  {canEdit && <button type="button" aria-label={`Opções de ${itemName(document, 'Documento')}`} onClick={(event) => openButtonMenu(event, 'document', document)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-100 hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"><MoreVertical className="h-4 w-4" /></button>}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center text-center text-muted-foreground">
              <FolderOpen className="h-10 w-10 opacity-40" />
              <p className="mt-2 text-sm font-medium">Esta pasta está vazia</p>
              {canEdit && <p className="mt-1 text-xs">Adicione arquivos ou arraste itens para cá.</p>}
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          role="menu"
          aria-label={`Ações de ${itemName(contextMenu.item, 'item')}`}
          className="fixed z-[10002] w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
          style={{ left: `min(${contextMenu.x}px, calc(100vw - 12.5rem))`, top: `min(${contextMenu.y}px, calc(100vh - 11rem))` }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.type === 'folder' ? (
            <button type="button" role="menuitem" onClick={() => { setCurrentFolderId(contextMenu.item.id); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"><FolderOpen className="h-4 w-4" /> Abrir</button>
          ) : (
            <a role="menuitem" href={contextMenu.item.url} target="_blank" rel="noopener noreferrer" onClick={() => setContextMenu(null)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"><FileText className="h-4 w-4" /> Abrir</a>
          )}
          <button type="button" role="menuitem" onClick={() => openEdit(contextMenu.type, contextMenu.item)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"><Pencil className="h-4 w-4" /> Renomear</button>
          <button type="button" role="menuitem" onClick={() => openMove(contextMenu.type, contextMenu.item)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"><MoveRight className="h-4 w-4" /> Mover para...</button>
          <div className="my-1 h-px bg-border" />
          <button type="button" role="menuitem" onClick={deleteContextItem} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /> Excluir</button>
        </div>
      )}

      <Dialog open={Boolean(folderDialog)} onOpenChange={(open) => !open && setFolderDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova pasta</DialogTitle></DialogHeader>
          <Input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Nome da pasta" maxLength={100} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitFolder(); } }} />
          <DialogFooter><Button type="button" variant="outline" onClick={() => setFolderDialog(null)}>Cancelar</Button><Button type="button" disabled={!folderName.trim()} onClick={submitFolder}>Criar pasta</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editDialog)} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Renomear {editDialog?.type === 'folder' ? 'pasta' : 'arquivo'}</DialogTitle></DialogHeader>
          <Input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={160} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitEdit(); } }} />
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialog(null)}>Cancelar</Button><Button type="button" disabled={!editName.trim()} onClick={submitEdit}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveDialog)} onOpenChange={(open) => !open && setMoveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Mover “{itemName(moveDialog?.item, 'item')}”</DialogTitle></DialogHeader>
          <label className="grid gap-2 text-sm font-medium">
            Destino
            <select value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Documentos (raiz)</option>
              {moveOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
            </select>
          </label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMoveDialog(null)}>Cancelar</Button><Button type="button" onClick={submitMove}>Mover</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
