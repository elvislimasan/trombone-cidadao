import React, { useState, useEffect, lazy, Suspense } from 'react';
import { MapPin, PlusCircle, BookOpen, Image as ImageIcon, FileText, ChevronLeft, ChevronRight, UploadCloud, Loader2, Save, Trash2, Star, Route as Road, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, FormDialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { supabase } from '@/lib/customSupabaseClient';
import { useCityIdFromLocation } from '@/hooks/useCityIdFromLocation';
import { showAppError, showAppNotice } from '@/lib/appError';
import DesenharTracado from '@/components/pavement/DesenharTracado';
import { cepsDaRua } from '@/lib/pavementReport';
import {
  buildOverpassQueryAround,
  buscarVias,
  casarTracado,
  coordenadaDaRua,
  toMultiLineStringWkt,
} from '@/lib/streetGeometry';
import {
  MOTIVOS,
  buscarCepsPorLogradouro,
  nomeParaBusca,
  cepGenerico,
  normalizarCep,
  ordenarCandidatos,
} from '@/lib/cepLookup';
import { formatarTamanhoArquivo } from '@/lib/pavementStreetHistory';
import {
  PAVEMENT_DOCUMENT_ACCEPT,
  PAVEMENT_PHOTO_ACCEPT,
  validatePavementMediaFile,
} from '@/lib/pavementStreetMedia';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

const fileTypeLabel = (fileName) => {
  const extension = String(fileName || '').match(/\.([^.]+)$/)?.[1];
  return extension ? extension.toUpperCase() : '';
};

const fileTitle = (fileName) => String(fileName || '').replace(/\.[^.]+$/, '');

const PavementEditModal = ({ street, onSave, onClose, bairros, existingStreets = [], defaultCityId, fallbackCityCenter, onBairroCreated }) => {
  const { resolveCityIdFromLocation } = useCityIdFromLocation();
  const [formData, setFormData] = useState(null);
  const [bairroSearch, setBairroSearch] = useState('');
  const [creatingBairro, setCreatingBairro] = useState(false);
  const [fetchingMapBairro, setFetchingMapBairro] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepSugestoes, setCepSugestoes] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [buscandoTracado, setBuscandoTracado] = useState(false);
  const [desenhando, setDesenhando] = useState(false);

  useEffect(() => {
    if (street) {
      const initialStatus = street.status || 'unpaved';
      const initialPavementType = street.pavement_type || 'asphalt';

      setFormData({
        ...street,
        location: coordenadaDaRua(street.location),
        paving_date: street.paving_date ? new Date(street.paving_date).getUTCFullYear().toString() : '',
        status: initialStatus,
        pavement_type: initialPavementType,
        is_unnamed: Boolean(street.is_unnamed),
        historical_documents: Array.isArray(street.historical_documents) ? street.historical_documents : [],
        historical_photos: Array.isArray(street.historical_photos) ? street.historical_photos : [],
        // `cepsDaRua` le a lista nova e cai na coluna antiga quando ela ainda
        // esta vazia — e por isso a tela nunca fica sem CEP no meio da migracao.
        ceps: cepsDaRua(street).map((c) => ({ cep: c.cep, bairro_id: c.bairroId })),
      });
      setBairroSearch('');
      setActiveStep(1);
      setSaving(false);
    } else {
      setFormData(null);
    }
  }, [street]);

  // Resolve o city_id alvo para criar bairro.
  //
  // O PINO GANHA DA CIDADE PADRÃO, E A ORDEM ERA O CONTRÁRIO
  //
  // Ela preferia `defaultCityId` — a cidade do embaixador — e só olhava o
  // marcador quando não havia padrão. O efeito: um embaixador de Serra Talhada
  // cadastrando uma rua em Floresta criava o bairro em SERRA TALHADA. A rua
  // herdava o city_id do bairro, e o mapa de Floresta, que filtra por cidade,
  // simplesmente não a mostrava. Nada falhava: nem erro, nem aviso, e a rua
  // existia no banco com as coordenadas certas e a cidade errada.
  //
  // A inversão é a regra certa porque as duas fontes não têm o mesmo peso: o
  // pino é uma afirmação deliberada sobre ONDE aquilo fica, e a cidade padrão é
  // uma conveniência de quem cadastra. Quando discordam, quem está no mapa
  // manda — é o mapa que vai ter de mostrar o resultado.
  const resolveTargetCityId = async () => {
    if (formData?.location) {
      const doMapa = await resolveCityIdFromLocation(formData.location);
      if (doMapa) return doMapa;
    }
    return defaultCityId || null;
  };

  const handleCreateBairro = async (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    const cityId = await resolveTargetCityId();
    if (!cityId) {
      showAppError({ title: 'Defina a localização no mapa primeiro', description: 'Precisamos da cidade para criar o bairro.', variant: 'destructive' });
      return;
    }
    const existing = (bairros || []).find(
      (b) => (b.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      handleSelectChange('bairro_id', existing.id);
      setBairroSearch('');
      return;
    }
    setCreatingBairro(true);
    const { data, error } = await supabase
      .from('bairros')
      .insert({ name, city_id: cityId })
      .select('id, name, city_id')
      .single();
    setCreatingBairro(false);
    if (error) {
      showAppError({ title: 'Erro ao criar bairro', description: error.message, variant: 'destructive' });
      return;
    }
    onBairroCreated?.(data);
    handleSelectChange('bairro_id', data.id);
    setBairroSearch('');
  };

  /* --- CEPs, um por trecho --- */
  //
  // UMA RUA COMPRIDA ATRAVESSA BAIRRO, E CADA TRECHO TEM O SEU
  //
  // O campo era um texto so, entao a segunda faixa nao tinha onde ser guardada:
  // quem cadastrava escolhia um CEP e perdia o resto. Agora sao linhas, e cada
  // uma diz a QUAL BAIRRO pertence — que e o que responde "qual CEP nesta parte
  // da rua".
  //
  // Bairro vazio significa "vale para a rua inteira", que e o caso da maioria.

  const cepsDoForm = Array.isArray(formData?.ceps) ? formData.ceps : [];

  // O ViaCEP devolve o bairro por NOME; o cadastro guarda por id. Casar os dois
  // e o que faz a sugestao chegar ja com o trecho preenchido — e quando o nome
  // nao existe na base local, `null` significa "rua inteira", que e melhor do
  // que inventar um bairro.
  const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const bairroIdPeloNome = (nome) => {
    const alvo = semAcento(nome);
    if (!alvo) return null;
    return bairros.find((b) => semAcento(b.name) === alvo)?.id
      || bairros.find((b) => semAcento(b.name).startsWith(alvo.split(' - ')[0]))?.id
      || null;
  };

  const alterarCep = (indice, campo, valor) => {
    setFormData((prev) => ({
      ...prev,
      ceps: (prev.ceps || []).map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)),
    }));
  };

  const removerCep = (indice) => {
    setFormData((prev) => ({ ...prev, ceps: (prev.ceps || []).filter((_, i) => i !== indice) }));
  };

  // O bairro ja escolhido no formulario e o palpite certo para o primeiro CEP:
  // e o trecho que quem cadastra tem na cabeca neste momento.
  const adicionarCep = (cep = '', bairroId = undefined) => {
    setFormData((prev) => {
      const atuais = prev.ceps || [];
      const normalizado = normalizarCep(cep);
      // Repetido nao e trecho novo: e a mesma faixa cadastrada duas vezes.
      if (normalizado && atuais.some((c) => normalizarCep(c.cep) === normalizado)) return prev;
      return {
        ...prev,
        ceps: [...atuais, {
          cep: normalizado || cep,
          bairro_id: bairroId !== undefined ? bairroId : (prev.bairro_id || null),
        }],
      };
    });
  };

  // SUGERIR O CEP A PARTIR DO PINO
  //
  // O `postcode` que a geocodificação reversa devolve quase sempre é o CEP
  // GENÉRICO do município — o terminado em `-000`, que vale para a cidade
  // inteira e não identifica rua nenhuma. Preencher com ele deixaria a base
  // cheia de campos preenchidos e nenhum CEP útil.
  //
  // O que o pino entrega de valioso é o ENDEREÇO: UF, município e nome da via.
  // Com os três, a base dos Correios devolve os CEPs de verdade, cada um com o
  // seu bairro — e é assim que a rua que atravessa três bairros aparece com os
  // três CEPs dela, em vez de um só escolhido no chute.
  const handleSuggestCep = async () => {
    if (!formData?.location) {
      showAppError({ title: 'Marque a localização no mapa primeiro', variant: 'destructive' });
      return;
    }

    setBuscandoCep(true);
    setCepSugestoes(null);
    try {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: formData.location.lat, lng: formData.location.lng, zoom: 18 },
      });
      if (error) {
        showAppError({ title: 'Não foi possível ler o mapa', description: 'Tente novamente ou digite o CEP.', variant: 'destructive' });
        return;
      }

      const endereco = data?.raw?.address || {};
      // O nome digitado tem prioridade sobre o do mapa: quem cadastra sabe o
      // nome oficial, e o OSM às vezes traz a grafia antiga ou com erro.
      // `nomeParaBusca` tira o parentese que o cadastro usa para distinguir
      // homonimas ("Rua Projetada 04 (Caetano 1)"): ele nao existe no nome
      // oficial e faria o ViaCEP devolver nada — ou recusar a consulta.
      const via = nomeParaBusca(formData.name) || nomeParaBusca(endereco.road);

      const resultado = await buscarCepsPorLogradouro({
        uf: data?.state_uf,
        cidade: data?.city,
        logradouro: via,
      });

      const candidatos = ordenarCandidatos(resultado.candidatos, {
        logradouro: via,
        bairro: selectedBairroName,
      });

      // Nada preciso, mas o pino trouxe um CEP: oferece como último recurso,
      // marcado como genérico para ninguém achar que é o da rua.
      const doPino = normalizarCep(endereco.postcode);
      const lista = candidatos.length
        ? candidatos
        : doPino
          ? [{ cep: doPino, logradouro: via, bairro: '', cidade: data?.city || '', uf: data?.state_uf || '', generico: cepGenerico(doPino) }]
          : [];

      setCepSugestoes({ lista, motivo: lista.length ? 'ok' : resultado.motivo });
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleUseBairroFromMap = async () => {
    if (!formData?.location) {
      showAppError({ title: 'Marque a localização no mapa primeiro', variant: 'destructive' });
      return;
    }
    setFetchingMapBairro(true);
    try {
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: formData.location.lat, lng: formData.location.lng, zoom: 18 },
      });
      const suburb = !error ? (data?.suburb || null) : null;
      if (!suburb) {
        showAppError({ title: 'Bairro não encontrado no mapa', description: 'Digite o nome do bairro manualmente.', variant: 'destructive' });
        return;
      }
      await handleCreateBairro(suburb);
    } finally {
      setFetchingMapBairro(false);
    }
  };

  /**
   * Busca o traçado da via no OpenStreetMap.
   *
   * Rua sem nome oficial não é consultada: "Rua Projetada" não existe no OSM
   * com esse nome, e o segundo degrau do casador a colaria em qualquer outra
   * "Rua Projetada" da região.
   */
  const buscarTracado = async () => {
    if (!formData?.location) {
      showAppError({ title: 'Marque o ponto primeiro', description: 'A busca parte da coordenada da rua.', variant: 'destructive' });
      return;
    }
    if (formData.is_unnamed) {
      showAppError({ title: 'Rua sem nome oficial', description: 'Sem nome não há como identificar a via no OpenStreetMap. Ela fica marcada pelo ponto.', variant: 'destructive' });
      return;
    }

    setBuscandoTracado(true);
    try {
      let ways = await buscarVias(buildOverpassQueryAround({
        lat: formData.location.lat,
        lng: formData.location.lng,
        raio: 1500,
      }));
      let linhas = casarTracado({ name: formData.name, location: formData.location }, ways);

      // Segunda tentativa mais larga: rua comprida pode ter o ponto cadastrado
      // numa ponta e o resto da via fora do primeiro raio.
      if (linhas.length === 0) {
        ways = await buscarVias(buildOverpassQueryAround({
          lat: formData.location.lat,
          lng: formData.location.lng,
          raio: 4000,
        }));
        linhas = casarTracado({ name: formData.name, location: formData.location }, ways);
      }

      const wkt = toMultiLineStringWkt(linhas);
      if (!wkt) {
        showAppError({
          title: 'Nenhuma via com esse nome por aqui',
          description: 'A rua continua marcada pelo ponto. Confira a grafia do nome ou a posição do pino.',
          variant: 'destructive',
        });
        return;
      }

      setFormData((current) => ({ ...current, path_wkt: wkt, path_source: 'osm' }));
      showAppNotice({
        title: 'Traçado encontrado',
        description: `${linhas.length} trecho${linhas.length === 1 ? '' : 's'}. Salve para gravar.`,
      });
    } catch (erro) {
      showAppError({ title: 'Erro ao buscar o traçado', description: erro.message, variant: 'destructive' });
    } finally {
      setBuscandoTracado(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationChange = (newLocation) => {
    setFormData(prev => ({ ...prev, location: newLocation }));
  };

  const updateArrayItem = (field, index, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addArrayItem = (field, item) => {
    setFormData((prev) => ({ ...prev, [field]: [...(prev[field] || []), item] }));
  };

  const removeArrayItem = (field, index) => {
    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  /** Marca uma foto como destaque e desmarca todas as outras. */
  const destacarFoto = (index) => {
    setFormData((current) => ({
      ...current,
      historical_photos: (current.historical_photos || []).map((foto, i) => ({
        ...foto,
        // Clicar de novo na que já está destacada tira o destaque — sem isso
        // não haveria como voltar a "sem capa escolhida" depois de escolher.
        featured: i === index ? !foto.featured : false,
      })),
    }));
  };

  const handleFileChange = (field, index, kind, file) => {
    if (!file) return;
    const validationError = validatePavementMediaFile(file, kind);
    if (validationError) {
      showAppError({ title: 'Arquivo não aceito', description: validationError, variant: 'destructive' });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [field]: (prev[field] || []).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const nextItem = {
          ...item,
          file,
          original_name: file.name,
          size: file.size,
        };
        if (kind === 'document') {
          nextItem.type = fileTypeLabel(file.name);
          if (!String(nextItem.title || '').trim()) nextItem.title = fileTitle(file.name);
        }
        return nextItem;
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (activeStep === 1) {
      setActiveStep(2);
      return;
    }
    const attachmentWithoutFile = [
      ...(formData.historical_documents || []),
      ...(formData.historical_photos || []),
    ].find((item) => !item?.file && !String(item?.url || '').trim());
    if (attachmentWithoutFile) {
      showAppError({
        title: 'Selecione os arquivos',
        description: 'Todo item adicionado precisa ter um arquivo escolhido antes de salvar.',
        variant: 'destructive',
      });
      return;
    }
    const pavementFieldsEnabled = formData.status === 'paved' || formData.status === 'partially_paved';
    
    const dataToSave = {
      ...formData,
      paving_date: pavementFieldsEnabled && formData.paving_date ? `${formData.paving_date}-01-01` : null,
      pavement_type: pavementFieldsEnabled ? formData.pavement_type : null,
    };

    // SEM BAIRRO, A CIDADE VEM DO PINO — E A RESOLUÇÃO ACONTECE AQUI.
    //
    // `resolveCityIdFromLocation` é um hook, e o save é função pura de
    // gravação: ele não pode chamá-lo. Então quem já tem o hook em mãos
    // resolve e entrega o resultado pronto.
    //
    // Só quando não há bairro. Com bairro, é ele que manda — ver o comentário
    // da regra em `savePavementStreet`.
    if (!dataToSave.bairro_id && dataToSave.location) {
      dataToSave.cityIdDoPino = await resolveCityIdFromLocation(dataToSave.location);
    }

    setSaving(true);
    const saved = await onSave(dataToSave);
    if (!saved) setSaving(false);
  };

  if (!formData) return null;
  
  const pavementFieldsEnabled = formData.status === 'paved' || formData.status === 'partially_paved';

  const otherStreets = existingStreets
    .filter(s => s.id !== formData.id && s.location)
    .map(s => ({
      ...s,
      location: coordenadaDaRua(s.location),
    }));

  const filteredBairros = (bairros || []).filter((b) => bairroSearch.trim() && (b.name || '').toLowerCase().includes(bairroSearch.toLowerCase()));
  const selectedBairroName = bairros.find((b) => b.id === formData.bairro_id)?.name || '';

  return (
    <Dialog open={!!street} onOpenChange={(open) => !open && !saving && onClose()}>
      <FormDialogContent className="h-[94dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-border p-0 sm:h-[90vh] sm:max-w-[760px]">
        <DialogHeader className="border-b border-edge-subtle px-5 py-4 pr-12 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold text-content-primary sm:text-2xl">{formData.id ? 'Editar Rua' : 'Adicionar Nova Rua'}</DialogTitle>
              <p className="mt-1 text-xs font-medium text-content-tertiary">
                Etapa {activeStep} de 2 · {activeStep === 1 ? 'Dados e localização' : 'História da rua'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden="true">
            <span className="h-1 rounded-full bg-brand" />
            <span className={`h-1 rounded-full transition-colors ${activeStep === 2 ? 'bg-brand' : 'bg-edge-subtle'}`} />
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {activeStep === 1 && <>
          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
            <Label htmlFor="name" className="sm:text-right">Identificação da via</Label>
            <div className="space-y-2">
              <Input
                id="name"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                placeholder={formData.is_unnamed ? 'Ex.: Rua Projetada 01 (Bairro)' : 'Nome oficial da rua'}
                required
              />
              <p className="text-xs text-muted-foreground">
                {formData.is_unnamed
                  ? 'Use uma identificação provisória para distinguir esta via no mapa.'
                  : 'Informe o nome oficial da via.'}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
            <span className="hidden sm:block" />
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <Checkbox
                id="is_unnamed"
                checked={Boolean(formData.is_unnamed)}
                onCheckedChange={(checked) => handleSelectChange('is_unnamed', checked === true)}
                className="mt-0.5 border-amber-700 data-[state=checked]:bg-amber-700"
              />
              <div className="space-y-0.5">
                <Label htmlFor="is_unnamed" className="cursor-pointer font-semibold">Rua sem nome oficial</Label>
                <p className="text-xs text-amber-800">Marque quando a via ainda é conhecida apenas por um nome provisório, como “Rua Projetada”.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
            <Label htmlFor="cep" className="sm:text-right">CEP</Label>
            <div className="min-w-0 space-y-2">
              {cepsDoForm.length === 0 && (
                <p className="text-[11px] leading-snug text-content-secondary">
                  Nenhum CEP cadastrado. Use o mapa para buscar, ou adicione manualmente.
                </p>
              )}

              {cepsDoForm.map((item, indice) => (
                <div key={indice} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={item.cep || ''}
                    onChange={(e) => alterarCep(indice, 'cep', e.target.value)}
                    onBlur={(e) => alterarCep(indice, 'cep', normalizarCep(e.target.value) || e.target.value)}
                    placeholder="Ex: 56400-000"
                    className="w-[10.5rem] tabular-nums"
                    aria-label={`CEP ${indice + 1}`}
                  />
                  {/* O TRECHO É O BAIRRO
                      Sem ele, dois CEPs na mesma rua são dois números sem
                      diferença — e quem consultar depois não saberá qual vale
                      para o ponto que procura. */}
                  <select
                    value={item.bairro_id || ''}
                    onChange={(e) => alterarCep(indice, 'bairro_id', e.target.value || null)}
                    aria-label={`Trecho do CEP ${indice + 1}`}
                    className="h-10 min-w-0 flex-1 rounded-md border border-edge-default bg-surface-raised px-2 text-sm text-content-primary"
                  >
                    <option value="">Rua inteira</option>
                    {bairros.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removerCep(indice)}
                    aria-label={`Remover CEP ${item.cep || indice + 1}`}
                    className="shrink-0 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adicionarCep()}
                  className="gap-1.5 text-xs"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Adicionar CEP
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestCep}
                  disabled={buscandoCep || !formData.location}
                  title={formData.location ? 'Buscar pelo ponto marcado no mapa' : 'Marque o ponto no mapa primeiro'}
                  className="gap-1.5 whitespace-nowrap text-xs"
                >
                  {buscandoCep
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <MapPin className="h-3.5 w-3.5" />}
                  Buscar pelo mapa
                </Button>
              </div>

              {/* UMA LISTA, E NÃO UM PREENCHIMENTO AUTOMÁTICO
                  A rua que atravessa bairros tem mais de um CEP legítimo, e o
                  app não tem como saber qual trecho é este pino. Escolher por
                  quem cadastra deixaria a base com um CEP plausível e errado —
                  que é pior que campo vazio, porque vazio se vê. */}
              {cepSugestoes && (
                cepSugestoes.lista.length ? (
                  <div className="space-y-1.5 rounded-lg border border-edge-subtle bg-surface-subtle p-2">
                    <p className="text-[11px] font-semibold text-content-secondary">
                      {cepSugestoes.lista.length === 1
                        ? 'Encontrado 1 CEP para esta rua:'
                        : `Encontrados ${cepSugestoes.lista.length} CEPs — adicione os que valem para esta rua:`}
                    </p>
                    {cepSugestoes.lista.map((c) => (
                      <button
                        key={c.cep}
                        type="button"
                        onClick={() => adicionarCep(c.cep, bairroIdPeloNome(c.bairro))}
                        className="flex w-full items-center justify-between gap-2 rounded-md bg-surface-raised px-2.5 py-1.5 text-left ring-1 ring-edge-subtle transition-colors hover:bg-surface-subtleHover"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-bold tabular-nums text-content-primary">{c.cep}</span>
                          <span className="block truncate text-[11px] text-content-secondary">
                            {c.bairro || (c.generico ? 'CEP geral do município' : c.logradouro || '—')}
                          </span>
                        </span>
                        {c.generico && (
                          <Badge variant="outline" className="shrink-0 border-status-pendingBorder bg-status-pendingBg text-[9px] text-status-pendingFg">
                            genérico
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] leading-snug text-content-secondary">
                    {MOTIVOS[cepSugestoes.motivo] || MOTIVOS['sem-resultado']}
                  </p>
                )
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start sm:gap-4">
            <Label className="sm:pt-2 sm:text-right">Bairro <span className="font-normal text-content-tertiary">(opcional)</span></Label>
            <div className="min-w-0 space-y-2">
              {selectedBairroName && (
                <p className="text-sm text-muted-foreground">Selecionado: <span className="font-medium text-foreground">{selectedBairroName}</span></p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  className="col-span-2 sm:col-span-1"
                  placeholder="Buscar ou criar bairro..."
                  value={bairroSearch}
                  onChange={(e) => setBairroSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBairro(bairroSearch); } }}
                />
                <Button type="button" variant="outline" disabled={creatingBairro} onClick={() => handleCreateBairro(bairroSearch)}>
                  Criar
                </Button>
                <Button type="button" variant="outline" className="whitespace-normal leading-tight" disabled={fetchingMapBairro} onClick={handleUseBairroFromMap}>
                  Usar bairro do mapa
                </Button>
              </div>
              {filteredBairros.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded-md">
                  {filteredBairros.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => { handleSelectChange('bairro_id', b.id); setBairroSearch(''); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${formData.bairro_id === b.id ? 'bg-muted font-semibold' : ''}`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
            <Label htmlFor="status" className="sm:text-right">Status</Label>
            <div className="min-w-0">
              <Combobox
                options={[
                  { value: 'paved', label: 'Pavimentada' },
                  { value: 'unpaved', label: 'Sem Pavimentação' },
                  { value: 'partially_paved', label: 'Parcialmente Pavimentada' }
                ]}
                value={formData.status}
                onChange={(value) => handleSelectChange('status', value)}
                placeholder="Selecione o status"
                searchPlaceholder="Buscar status..."
                notFoundText="Status não encontrado"
              />
            </div>
          </div>

          <div className={`space-y-5 transition-opacity duration-300 ${pavementFieldsEnabled ? 'opacity-100' : 'opacity-50'}`}>
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <Label htmlFor="pavement_type" className="sm:text-right">Tipo</Label>
              <div className="min-w-0">
                <Combobox
                  options={[
                    { value: 'asphalt', label: 'Asfáltica' },
                    { value: 'granite', label: 'Granítica (Paralelepípedo)' },
                    { value: 'interlocking', label: 'Intertravado' }
                  ]}
                  value={formData.pavement_type}
                  onChange={(value) => handleSelectChange('pavement_type', value)}
                  placeholder="Selecione o tipo"
                  searchPlaceholder="Buscar tipo..."
                  notFoundText="Tipo não encontrado"
                  disabled={!pavementFieldsEnabled}
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
              <Label htmlFor="paving_date" className="sm:text-right">Ano da Conclusão</Label>
              <Input 
                id="paving_date" 
                name="paving_date" 
                type="number"
                placeholder="Ex: 2024"
                value={formData.paving_date || ''} 
                onChange={handleChange} 
                disabled={!pavementFieldsEnabled}
              />
            </div>
          </div>

          </>}

          {activeStep === 2 && (
          <section className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-sunken">
            <div className="flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
                <BookOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">História da rua</p>
                <p className="text-xs text-content-tertiary">Etapa opcional. O botão público só aparece quando existir conteúdo.</p>
              </div>
            </div>

            <div className="space-y-5 border-t border-edge-subtle bg-surface-raised p-4 sm:p-5">

            <div className="space-y-2">
              <Label htmlFor="honoree_name">Nome do homenageado</Label>
              <Input id="honoree_name" name="honoree_name" value={formData.honoree_name || ''} onChange={handleChange} placeholder="Nome completo" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="biography">Biografia</Label>
              <textarea id="biography" name="biography" value={formData.biography || ''} onChange={handleChange} rows={5} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Conte a trajetória e a contribuição do homenageado." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="curiosities">Curiosidades</Label>
              <textarea id="curiosities" name="curiosities" value={formData.curiosities || ''} onChange={handleChange} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Uma curiosidade por linha ou em pequenos parágrafos." />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" /> Documentos</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => addArrayItem('historical_documents', { title: '', description: '', type: '', size: '', kind: 'outro' })}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Adicionar documento
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, ODT, XLS, XLSX ou TXT, com até 20 MB. O arquivo será enviado ao Supabase.</p>
              {(formData.historical_documents || []).map((document, index) => (
                <div key={index} className="flex items-start gap-2 rounded-lg border border-border bg-background p-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    {document.url && !document.file && (
                      <a href={document.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs font-medium text-brand underline-offset-2 hover:underline">
                        Arquivo atual: {document.original_name || document.title || 'abrir documento'}
                      </a>
                    )}
                    <Input
                      type="file"
                      accept={PAVEMENT_DOCUMENT_ACCEPT}
                      onChange={(e) => handleFileChange('historical_documents', index, 'document', e.target.files?.[0])}
                      aria-label={document.url ? 'Substituir documento' : 'Selecionar documento'}
                    />
                    {document.file && (
                      <p className="truncate text-xs text-muted-foreground">
                        Selecionado: {document.file.name} · {formatarTamanhoArquivo(document.file.size)}
                      </p>
                    )}
                    <Input value={document.title || ''} onChange={(e) => updateArrayItem('historical_documents', index, 'title', e.target.value)} placeholder="Título — ex.: Lei de Criação da Rua" />
                    <Input value={document.description || ''} onChange={(e) => updateArrayItem('historical_documents', index, 'description', e.target.value)} placeholder="Subtítulo — ex.: Lei Municipal nº 1.234/2010" />
                    {/* O QUE O DOCUMENTO É, e não o formato do arquivo.
                        É este campo que alimenta os filtros "ruas com/sem a lei
                        municipal" e "sem projeto de lei" no mapa, e o relatório
                        de documentação incompleta. Documento antigo fica em
                        "Outro" até alguém abrir e marcar — o filtro serve para
                        conferir o cadastro contra a prefeitura, e chutar que
                        todo anexo é a lei responderia essa pergunta com um
                        palpite.

                        São dois documentos distintos de propósito: a lei
                        denomina a rua, o projeto de lei é o que a originou na
                        Câmara. Guardá-los na mesma categoria tornaria impossível
                        listar o que ainda falta cobrar. */}
                    <select
                      value={['lei', 'projeto_lei'].includes(document.kind) ? document.kind : 'outro'}
                      onChange={(e) => updateArrayItem('historical_documents', index, 'kind', e.target.value)}
                      aria-label="Tipo do documento"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="outro">Outro documento</option>
                      <option value="lei">Lei municipal</option>
                      <option value="projeto_lei">Projeto de lei</option>
                    </select>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-500" onClick={() => removeArrayItem('historical_documents', index)} aria-label="Remover documento"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="inline-flex items-center gap-1.5"><ImageIcon className="h-4 w-4" /> Fotos históricas e atuais</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => addArrayItem('historical_photos', { caption: '', date: '', subject: 'street' })}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Adicionar foto
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF ou AVIF, com até 10 MB. A imagem será enviada ao Supabase. A foto em destaque vira a capa da página da rua e a primeira do mapa.</p>
              {/* O DESTAQUE É EXCLUSIVO, E POR ISSO MARCAR UM DESMARCA OS OUTROS
                  Duas fotos destacadas não é um estado que a tela pública saiba
                  desenhar — ela pega a primeira e ignora a segunda em silêncio.
                  Resolver na escrita é o que impede o cadastro de guardar uma
                  intenção que nunca vai aparecer. */}
              {(formData.historical_photos || []).map((photo, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-border bg-background p-3">
                  {photo.url && !photo.file && (
                    <div className="flex items-center gap-3">
                      <img src={photo.url} alt="" className="h-14 w-20 rounded-md border border-border object-cover" />
                      <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">Imagem atual salva no Supabase</p>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept={PAVEMENT_PHOTO_ACCEPT}
                    onChange={(e) => handleFileChange('historical_photos', index, 'photo', e.target.files?.[0])}
                    aria-label={photo.url ? 'Substituir foto' : 'Selecionar foto'}
                  />
                  {photo.file && (
                    <p className="truncate text-xs text-muted-foreground">
                      Selecionada: {photo.file.name} · {formatarTamanhoArquivo(photo.file.size)}
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                    <Input value={photo.caption || ''} onChange={(e) => updateArrayItem('historical_photos', index, 'caption', e.target.value)} placeholder="Legenda — ex.: Vista da entrada da rua" />
                    <Input type="date" value={photo.date || ''} onChange={(e) => updateArrayItem('historical_photos', index, 'date', e.target.value)} aria-label="Data da foto" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <select value={photo.subject || 'street'} onChange={(e) => updateArrayItem('historical_photos', index, 'subject', e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="street">Foto da rua</option>
                      <option value="honoree">Foto do homenageado</option>
                    </select>
                    {/* A estrela some no retrato do homenageado: ele não pode
                        ser capa, então um botão ali seria uma promessa falsa. */}
                    {(photo.subject || 'street') === 'street' && (
                      <Button
                        type="button"
                        variant={photo.featured ? 'default' : 'outline'}
                        className="gap-2"
                        aria-pressed={Boolean(photo.featured)}
                        onClick={() => destacarFoto(index)}
                      >
                        <Star className={`h-4 w-4 ${photo.featured ? 'fill-current' : ''}`} />
                        {photo.featured ? 'Em destaque' : 'Destacar'}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" className="justify-self-end text-red-500" onClick={() => removeArrayItem('historical_photos', index)}><Trash2 className="mr-2 h-4 w-4" /> Remover</Button>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </section>
          )}

          {activeStep === 1 && (
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Localização</Label>
            <div className="h-64 w-full rounded-lg overflow-hidden border border-input">
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                <LocationPickerMap
                  onLocationChange={handleLocationChange}
                  initialPosition={formData.location}
                  existingMarkers={otherStreets}
                  fallbackCityCenter={fallbackCityCenter}
                />
              </Suspense>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={buscarTracado} disabled={buscandoTracado}>
                {buscandoTracado
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</>
                  : <><Road className="h-4 w-4" /> Buscar traçado no OpenStreetMap</>}
              </Button>

              {/* DESENHAR À MÃO É O QUE FECHA O MAPA.
                  A busca automática erra sempre as mesmas ruas: as que o OSM não
                  tem, as sem nome oficial e as de grafia divergente — ou seja, as
                  mais novas e as mais precárias, que são exatamente as que
                  importam num mapa de pavimentação. Sem esta opção elas ficariam
                  como ponto para sempre.
                  Exige o pino, porque o desenho precisa de um lugar para abrir. */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!formData.location}
                title={formData.location ? undefined : 'Marque o ponto da rua primeiro'}
                onClick={() => setDesenhando(true)}
              >
                <PenLine className="h-4 w-4" /> Desenhar traçado
              </Button>

              <p className="text-xs text-muted-foreground">
                {formData.path_wkt
                  ? `Traçado ${formData.path_source === 'manual' ? 'desenhado' : 'encontrado'} — salve para gravar.`
                  : formData.path
                  ? 'Esta rua já tem traçado gravado.'
                  : 'Sem traçado: a rua aparece no mapa como um ponto.'}
              </p>
            </div>
          </div>
          )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-edge-subtle bg-surface-raised px-4 py-3 sm:px-6">
            {activeStep === 1 ? (
              <>
                <DialogClose asChild><Button type="button" variant="outline" className="h-11 rounded-xl sm:min-w-28" disabled={saving}>Cancelar</Button></DialogClose>
                <Button type="submit" className="h-11 gap-2 rounded-xl sm:min-w-32" disabled={saving}>Próximo <ChevronRight className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl sm:min-w-28" onClick={() => setActiveStep(1)} disabled={saving}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
                <Button type="submit" className="h-11 gap-2 rounded-xl sm:min-w-32" disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : <><Save className="w-4 h-4" /> Salvar</>}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </FormDialogContent>
      {/* O desenho vive FORA do <form>: um clique no mapa dentro do formulário
          seria interpretado como envio em alguns navegadores, e a pessoa
          perderia a etapa 2 no primeiro toque. */}
      {/* Montagem CONDICIONAL, e nao so `aberto={...}`: o componente guarda os
          pontos em estado proprio, e mantido montado ele reabriria com o
          desenho da rua anterior ja na tela. */}
      {desenhando && (
      <DesenharTracado
        aberto
        nomeDaRua={formData?.name}
        centro={formData?.location}
        onConcluir={(wkt) => setFormData((atual) => ({ ...atual, path_wkt: wkt, path_source: 'manual' }))}
        onFechar={() => setDesenhando(false)}
      />
      )}
    </Dialog>
  );
};

export default PavementEditModal;
