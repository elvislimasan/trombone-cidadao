import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { PRECISAO_PREVISAO, TIPOS, instanteDaPrevisao, precisaoDoEvento, tipoDe } from '@/lib/cityEvents';
import { IconeDoAcontecimento } from '@/components/agora/CityEventVisuals';
import CityEventImageField from '@/components/agora/CityEventImageField';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { normalizarLinkExterno, textoDoBotaoExterno } from '@/lib/externalLinks';

// "Nova ocorrência" — a tela de criar e editar um acontecimento.
//
// POR QUE O TÍTULO EXISTE, MESMO NÃO ESTANDO NO LAYOUT
//
// O layout traz tipo, áreas, início, previsão, descrição e fonte. A seção 7 do
// plano traz também "Título: Abastecimento temporariamente interrompido", e a
// tela do acontecimento o usa como subtítulo — não dá para derivá-lo do tipo,
// senão todos os eventos de água teriam a mesma segunda linha.
//
// Ele vem com sugestão do tipo escolhido, então quem não quiser pensar num
// título não precisa: escolher "Falta de abastecimento" já preenche.
//
// POR QUE "ADMINISTRADOR / EMBAIXADOR" NÃO É UMA ESCOLHA LIVRE
//
// Papel não é opção de formulário: é o que a pessoa É. As abas aparecem porque
// mudam algo real para quem acumula os dois cargos — o embaixador com bairros
// designados só enxerga os bairros dele na lista de áreas. Para quem tem um
// papel só, a aba existe como rótulo e vem travada; oferecer a troca seria
// prometer uma permissão que o banco vai negar.

const DATA_HOJE = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const HORA_AGORA = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Junta os dois campos do layout num instante. Vazio vira null — "sem
 *  previsão" é uma resposta válida, e um ISO inválido não é. */
