import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { X, Camera, Image as GalleryIcon, Loader2, MapPin, Check, Move } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { notifyNative } from '@/lib/nativeNotification';
import { showAppError } from '@/lib/appError';
import { useNativeCamera } from '@/hooks/useNativeCamera';
import { RAIO_PRESENCA_M, RAIO_AJUSTE_M } from '@/hooks/usePatrolSignals';
import { haversine } from '@/lib/navGeo';
import { nomeDaCategoria } from '@/lib/reportCategories';
import {
  camposDaCategoria,
  validarCamposDaCategoria,
} from '@/lib/reportCategoryFields';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

/**
 * O zoom do mapa da patrulha (NAV_ZOOM, em MapView.jsx) e o do prefetch de
 * tiles (ZOOMS, em lib/tileCache.js). Os três precisam concordar: é o que faz o
 * mapa deste modal abrir sobre tiles que já estão no aparelho.
 */
const ZOOM_PATRULHA = 18;

// Registrar a bronca no local — nos dois caminhos que levam até aqui:
//
//   modo 'missao' → completa o sinal de outra pessoa (RPC, +12)
//   modo 'nova'   → cria a bronca direto, sem passar por sinal (+10)
//
// Um componente só porque a tela é a mesma: foto, título, descrição e ponto. O
// que muda é para onde o botão de concluir envia, e isso cabe num if.
//
// NÃO É O ReportModal COM CAMPOS ESCONDIDOS
//
// O ReportModal escolhe cidade, geocodifica endereço, resolve poste de
// iluminação e valida oito campos. Aqui o local já está decidido — é onde a
// pessoa está — e a categoria também. Sobra o que só quem está no local pode
// dar: a foto.
//
// ORDEM DAS DUAS ESCRITAS
//
// Primeiro a bronca, depois o upload. Invertendo, uma foto subiria para o
// storage e a escrita seria recusada por distância — sobraria arquivo pago,
// órfão. Falhar o upload depois é ruim e recuperável: dá para adicionar mídia
// pela página da bronca.

