import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TREE_ORIGINS } from '@/lib/arborization';
import { treeNameKey, uploadTreePhoto } from '@/lib/treeInventory';
import { supabase } from '@/lib/customSupabaseClient';

export default function TreeSpeciesField({ species, value, onSelect, onCreated, onUpdated, cityId, label = 'Nome popular', disabled = false, loading = false, allowCreate = true, allowEdit = allowCreate, onCreatingChange }) {
  const id = useId();
  const trigger = useRef(null);
  const savingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [illustration, setIllustration] = useState(null);
  const [preview, setPreview] = useState('');
  const illustrationInput = useRef(null);
  useEffect(() => {
    if (!illustration) { setPreview(''); return; }
    const url = URL.createObjectURL(illustration); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [illustration]);
  const selected = species.find(item => item.id === value);
  const term = treeNameKey(search);
  const filtered = species.filter(item => treeNameKey(`${item.common_name} ${item.scientific_name || ''}`).includes(term));
  const editing = Boolean(draft?.id);
  const duplicate = draft && !editing && species.find(item => treeNameKey(item.common_name) === treeNameKey(draft.common_name)
    || (draft.scientific_name.trim() && treeNameKey(item.scientific_name) === treeNameKey(draft.scientific_name)));
  const close = () => { setDraft(null); setError(''); setIllustration(null); onCreatingChange?.(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const create = name => {
    setOpen(false); setError(''); setIllustration(null);
    setDraft({ common_name: name, scientific_name: '', origin: 'nao_identificada' });
    onCreatingChange?.(true);
  };
  const edit = () => {
    if (!selected || !allowEdit || disabled || loading) return;
    setOpen(false); setError(''); setIllustration(null);
    setDraft({ ...selected, illustration_url: selected.illustration_url || '' });
    onCreatingChange?.(true);
  };
  const choose = item => { onSelect(item); setOpen(false); setSearch(''); };
  const submit = async event => {
    event?.preventDefault(); event?.stopPropagation();
    if (savingRef.current || !draft || (editing ? !allowEdit : !allowCreate)) return;
    if (duplicate) { onSelect(duplicate); close(); return; }
    if (!draft.common_name.trim()) { setError('Informe o nome popular da espécie.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    let uploaded;
    let persisted = false;
    try {
      uploaded = await uploadTreePhoto(supabase, illustration, cityId);
      const query = editing ? supabase.from('city_tree_species').update({ illustration_url: uploaded?.url || draft.illustration_url || null }).eq('id', draft.id).eq('city_id', cityId) : supabase.from('city_tree_species').insert({ city_id: cityId,
        common_name: draft.common_name.trim(), scientific_name: draft.scientific_name.trim() || null, origin: draft.origin,
        ...(uploaded ? { illustration_url: uploaded.url } : {}),
      });
      const { data, error: saveError } = await query.select().single();
      if (saveError && (uploaded || editing) && ['PGRST204', '42703'].includes(saveError.code)) throw new Error('O cadastro de imagens ilustrativas ainda não está disponível nesta instalação. A imagem foi mantida para tentar novamente.');
      if (saveError) throw new Error(editing ? 'Não foi possível atualizar a imagem da espécie. Verifique sua permissão e tente novamente. A imagem selecionada foi mantida.' : saveError.code === '23505' ? 'Esta espécie já está no catálogo. Feche esta janela e busque pelo nome popular ou científico.' : 'Não foi possível incluir a espécie. Seus dados foram mantidos para tentar novamente.');
      persisted = true;
      if (editing) onUpdated?.(data);
      else { onCreated(data); onSelect(data); }
      close();
    } catch (err) {
      if (uploaded && !persisted) { try { await supabase.storage.from('tree-photos').remove([uploaded.path]); } catch { /* Mantém a mensagem e a imagem para nova tentativa. */ } }
      setError(err.message);
    }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <div className="min-w-0 space-y-2" data-testid="tree-species-field">
    <div className="flex flex-wrap items-center justify-between gap-2"><label id={`${id}-label`} className="text-sm font-medium">{label}</label>
      {!draft && <div className="flex flex-wrap gap-1">
        {allowEdit && selected && <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-primary" disabled={disabled || loading} onClick={edit}><Pencil className="h-3.5 w-3.5" />Editar espécie</Button>}
        {allowCreate && <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-primary" disabled={disabled || loading} onClick={() => create('')}><Plus className="h-3.5 w-3.5" />Nova espécie</Button>}
      </div>}
    </div>
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setSearch(''); }}>
      <PopoverTrigger asChild><Button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} data-value={value || ''}
        variant="outline" className="h-11 w-full justify-between gap-2 bg-background px-3 font-normal" disabled={disabled || loading || !!draft}>
        <span className="truncate">{loading ? 'Carregando espécies…' : selected?.common_name || 'Não identificada'}</span><ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="z-[10030] w-[var(--radix-popover-trigger-width)] min-w-[240px] max-w-[calc(100vw-2rem)] p-0" onKeyDown={event => event.key === 'Enter' && event.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandInput aria-label="Buscar espécie" placeholder="Nome popular ou científico…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[240px]">
            <CommandEmpty>Nenhuma espécie encontrada.</CommandEmpty>
            <CommandGroup>
              {!term && <CommandItem value="unknown" onSelect={() => choose(null)}><Check className={`mr-2 h-4 w-4 ${value ? 'opacity-0' : ''}`} />Não identificada</CommandItem>}
              {filtered.map(item => <CommandItem key={item.id} value={item.id} data-species-id={item.id} onSelect={() => choose(item)}>
                <Check className={`mr-2 h-4 w-4 shrink-0 ${value === item.id ? '' : 'opacity-0'}`} /><span className="min-w-0"><span className="block break-words font-medium">{item.common_name}</span>{item.scientific_name && <span className="block break-words text-xs italic text-muted-foreground">{item.scientific_name}</span>}</span>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
          {allowCreate && <div className="border-t p-2"><Button type="button" variant="ghost" className="h-auto min-h-[40px] w-full justify-start gap-2 whitespace-normal text-left text-primary" onClick={() => create(search.trim().slice(0, 160))}><Plus className="h-4 w-4 shrink-0" />{term ? `Cadastrar “${search.trim()}”` : 'Cadastrar nova espécie'}</Button></div>}
        </Command>
      </PopoverContent>
    </Popover>
    {selected?.scientific_name && <p className="break-words text-xs italic text-muted-foreground" data-testid="selected-species-info">{selected.scientific_name}</p>}
    {selected?.illustration_url && !draft && <figure className="space-y-1.5"><img src={selected.illustration_url} alt={`Imagem ilustrativa da espécie ${selected.common_name}`} className="h-28 w-full rounded-lg object-contain bg-surface-subtle" /><figcaption className="text-[11px] text-muted-foreground">Imagem ilustrativa da espécie {selected.common_name}.</figcaption></figure>}
    {draft && <Dialog open onOpenChange={next => { if (!next && !savingRef.current) close(); }}>
      <DialogContent hideClose data-testid="tree-species-editor" className="z-[10040] flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-xl p-0" overlayClassName="z-[10035] bg-black/50"
        onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.stopPropagation(); if (savingRef.current) event.preventDefault(); }}>
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
          <div className="flex items-center justify-between gap-3"><DialogTitle>{editing ? 'Editar imagem padrão' : 'Nova espécie'}</DialogTitle><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={saving} aria-label="Fechar espécie" onClick={close}><X className="h-4 w-4" /></Button></div>
          <DialogDescription className="sr-only">{editing ? draft.common_name : 'Cadastro de espécie'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 overflow-y-auto px-5 py-4" data-testid="tree-species-body">
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          {!editing && <>
          <label className="grid gap-1.5 text-sm font-medium">Nome popular<Input autoFocus required maxLength={160} placeholder="Ex.: Nim" value={draft.common_name} onChange={event => setDraft(current => ({ ...current, common_name: event.target.value }))} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Nome científico<Input maxLength={200} placeholder="Opcional" value={draft.scientific_name} onChange={event => setDraft(current => ({ ...current, scientific_name: event.target.value }))} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Origem<select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={draft.origin} onChange={event => setDraft(current => ({ ...current, origin: event.target.value }))}>{Object.entries(TREE_ORIGINS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
          </>}
          <label className="grid gap-1.5 text-sm font-medium">Imagem padrão<Input autoFocus={editing} ref={illustrationInput} type="file" accept="image/jpeg,image/png,image/webp" className="text-xs" onChange={event => {
            const file = event.target.files?.[0];
            if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.'); event.target.value = ''; return; }
            setError(''); setIllustration(file || null);
          }} /></label>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WebP · até 5 MB</p>
          {(preview || draft.illustration_url) && <figure className="space-y-2"><img src={preview || draft.illustration_url} alt="Prévia da imagem ilustrativa da espécie" className="h-36 w-full rounded-lg bg-surface-subtle object-contain" /><figcaption className="text-xs text-muted-foreground">Imagem ilustrativa da espécie{draft.common_name.trim() ? ` ${draft.common_name.trim()}` : ''}.</figcaption><Button type="button" size="sm" variant="ghost" onClick={() => { setIllustration(null); setDraft(current => ({ ...current, illustration_url: '' })); if (illustrationInput.current) illustrationInput.current.value = ''; }}>Remover ilustração</Button></figure>}
          {duplicate && <p role="status" className="rounded-lg bg-surface-subtle p-3 text-sm">“{duplicate.common_name}” já cadastrada.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </fieldset>
        </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background px-5 py-4" data-testid="tree-species-footer"><Button type="button" size="sm" variant="ghost" disabled={saving} onClick={close}>Cancelar</Button><Button type="submit" size="sm" disabled={saving || (editing && !illustration && draft.illustration_url === (selected?.illustration_url || ''))}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Salvar imagem padrão' : duplicate ? 'Usar espécie existente' : 'Adicionar ao catálogo'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>}
  </div>;
}