const paraInstante = (data, hora) => {
  if (!data) return null;
  const iso = new Date(`${data}T${hora || '00:00'}`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
};

const dividirInstante = (valor) => {
  if (!valor) return { data: '', hora: '' };
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return { data: '', hora: '' };
  return {
    data: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
};

const GRAVIDADES = [
  { id: 'info',     rotulo: 'Informativo' },
  { id: 'warning',  rotulo: 'Atenção' },
  { id: 'critical', rotulo: 'Crítico' },
];

const Campo = ({ label, children, dica }) => (
  <div className="space-y-1.5">
    <Label className="text-sm font-bold text-content-primary">{label}</Label>
    {children}
    {dica && <p className="text-xs text-content-tertiary">{dica}</p>}
  </div>
);

// ── O seletor de áreas ────────────────────────────────────────────────────────

const SeletorDeAreas = ({ aberto, aoFechar, cityId, bairrosPermitidos, aoEscolher, jaEscolhidas }) => {
  const [aba, setAba] = useState('neighborhood');
  const [busca, setBusca] = useState('');
  const [bairros, setBairros] = useState([]);
  const [ruas, setRuas] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!aberto || !cityId) return;
    let cancelado = false;
    setCarregando(true);
    supabase.from('bairros').select('id, name').eq('city_id', cityId).order('name').then(({ data }) => {
      if (!cancelado) { setBairros(data || []); setCarregando(false); }
    });
    return () => { cancelado = true; };
  }, [aberto, cityId]);

  // As ruas só são buscadas quando a aba é aberta — uma cidade tem centenas
  // delas, e a maioria dos acontecimentos é de bairro.
  useEffect(() => {
    if (!aberto || aba !== 'street' || !cityId || ruas.length > 0) return;
    let cancelado = false;
    setCarregando(true);
    supabase.from('pavement_streets').select('id, name, bairro_id').eq('city_id', cityId).order('name').limit(1000)
      .then(({ data }) => {
        if (!cancelado) { setRuas(data || []); setCarregando(false); }
      });
    return () => { cancelado = true; };
  }, [aberto, aba, cityId, ruas.length]);

  const restrito = Array.isArray(bairrosPermitidos) && bairrosPermitidos.length > 0;
  const permitido = useMemo(() => new Set((bairrosPermitidos || []).map(String)), [bairrosPermitidos]);

  const escolhidas = useMemo(
    () => new Set((jaEscolhidas || []).map((a) => `${a.area_type}:${a.area_id || ''}`)),
    [jaEscolhidas]
  );

  const filtrar = (lista) => {
    const q = busca.trim().toLowerCase();
    return lista.filter((item) => !q || (item.name || '').toLowerCase().includes(q));
  };

  const bairrosVisiveis = filtrar(restrito ? bairros.filter((b) => permitido.has(String(b.id))) : bairros);
  const ruasVisiveis = filtrar(restrito ? ruas.filter((r) => permitido.has(String(r.bairro_id))) : ruas);

  const Opcao = ({ id, nome, tipo }) => {
    const chave = `${tipo}:${id || ''}`;
    const ja = escolhidas.has(chave);
    return (
      <button
        type="button"
        disabled={ja}
        onClick={() => { aoEscolher({ area_type: tipo, area_id: id, label: nome }); aoFechar(); }}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-subtle disabled:opacity-40"
      >
        <span className="truncate font-semibold text-content-primary">{nome}</span>
        {ja ? <span className="text-xs text-content-tertiary">já incluído</span> : <Plus className="h-4 w-4 text-brand" />}
      </button>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar área</DialogTitle>
          <DialogDescription>
            {restrito
              ? 'Você publica nos bairros sob sua responsabilidade.'
              : 'Escolha um bairro, uma rua específica, ou a cidade inteira.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-2xl bg-surface-sunken p-1">
          {[
            { id: 'neighborhood', rotulo: 'Bairros' },
            { id: 'street', rotulo: 'Ruas' },
            ...(restrito ? [] : [{ id: 'city', rotulo: 'Cidade' }]),
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                aba === t.id ? 'bg-surface-raised text-content-primary shadow-elevation-1' : 'text-content-tertiary'
              }`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        {aba === 'city' ? (
          <div className="pt-2">
            <p className="mb-3 text-sm text-content-secondary">
              Marca o acontecimento para toda a cidade. Todo mundo que acompanha qualquer rua ou bairro
              daqui recebe o aviso.
            </p>
            <Button
              className="w-full"
              onClick={() => { aoEscolher({ area_type: 'city', area_id: null, label: 'Toda a cidade' }); aoFechar(); }}
            >
              Marcar cidade inteira
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={aba === 'street' ? 'Buscar rua...' : 'Buscar bairro...'}
                className="pl-9"
              />
            </div>

            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {carregando && (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
              )}
              {!carregando && aba === 'neighborhood' && bairrosVisiveis.map((b) => (
                <Opcao key={b.id} id={b.id} nome={b.name} tipo="neighborhood" />
              ))}
              {!carregando && aba === 'street' && ruasVisiveis.map((r) => (
                <Opcao key={r.id} id={r.id} nome={r.name} tipo="street" />
              ))}
              {!carregando && ((aba === 'neighborhood' && bairrosVisiveis.length === 0) ||
                               (aba === 'street' && ruasVisiveis.length === 0)) && (
                <p className="py-6 text-center text-sm text-content-tertiary">Nada encontrado.</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── O formulário ──────────────────────────────────────────────────────────────

const CityEventForm = ({
  cityId,
  cityName,
  papel,
  bairrosDesignados = [],
  restritoABairros = false,
  evento = null,
  salvando = false,
  aoSalvar,
  aoCancelar,
}) => {
  const editando = Boolean(evento?.id);

  const inicioInicial = dividirInstante(evento?.started_at) ;
  const previsaoInicial = dividirInstante(evento?.estimated_end_at);

  const [type, setType] = useState(evento?.type || 'water_outage');
  const [title, setTitle] = useState(evento?.title || '');
  const [tituloTocado, setTituloTocado] = useState(Boolean(evento?.title));
  const [severity, setSeverity] = useState(evento?.severity || 'warning');
  const [areas, setAreas] = useState(evento?.areas || []);
  const [dataInicio, setDataInicio] = useState(inicioInicial.data || DATA_HOJE());
  const [horaInicio, setHoraInicio] = useState(inicioInicial.hora || HORA_AGORA());
  const [dataPrevisao, setDataPrevisao] = useState(previsaoInicial.data);
  const [horaPrevisao, setHoraPrevisao] = useState(previsaoInicial.hora);
  const [description, setDescription] = useState(evento?.description || '');
  const [sourceName, setSourceName] = useState(evento?.source_name || '');
  const [sourceUrl, setSourceUrl] = useState(evento?.source_url || '');
  const [sourceButtonLabel, setSourceButtonLabel] = useState(evento?.source_button_label || '');
  const [notify, setNotify] = useState(true);
  // A foto que ja esta gravada. `null` depois que a pessoa toca no X — e o
  // que diz a diferenca entre 'nao mexi' e 'quero tirar' na hora de salvar.
  const [precisaoPrevisao, setPrecisaoPrevisao] = useState(precisaoDoEvento(evento));
  const [imagemAtual, setImagemAtual] = useState(evento?.image_url || null);
  const cam = useNativeCamera({ maxPhotos: 1 });
  const [abrirAreas, setAbrirAreas] = useState(false);

  // O título segue o tipo enquanto ninguém o tiver escrito à mão. Depois do
  // primeiro toque ele para de mudar sozinho — trocar o tipo não pode apagar
  // uma frase que a pessoa acabou de escrever.
  useEffect(() => {
    if (!tituloTocado) setTitle(tipoDe(type).rotulo);
  }, [type, tituloTocado]);

  const removerArea = useCallback((alvo) => {
    setAreas((atual) => atual.filter(
      (a) => !(a.area_type === alvo.area_type && String(a.area_id || '') === String(alvo.area_id || ''))
    ));
  }, []);

  const adicionarArea = useCallback((nova) => {
    setAreas((atual) => {
      // Cidade inteira substitui tudo: manter "Centro" ao lado de "toda a
      // cidade" descreveria a mesma coisa duas vezes.
      if (nova.area_type === 'city') return [nova];
      const semCidade = atual.filter((a) => a.area_type !== 'city');
      const repetida = semCidade.some(
        (a) => a.area_type === nova.area_type && String(a.area_id) === String(nova.area_id)
      );
      return repetida ? semCidade : [...semCidade, nova];
    });
  }, []);

  const enviar = async (status) => {
    // A foto escolhida sai do hook como `File` só na hora de enviar. Resolver
    // antes (a cada troca de foto) faria o app carregar o arquivo inteiro na
    // memória para uma imagem que a pessoa ainda pode trocar — e no Android o
    // caminho nativo pode nem estar pronto logo após a câmera fechar.
    const [arquivo] = await cam.resolveForUpload();
    const previsao = instanteDaPrevisao({ precisao: precisaoPrevisao, data: dataPrevisao, hora: horaPrevisao });

    aoSalvar({
      cityId,
      type,
      title: title.trim() || tipoDe(type).rotulo,
      severity,
      areas: areas.map((a) => ({ area_type: a.area_type, area_id: a.area_id })),
      startedAt: paraInstante(dataInicio, horaInicio),
      estimatedEndAt: previsao.instante,
      estimatedEndDayOnly: previsao.soDia,
      description: description.trim() || null,
      sourceName: sourceName.trim() || null,
      // String vazia na edição é intencional: a RPC usa `null` como "não
      // altere", então `''` é o valor que permite remover um link antigo.
      sourceUrl: sourceUrl.trim() ? normalizarLinkExterno(sourceUrl) : (editando ? '' : null),
      sourceButtonLabel: sourceButtonLabel.trim() || null,
      notify,
      status,
      // Quem faz o upload é quem salva (o hook de ações), não o formulário:
      // enviar aqui deixaria um objeto órfão no bucket toda vez que a gravação
      // falhasse depois do upload.
      imagemNova: arquivo || null,
      // `true` só quando havia foto e a pessoa a removeu sem escolher outra.
      limparImagem: Boolean(evento?.image_url) && !imagemAtual && !arquivo,
      imagemAnterior: evento?.image_path || null,
    });
  };

  const linkInvalido = sourceUrl.trim().length > 0 && !normalizarLinkExterno(sourceUrl);
  const podeEnviar = areas.length > 0 && title.trim().length > 0 && !linkInvalido && !salvando;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-content-primary">
          {editando ? 'Editar ocorrência' : 'Nova ocorrência'}
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          {editando
            ? 'Corrija as informações. A linha do tempo não é apagada.'
            : `Crie e publique um acontecimento para ${cityName || 'a cidade'}.`}
        </p>
      </div>

      {/* O papel com que se publica. Travado quando só há um — ver o comentário
          do topo do arquivo. */}
      <div className="flex gap-1 rounded-2xl bg-surface-sunken p-1">
        {[
          { id: 'admin', rotulo: 'Administrador' },
          { id: 'ambassador', rotulo: 'Embaixador' },
        ].map((p) => {
          const meu = papel === 'master' ? 'admin' : papel;
          const ativo = meu === p.id;
          return (
            <span
              key={p.id}
              className={`flex-1 rounded-xl px-3 py-2 text-center text-xs font-bold ${
                ativo
                  ? 'bg-surface-raised text-brand shadow-elevation-1'
                  : 'text-content-tertiary opacity-50'
              }`}
            >
              {p.rotulo}
            </span>
          );
        })}
      </div>

      <Campo label="Tipo de ocorrência">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors ${
                type === t.id
                  ? 'border-brand bg-brand-subtleBg'
                  : 'border-edge-subtle hover:border-edge-default'
              }`}
            >
              <IconeDoAcontecimento type={t.id} tamanho="sm" />
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-content-primary">{t.curto}</span>
            </button>
          ))}
        </div>
      </Campo>

      <Campo label="Título">
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTituloTocado(true); }}
          placeholder="Abastecimento temporariamente interrompido"
          maxLength={120}
        />
      </Campo>

      <Campo label="Gravidade" dica="Crítico destaca o alerta e ignora quem desligou avisos do tipo — use só quando houver risco.">
        <div className="flex gap-1 rounded-2xl bg-surface-sunken p-1">
          {GRAVIDADES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSeverity(g.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                severity === g.id ? 'bg-surface-raised text-content-primary shadow-elevation-1' : 'text-content-tertiary'
              }`}
            >
              {g.rotulo}
            </button>
          ))}
        </div>
      </Campo>

      <Campo label="Áreas afetadas" dica={restritoABairros ? 'Você só pode publicar nos bairros designados a você.' : undefined}>
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <span
              key={`${a.area_type}:${a.area_id || 'city'}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-edge-subtle bg-surface-subtle px-3 py-1.5 text-xs font-bold text-content-primary"
            >
              {a.label}
              <button
                type="button"
                onClick={() => removerArea(a)}
                className="text-content-tertiary transition-colors hover:text-danger"
                aria-label={`Remover ${a.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={() => setAbrirAreas(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-edge-default px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-surface-subtle"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar área
          </button>
        </div>
        {areas.length === 0 && (
          <p className="text-xs text-danger">Escolha ao menos uma área — é ela que define quem recebe o aviso.</p>
        )}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Início da ocorrência">
          <div className="flex gap-2">
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="flex-1" />
            <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-28" />
          </div>
        </Campo>

        <Campo
          label="Previsão de normalização"
          dica={
            precisaoPrevisao === 'nenhuma'
              ? 'Sem previsão, o alerta segue ativo e o sistema pergunta a você depois de um dia sem novidade.'
              : 'A previsão vencida não encerra nada sozinha — ela chama você para confirmar.'
          }
        >
          {/* TRÊS RESPOSTAS, NÃO UMA DATA COM MODIFICADORES
              "Sem previsão" precisa ser tão fácil de escolher quanto as outras
              duas: é a resposta honesta com mais frequência do que se gostaria,
              e um formulário que a esconde produz o que ele tentava evitar —
              uma hora inventada, que vence e cobra o responsável de novo. */}
          <div className="flex gap-1 rounded-2xl bg-surface-sunken p-1">
            {PRECISAO_PREVISAO.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrecisaoPrevisao(p.id)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                  precisaoPrevisao === p.id
                    ? 'bg-surface-raised text-content-primary shadow-elevation-1'
                    : 'text-content-tertiary'
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          {precisaoPrevisao !== 'nenhuma' && (
            <div className="flex gap-2 pt-1">
              <Input type="date" value={dataPrevisao} onChange={(e) => setDataPrevisao(e.target.value)} className="flex-1" />
              {/* Sem hora o campo SOME, não fica vazio: em branco ele viraria
                  00:00, e a tela escreveria "amanhã, meia-noite". */}
              {precisaoPrevisao === 'hora' && (
                <Input type="time" value={horaPrevisao} onChange={(e) => setHoraPrevisao(e.target.value)} className="w-28" />
              )}
            </div>
          )}
        </Campo>
      </div>

      <Campo label="Descrição">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Manutenção emergencial na rede. A equipe já está no local realizando o reparo."
          rows={4}
        />
      </Campo>

      <Campo label="Fonte" dica="Quem informou: Compesa, Celpe, Defesa Civil, Prefeitura.">
        <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Compesa" maxLength={80} />
      </Campo>

      <Campo
        label="Link externo (opcional)"
        dica="Cole o canal do YouTube, uma publicação, o site do órgão ou outra página com mais informações."
      >
        <Input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://youtube.com/@canal"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={linkInvalido}
        />
        {linkInvalido && (
          <p className="text-xs font-semibold text-danger">Informe um link válido de site, começando ou não com https://.</p>
        )}
      </Campo>

      {sourceUrl.trim() && !linkInvalido && (
        <Campo
          label="Texto do botão (opcional)"
          dica={`Se ficar vazio, aparecerá “${textoDoBotaoExterno('', sourceUrl)}”.`}
        >
          <Input
            value={sourceButtonLabel}
            onChange={(e) => setSourceButtonLabel(e.target.value)}
            placeholder={textoDoBotaoExterno('', sourceUrl)}
            maxLength={80}
          />
        </Campo>
      )}

      <CityEventImageField
        cam={cam}
        imagemAtual={imagemAtual}
        aoRemoverAtual={() => setImagemAtual(null)}
      />

      {!editando && (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-subtle px-4 py-3">
          <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
          <span className="text-sm font-semibold text-content-primary">Enviar notificação para os moradores</span>
        </label>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button className="flex-1 gap-2" disabled={!podeEnviar} onClick={() => enviar(editando ? undefined : 'active')}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {editando ? 'Salvar alterações' : 'Publicar acontecimento'}
        </Button>

        {!editando && (
          <Button variant="outline" className="flex-1" disabled={!podeEnviar} onClick={() => enviar('draft')}>
            Salvar rascunho
          </Button>
        )}

        {aoCancelar && (
          <Button variant="ghost" className="sm:flex-none" onClick={aoCancelar}>Cancelar</Button>
        )}
      </div>

      <SeletorDeAreas
        aberto={abrirAreas}
        aoFechar={() => setAbrirAreas(false)}
        cityId={cityId}
        bairrosPermitidos={restritoABairros ? bairrosDesignados : null}
        jaEscolhidas={areas}
        aoEscolher={adicionarArea}
      />
    </div>
  );
};

export default CityEventForm;
