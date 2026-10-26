import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TREE_ORIGINS } from '@/lib/arborization';
import { treeNameKey, uploadTreePhoto } from '@/lib/treeInventory';
import { supabase } from '@/lib/customSupabaseClient';
import { SIDEWALK_SUITABILITY, speciesAliases } from '@/lib/treeSpecies';

export default function TreeSpeciesField({ species, value, onSelect, onCreated, onUpdated, cityId, label = 'Nome popular', disabled = false, loading = false, allowCreate = true, allowEdit = allowCreate, onCreatingChange }) {
  const id = useId();
  const trigger = useRef(null);
  const savingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);
  const [aiNotice, setAiNotice] = useState('');
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
  const filtered = species.filter(item => treeNameKey([item.common_name, item.scientific_name, ...(item.aliases || [])].join(' ')).includes(term));
  const editing = Boolean(draft?.id);
  const duplicate = draft && species.find(item => item.id !== draft.id && (treeNameKey(item.common_name) === treeNameKey(draft.common_name)
    || (draft.scientific_name.trim() && treeNameKey(item.scientific_name) === treeNameKey(draft.scientific_name))));
  const close = () => { if (generatingRef.current) return; setDraft(null); setError(''); setAiNotice(''); setIllustration(null); onCreatingChange?.(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const create = name => {
    setOpen(false); setError(''); setIllustration(null);
    setAiNotice(''); setDraft({ common_name: name, scientific_name: '', origin: 'nao_identificada', aliases: '', summary: '', sidewalk_suitability: 'nao_avaliada', planting_guidance: '' });
    onCreatingChange?.(true);
  };
  const edit = () => {
    if (!selected || !allowEdit || disabled || loading) return;
    setOpen(false); setError(''); setIllustration(null);
    setAiNotice(''); setDraft({ ...selected, scientific_name: selected.scientific_name || '', aliases: (selected.aliases || []).join('; '), summary: selected.summary || '', sidewalk_suitability: selected.sidewalk_suitability || 'nao_avaliada', planting_guidance: selected.planting_guidance || '', illustration_url: selected.illustration_url || '' });
    onCreatingChange?.(true);
  };
  const choose = item => { onSelect(item); setOpen(false); setSearch(''); };
  const generateSummary = async () => {
    if (generatingRef.current || !draft.common_name.trim()) return;
    generatingRef.current = true; setGenerating(true); setError(''); setAiNotice('');
    try {
      const { data, error: generationError } = await supabase.functions.invoke('generate-tree-species-summary', { body: { city_id: cityId, common_name: draft.common_name.trim(), scientific_name: draft.scientific_name.trim() } });
      if (generationError || data?.error) {
        let message = data?.error;
        try { message ||= (await generationError?.context?.json())?.error; } catch { /* Resposta sem JSON. */ }
        throw new Error(message || 'Não foi possível gerar o resumo. Verifique se a geração por IA está configurada e tente novamente.');
      }
      if (!data?.summary || !SIDEWALK_SUITABILITY[data.sidewalk_suitability]) throw new Error('A IA retornou uma resposta incompleta. Tente novamente.');
      setDraft(current => ({ ...current, summary: data.summary, sidewalk_suitability: data.sidewalk_suitability, planting_guidance: data.planting_guidance || '' }));
      setAiNotice('Sugestão gerada por IA. Revise as informações antes de salvar.');
    } catch (err) { setError(err.message); }
    finally { generatingRef.current = false; setGenerating(false); }
  };
  const submit = async event => {
    event?.preventDefault(); event?.stopPropagation();
    if (savingRef.current || generatingRef.current || !draft || (editing ? !allowEdit : !allowCreate)) return;
    if (duplicate) { if (editing) { setError('Já existe outra espécie com esse nome popular ou científico.'); return; } onSelect(duplicate); close(); return; }
    if (!draft.common_name.trim()) { setError('Informe o nome popular da espécie.'); return; }
    if (speciesAliases(draft.aliases, draft.common_name).length > 30) { setError('Informe no máximo 30 outros nomes para a espécie.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    let uploaded;
    let persisted = false;
    try {
      uploaded = await uploadTreePhoto(supabase, illustration, cityId);
      const values = {
        common_name: draft.common_name.trim(), scientific_name: draft.scientific_name.trim() || null, origin: draft.origin,
        aliases: speciesAliases(draft.aliases, draft.common_name), summary: draft.summary.trim() || null,
        sidewalk_suitability: draft.sidewalk_suitability, planting_guidance: draft.planting_guidance.trim() || null,
        illustration_url: uploaded?.url || draft.illustration_url || null,
      };
      const query = editing ? supabase.from('city_tree_species').update(values).eq('id', draft.id).eq('city_id', cityId) : supabase.from('city_tree_species').insert({ city_id: cityId, ...values });
      const { data, error: saveError } = await query.select().single();
      if (saveError && ['PGRST204', '42703'].includes(saveError.code)) throw new Error('Os novos campos de espécies ainda não estão disponíveis nesta instalação. Seus dados foram mantidos para tentar novamente após a atualização do banco.');
      if (saveError) throw new Error(saveError.code === '23505' ? 'Esta espécie já está no catálogo. Busque pelo nome popular ou científico.' : 'Não foi possível salvar a espécie. Verifique sua permissão e tente novamente. Seus dados foram mantidos.');
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
          <CommandInput aria-label="Buscar espécie" placeholder="Nome popular, regional ou científico…" value={search} onValueChange={setSearch} />
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
    {!!selected?.aliases?.length && <p className="break-words text-xs text-muted-foreground">Também conhecida como: {selected.aliases.join(', ')}</p>}
    {selected?.illustration_url && !draft && <figure className="space-y-1.5"><img src={selected.illustration_url} alt={`Imagem ilustrativa da espécie ${selected.common_name}`} className="h-28 w-full rounded-lg object-contain bg-surface-subtle" /><figcaption className="text-[11px] text-muted-foreground">Imagem ilustrativa da espécie {selected.common_name}.</figcaption></figure>}
    {draft && <Dialog open onOpenChange={next => { if (!next && !savingRef.current) close(); }}>
      <DialogContent hideClose data-testid="tree-species-editor" className="z-[10040] flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-xl p-0" overlayClassName="z-[10035] bg-black/50"
        onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.stopPropagation(); if (savingRef.current) event.preventDefault(); }}>
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
          <div className="flex items-center justify-between gap-3"><DialogTitle>{editing ? 'Editar espécie' : 'Nova espécie'}</DialogTitle><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={saving || generating} aria-label="Fechar espécie" onClick={close}><X className="h-4 w-4" /></Button></div>
          <DialogDescription className="sr-only">{editing ? draft.common_name : 'Cadastro de espécie'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 overflow-y-auto px-5 py-4" data-testid="tree-species-body">
        <fieldset disabled={saving || generating} className="min-w-0 space-y-4">
          <label className="grid gap-1.5 text-sm font-medium">Nome popular principal<Input autoFocus required maxLength={160} placeholder="Ex.: Nim" value={draft.common_name} onChange={event => setDraft(current => ({ ...current, common_name: event.target.value }))} /></label>
          {editing && <p className="text-xs text-muted-foreground">A alteração será aplicada a todas as árvores vinculadas a esta espécie.</p>}
          <label className="grid gap-1.5 text-sm font-medium">Outros nomes populares ou regionais<textarea className="min-h-[72px] w-full rounded-md border bg-background p-3 font-normal" maxLength={4000} placeholder="Separe os nomes por ponto e vírgula ou por linha" value={draft.aliases} onChange={event => setDraft(current => ({ ...current, aliases: event.target.value }))} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Nome científico<Input maxLength={200} placeholder="Opcional" value={draft.scientific_name} onChange={event => setDraft(current => ({ ...current, scientific_name: event.target.value }))} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Origem<select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={draft.origin} onChange={event => setDraft(current => ({ ...current, origin: event.target.value }))}>{Object.entries(TREE_ORIGINS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
          <div className="space-y-2 border-t pt-4"><Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" disabled={!draft.common_name.trim()} onClick={generateSummary}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{generating ? 'Gerando sugestão…' : 'Gerar resumo e orientação com IA'}</Button><p className="text-xs text-muted-foreground">Preenche ou substitui o resumo e a orientação abaixo. Revise antes de salvar.</p></div>
          <label className="grid gap-1.5 text-sm font-medium">Resumo da espécie<textarea className="min-h-[140px] w-full rounded-md border bg-background p-3 font-normal" maxLength={5000} placeholder="Características, propriedades medicinais e cuidados…" value={draft.summary} onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Plantio em calçada<select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={draft.sidewalk_suitability} onChange={event => setDraft(current => ({ ...current, sidewalk_suitability: event.target.value }))}>{Object.entries(SIDEWALK_SUITABILITY).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-medium">Orientações de plantio<textarea className="min-h-[90px] w-full rounded-md border bg-background p-3 font-normal" maxLength={3000} placeholder="Raízes, porte, espaço disponível e restrições…" value={draft.planting_guidance} onChange={event => setDraft(current => ({ ...current, planting_guidance: event.target.value }))} /></label>
          {aiNotice && <p role="status" className="text-xs text-muted-foreground">{aiNotice}</p>}
          <label className="grid gap-1.5 text-sm font-medium">Imagem padrão<Input ref={illustrationInput} type="file" accept="image/jpeg,image/png,image/webp" className="text-xs" onChange={event => {
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
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background px-5 py-4" data-testid="tree-species-footer"><Button type="button" size="sm" variant="ghost" disabled={saving || generating} onClick={close}>Cancelar</Button><Button type="submit" size="sm" disabled={saving || generating}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Salvar espécie' : duplicate ? 'Usar espécie existente' : 'Adicionar ao catálogo'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>}
  </div>;
}