export default function PatrolReportModal({
  modo,
  missao,
  categoria,
  posicao,
  distancia,
  enviando,
  onCumprir,
  onCriar,
  onFechar,
}) {
  const { user } = useAuth();
  const cam = useNativeCamera({ maxPhotos: 3 });

  const ehMissao = modo === 'missao';

  // Ponto de referência: a marcação do sinal, ou a posição de quem registra.
  // É dele que o raio de ajuste é medido.
  const origem = useMemo(
    () => (ehMissao && missao ? { lat: missao.lat, lng: missao.lng } : posicao),
    [ehMissao, missao, posicao]
  );

  const [ponto, setPonto] = useState(origem);
  /**
   * O mapa começa ABERTO.
   *
   * Ele nascia fechado, atrás de um botão "Ajustar" — e o ponto era só uma
   * frase: "Na sua posição atual". Quem sinaliza de carro marca a esquina, não
   * o buraco, e a frase não dá nenhuma pista disso: parece exato. O erro só
   * aparecia para quem desconfiava o bastante para abrir o mapa.
   *
   * Aberto, o pino é a primeira coisa que se vê, e corrigir vira arrastar em
   * vez de descobrir. O botão continua ali para fechar quando o ponto já está
   * certo e o teclado precisa do espaço.
   */
  const [ajustando, setAjustando] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Campos que só existem para certas categorias: tipo do problema e plaqueta
  // na iluminação, obra de água nos buracos. Um objeto solto em vez de um
  // estado por campo — a lista vem de reportCategoryFields e pode crescer.
  const [extras, setExtras] = useState({});
  const [tocados, setTocados] = useState({});

  // A categoria da missão vem do sinal de quem passou; a da bronca nova, da
  // grade. É ela que decide quais campos extras a tela cobra.
  const categoriaId = ehMissao ? missao?.category : categoria;
  const nomeCategoria = ehMissao
    ? missao?.categoryName
    : nomeDaCategoria(categoria);

  const camposExtras = useMemo(() => camposDaCategoria(categoriaId), [categoriaId]);
  const errosExtras = useMemo(
    () => validarCamposDaCategoria(categoriaId, extras),
    [categoriaId, extras]
  );

  const definirExtra = useCallback((id, valor) => {
    setExtras((atual) => ({ ...atual, [id]: valor }));
    setTocados((atual) => ({ ...atual, [id]: true }));
  }, []);

  // Título sugerido pela categoria. Editável: quem está no local sabe mais que
  // a categoria escolhida às pressas por quem passou de carro.
  useEffect(() => {
    if (nomeCategoria) setTitulo(nomeCategoria);
  }, [nomeCategoria]);

  useEffect(() => { setPonto(origem); }, [origem]);

  /**
   * Aceita o arrasto só dentro do raio.
   *
   * A sinalização é aproximada de propósito — quem passa de carro marca a
   * esquina, não o buraco —, então corrigir o pin é parte do trabalho de quem
   * chega. O limite é o que separa corrigir de reapontar: sem ele, "cumprir a
   * missão" viraria arrastar o pin de casa. O servidor confere de novo (175);
   * aqui o freio existe para o arrasto não parecer aceito e falhar no envio.
   */
  const moverPonto = useCallback((novo) => {
    if (!novo || !origem) return;
    if (haversine(origem, novo) > RAIO_AJUSTE_M) {
      showAppError({
        title: 'Ponto fora da área permitida',
        description: `A localização pode ser corrigida em até ${RAIO_AJUSTE_M} metros.`,
      });
      return;
    }
    setPonto({ lat: novo.lat, lng: novo.lng });
  }, [origem]);

  const deslocamento = useMemo(
    () => (origem && ponto ? Math.round(haversine(origem, ponto)) : 0),
    [origem, ponto]
  );

  const foraDeAlcance = ehMissao && Number.isFinite(distancia) && distancia > RAIO_PRESENCA_M;
  const semFoto = cam.photoItems.length === 0;
  // Faltando campo da categoria, o envio não sai.
  //
  // Antes saía: uma bronca de iluminação era gravada sem tipo de problema e sem
  // plaqueta — que é o que permite achar o poste. Cadastro assim não é "quase
  // completo", é inútil para quem conserta, e ainda consome a missão: ninguém
  // mais vai até lá.
  const faltaCategoria = Object.keys(errosExtras).length > 0;
  const bloqueado =
    salvando || enviando || semFoto || !titulo.trim() || foraDeAlcance || faltaCategoria;

  const enviarMidia = useCallback(async (reportId, arquivos) => {
    if (!arquivos || arquivos.length === 0) return;

    const enviados = await Promise.all(
      arquivos.map(async (arquivo) => {
        const caminho = `${user.id}/${reportId}/${Date.now()}-${arquivo.name}`;
        const { error } = await supabase.storage
          .from('reports-media')
          .upload(caminho, arquivo);
        if (error) throw new Error(error.message);
        const { data } = supabase.storage.from('reports-media').getPublicUrl(caminho);
        return {
          report_id: reportId,
          url: data.publicUrl,
          type: 'photo',
          name: arquivo.name,
        };
      })
    );
    const { error } = await supabase.from('report_media').insert(enviados);
    if (error) throw new Error(error.message);
  }, [user]);

  const submeter = useCallback(async () => {
    if (bloqueado) return;
    setSalvando(true);
    try {
      // `novoPonto` só viaja quando o pin mudou de lugar: mandar a coordenada
      // igual à original faria o servidor validar um ajuste que não houve.
      const houveAjuste = deslocamento > 0;
      // Id da bronca que nasceu: a da missão continua sendo a mesma linha do
      // sinal; a nova vem do insert. O gravador precisa dele para a patrulha
      // declarar o que produziu.
      const idDaBronca = ehMissao ? missao.id : null;

      // OS ARQUIVOS SAEM DA CÂMERA ANTES DA REDE.
      //
      // A ordem "primeiro a bronca, depois o upload" continua valendo online —
      // ela evita foto órfã paga no storage quando a escrita é recusada.
      //
      // Mas offline a bronca não é escrita agora: ela vai para a fila, e a foto
      // precisa ir junto no mesmo item. Resolver os arquivos aqui é o que
      // permite isso — e não muda nada no caminho com rede, onde eles seguem
      // sendo enviados só depois.
      const arquivos = await cam.resolveForUpload();

      const r = ehMissao
        ? await onCumprir(missao.id, {
            titulo: titulo.trim(),
            descricao: descricao.trim(),
            novoPonto: houveAjuste ? ponto : null,
            extras,
            arquivos,
          })
        : await onCriar({
            categoryId: categoria,
            titulo: titulo.trim(),
            descricao: descricao.trim(),
            ponto,
            extras,
            arquivos,
          });

      if (!r?.ok) {
        showAppError({
          title: 'Não foi possível registrar a bronca',
          description: r?.motivo || r?.error?.message || 'Tente novamente em instantes.',
        });
        return;
      }

      // Foi para a fila: a foto já está guardada com ela, e não há id de bronca
      // para anexar mídia ainda.
      if (r.offline) {
        void notifyNative({
          title: 'Envio pendente',
          body: 'Sem conexão agora. A bronca será enviada automaticamente quando o sinal voltar.',
          dedupeKey: `patrulha-offline:${missao?.id || categoria}:${Date.now()}`,
        });
        onFechar({ concluida: true, modo, id: idDaBronca ?? null });
        return;
      }

      try {
        await enviarMidia(idDaBronca ?? r.id, arquivos);
      } catch (err) {
        // A bronca já existe — dizer que tudo falhou seria mentira, e o usuário
        // tentaria de novo numa missão que não está mais aberta.
        void notifyNative({
          title: 'Bronca registrada sem a foto',
          body: 'A foto não foi enviada. Você pode adicioná-la depois na página da bronca.',
          extra: {
            reportId: idDaBronca ?? r.id,
            url: `/bronca/${idDaBronca ?? r.id}`,
          },
          dedupeKey: `patrulha-foto-pendente:${idDaBronca ?? r.id}`,
        });
        onFechar({ concluida: true, modo, id: idDaBronca ?? r.id });
        return;
      }

      /* SEM TOAST DE SUCESSO.
         ──────────────────────────────────────────────────────────────────────
         Dizia "Missão cumprida 🎯 / Vai passar pela revisão antes de aparecer
         no feed" e caía na base da tela de patrulha, sobre o velocímetro e o
         botão de encerrar. O modal fechando já é a resposta, e o +12 sobe logo
         atrás; o pin da missão some do mapa no mesmo instante, que é a prova
         mais direta de que ela foi consumida.
         Os toasts que restam neste fluxo avisam de algo que a tela NÃO mostra:
         a fila offline e a foto que não subiu. */
      onFechar({ concluida: true, modo, id: idDaBronca ?? r.id });
    } finally {
      setSalvando(false);
    }
  }, [
    bloqueado, ehMissao, onCumprir, onCriar, missao, categoria, titulo,
    descricao, ponto, deslocamento, extras, enviarMidia, onFechar, modo, cam,
  ]);

  if (ehMissao && !missao) return null;
  if (!ehMissao && !categoria) return null;

  return (
    <div className="absolute inset-0 z-[1004] flex flex-col bg-surface-base">
      <input
        type="file"
        accept="image/*"
        multiple
        ref={cam.fileInputRef}
        onChange={cam.handleFileChange}
        className="hidden"
      />

      <div className="flex items-start justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-4 border-b border-edge-subtle">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-content-primary leading-tight">
            Registrar a bronca
          </h2>
          <p className="text-sm text-content-secondary mt-0.5 truncate">
            {ehMissao
              ? `Missão de ${missao.autorNome || 'outro cidadão'}`
              : nomeCategoria}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFechar({ concluida: false, modo })}
          aria-label="Cancelar"
          className="shrink-0 w-11 h-11 -mt-1 -mr-1 inline-flex items-center justify-center rounded-full text-content-secondary active:bg-surface-subtleHover"
        >
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Local: informação com uma correção possível, não um campo livre. */}
        <div className="rounded-xl bg-surface-subtle border border-edge-subtle overflow-hidden">
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <MapPin size={17} className="text-brand shrink-0" />
            <p className="text-sm text-content-secondary leading-snug flex-1 min-w-0">
              {ehMissao ? 'No ponto sinalizado' : 'Na sua posição atual'}
              {(ehMissao ? missao.bairro : null) ? `, no ${missao.bairro}` : ''}
              {deslocamento > 0 && (
                <span className="text-content-tertiary"> · corrigido {deslocamento} m</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setAjustando((v) => !v)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand active:bg-surface-subtleHover"
            >
              <Move size={14} />
              {ajustando ? 'Pronto' : 'Ajustar'}
            </button>
          </div>

          {ajustando && (
            <div className="border-t border-edge-subtle">
              <div className="h-[220px] relative">
                <Suspense
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 size={22} className="animate-spin text-content-tertiary" />
                    </div>
                  }
                >
                  <LocationPickerMap
                    initialPosition={ponto}
                    onLocationChange={moverPonto}
                    // Esta é A tela que precisa funcionar sem rede: quem chegou
                    // até aqui está de pé no local do problema, que é onde o
                    // sinal falta. Lê os tiles que a patrulha baixou de véspera
                    // e desenha o pino em SVG, sem depender de nenhum PNG.
                    offline
                    // O mesmo zoom da patrulha (MapView NAV_ZOOM). Abrindo em
                    // 19, como era o padrão, o mapa pedia uma grade de tiles
                    // que ninguém tinha buscado — cinza garantido offline.
                    initialZoom={ZOOM_PATRULHA}
                  />
                </Suspense>
              </div>
              <p className="px-3.5 py-2 text-[11px] text-content-tertiary leading-snug">
                Arraste o pino até onde o problema está. A sinalização é feita em
                movimento e costuma cair aproximada — o ajuste vale até{' '}
                {RAIO_AJUSTE_M} m.
              </p>
            </div>
          )}
        </div>

        {foraDeAlcance && (
          <div className="rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3.5 py-3">
            <p className="text-sm font-semibold text-status-pendingFg leading-snug">
              Você se afastou do ponto. Aproxime-se para menos de {RAIO_PRESENCA_M} m
              para registrar.
            </p>
          </div>
        )}

        {/* Campos da categoria.
            ────────────────────────────────────────────────────────────────
            Vêm antes da foto de propósito: são o que decide se o cadastro
            serve para alguma coisa. Uma bronca de iluminação sem plaqueta
            obriga a concessionária a mandar alguém procurar o poste; com ela,
            vai direto. O erro só aparece depois que a pessoa mexeu no campo —
            abrir a tela já cheia de vermelho é acusar quem ainda nem começou. */}
        {camposExtras.map((campo) => {
          const erro = tocados[campo.id] ? errosExtras[campo.id] : null;
          const idCampo = `extra-${campo.id}`;

          if (campo.tipo === 'confirmacao') {
            return (
              <label
                key={campo.id}
                htmlFor={idCampo}
                className="flex items-start gap-3 rounded-xl bg-surface-subtle border border-edge-subtle px-3.5 py-3"
              >
                <input
                  id={idCampo}
                  type="checkbox"
                  checked={!!extras[campo.id]}
                  onChange={(e) => definirExtra(campo.id, e.target.checked)}
                  className="mt-0.5 h-6 w-6 shrink-0 rounded border-edge-default accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-content-primary leading-tight">
                    {campo.rotulo}
                  </span>
                  {campo.ajuda && (
                    <span className="block text-xs text-content-tertiary mt-0.5 leading-snug">
                      {campo.ajuda}
                    </span>
                  )}
                </span>
              </label>
            );
          }

          return (
            <div key={campo.id}>
              <label
                htmlFor={idCampo}
                className="block text-sm font-bold text-content-primary mb-2"
              >
                {campo.rotulo}
                {campo.obrigatorio && <span className="text-danger"> *</span>}
              </label>

              {campo.tipo === 'selecao' ? (
                <select
                  id={idCampo}
                  value={extras[campo.id] || ''}
                  onChange={(e) => definirExtra(campo.id, e.target.value)}
                  className={`w-full h-12 rounded-xl bg-surface-subtle border px-3.5 text-content-primary focus:outline-none focus:border-brand ${
                    erro ? 'border-danger' : 'border-edge-default'
                  }`}
                >
                  <option value="">Selecione…</option>
                  {campo.opcoes.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                /* Teclado de TEXTO, não numérico.

                   O barramento do poste é composto de letras e números —
                   costuma vir numa faixa amarela presa ao poste. Com
                   `inputMode="numeric"` o teclado do celular abria só com
                   dígitos, e a plaqueta com letra ficava impossível de digitar
                   sem trocar de teclado na mão.

                   `autoCapitalize="characters"` porque plaqueta é código, e
                   código se lê em maiúscula; corretor e verificação ortográfica
                   desligados pelo mesmo motivo. */
                <input
                  id={idCampo}
                  value={extras[campo.id] || ''}
                  onChange={(e) => definirExtra(campo.id, e.target.value)}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={40}
                  placeholder={campo.exemplo}
                  className={`w-full h-12 rounded-xl bg-surface-subtle border px-3.5 text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand ${
                    erro ? 'border-danger' : 'border-edge-default'
                  }`}
                />
              )}

              {erro ? (
                <p className="text-xs text-danger mt-1.5">{erro}</p>
              ) : campo.ajuda ? (
                <p className="text-xs text-content-tertiary mt-1.5 leading-snug">
                  {campo.ajuda}
                </p>
              ) : null}
            </div>
          );
        })}

        <div>
          <label className="block text-sm font-bold text-content-primary mb-2">
            Foto do problema
            <span className="text-danger"> *</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {cam.photoItems.map((item) => (
              <div
                key={item.id}
                className="relative w-[72px] h-[72px] rounded-2xl overflow-hidden bg-surface-sunken shrink-0"
              >
                <img src={item.preview} alt="" className="block w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => cam.removePhoto(item.id)}
                  aria-label="Remover foto"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center active:scale-90"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}

            {cam.addingPhoto && (
              <div className="w-[72px] h-[72px] rounded-2xl bg-surface-sunken flex items-center justify-center shrink-0">
                <Loader2 className="w-5 h-5 text-content-tertiary animate-spin" />
              </div>
            )}

            {cam.canAdd && (
              <>
                <button
                  type="button"
                  onClick={cam.handleCamera}
                  className="w-[72px] h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-dashed border-brand/30 bg-brand-subtleBg active:scale-90 transition-transform shrink-0"
                >
                  <Camera className="w-5 h-5 text-brand-subtleFg" />
                  <span className="text-[9px] font-semibold text-brand-subtleFg">Câmera</span>
                </button>
                <button
                  type="button"
                  onClick={cam.handleGallery}
                  className="w-[72px] h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-dashed border-edge-default bg-surface-sunken active:scale-90 transition-transform shrink-0"
                >
                  <GalleryIcon className="w-5 h-5 text-content-tertiary" />
                  <span className="text-[9px] font-semibold text-content-secondary">Galeria</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="bronca-titulo" className="block text-sm font-bold text-content-primary mb-2">
            Título
          </label>
          <input
            id="bronca-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={120}
            className="w-full h-12 rounded-xl bg-surface-subtle border border-edge-default px-3.5 text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
            placeholder="Ex.: Buraco fundo na pista"
          />
        </div>

        <div>
          <label htmlFor="bronca-descricao" className="block text-sm font-bold text-content-primary mb-2">
            O que você encontrou?
          </label>
          <textarea
            id="bronca-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
            maxLength={600}
            className="w-full rounded-xl bg-surface-subtle border border-edge-default px-3.5 py-3 text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
            placeholder="Tamanho, risco para quem passa, há quanto tempo parece estar assim…"
          />
        </div>
      </div>

      <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-edge-subtle">
        <button
          type="button"
          onClick={submeter}
          disabled={bloqueado}
          className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-xl bg-brand text-content-onBrand font-bold text-base active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          {salvando || enviando ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              <Check size={20} />
              {ehMissao ? 'Concluir missão' : 'Registrar bronca'}
            </>
          )}
        </button>
        {(semFoto || faltaCategoria) && (
          <p className="text-xs text-content-tertiary text-center mt-2">
            {faltaCategoria
              ? Object.values(errosExtras)[0]
              : 'A foto é o que transforma o relato em bronca.'}
          </p>
        )}
      </div>
    </div>
  );
}
