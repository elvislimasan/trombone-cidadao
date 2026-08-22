import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { X, Loader2, MapPinOff, Timer, Route as RouteIcon } from 'lucide-react';
import L from 'leaflet';

import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { supabase } from '@/lib/customSupabaseClient';
import { rastroDoBanco } from '@/lib/navGeo';

// O percurso de uma patrulha, no mapa.
//
// SÓ A DONA VÊ, E ISSO NÃO É REGRA DESTA TELA
//
// O traço vive em `patrol_paths`, que tem uma única policy de leitura:
// `auth.uid() = user_id`. Não existe versão pública dela. Então mesmo que esta
// tela fosse aberta com o id de uma patrulha compartilhada de outra pessoa, a
// consulta voltaria vazia — não é a interface que esconde, é o banco.
//
// A migração 188 explica por quê: o começo e o fim de um percurso são o
// endereço de casa de quem patrulhou.
//
// POR QUE UM MAPA PRÓPRIO, E NÃO O MapView
//
// O MapView carrega clusters, filtros, pins de bronca, navegação e rotação —
// vinte e tantas props para desenhar uma linha. Aqui é uma linha e dois pontos.

/** Enquadra o mapa no percurso inteiro assim que ele chega. */
const Enquadrar = ({ pontos, marcos }) => {
  const map = useMap();

  useEffect(() => {
    // As ações entram no enquadramento: uma bronca registrada a pé, longe do
    // ponto onde o carro parou, ficaria fora da tela se só o traço contasse.
    const todos = [...pontos, ...(marcos || [])];
    if (todos.length < 2) return;
    const caixa = L.latLngBounds(todos.map((p) => [p.lat, p.lng]));
    // A margem impede que o traço encoste na borda, onde ele fica ilegível.
    map.fitBounds(caixa, { padding: [28, 28], animate: false });
  }, [map, pontos, marcos]);

  return null;
};

/** Cor e nome de cada ação. Espelha o vocabulário da migração 189. */
const ACOES = {
  bronca: { cor: 'rgb(var(--brand))', nome: 'Bronca registrada' },
  missao: { cor: 'rgb(var(--success-fg))', nome: 'Missão cumprida' },
  sinal: { cor: 'rgb(var(--status-pending-fg))', nome: 'Sinalização' },
  confirmacao: { cor: 'rgb(var(--status-progress-fg))', nome: 'Confirmação' },
};
const COR_DA_ACAO = Object.fromEntries(
  Object.entries(ACOES).map(([k, v]) => [k, v.cor])
);

const formatarDuracao = (segundos) => {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

const formatarDistancia = (metros) => {
  const m = Math.max(0, Math.round(metros || 0));
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
};

export default function PatrolRouteModal({ patrulha, onFechar }) {
  const [bruto, setBruto] = useState(null);
  const [acoes, setAcoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      setCarregando(true);
      setErro(false);
      try {
        const { data, error } = await supabase
          .from('patrol_paths')
          .select('path, actions')
          .eq('patrol_id', patrulha.id)
          .maybeSingle();

        if (error) throw error;
        if (!cancelado) {
          setBruto(data?.path ?? null);
          setAcoes(data?.actions ?? []);
        }
      } catch (err) {
        console.error('[PatrolRouteModal] falha ao buscar percurso:', err);
        if (!cancelado) setErro(true);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => { cancelado = true; };
  }, [patrulha.id]);

  const pontos = useMemo(() => rastroDoBanco(bruto), [bruto]);

  const marcos = useMemo(
    () =>
      (acoes || []).filter(
        (a) => a && Number.isFinite(a.lat) && Number.isFinite(a.lng)
      ),
    [acoes]
  );

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-surface-base">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-edge-subtle shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-content-primary leading-tight">
            Percurso
          </h2>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-content-secondary tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Timer size={12} className="text-content-tertiary" />
              {formatarDuracao(patrulha.duration_seconds)}
            </span>
            <span className="inline-flex items-center gap-1">
              <RouteIcon size={12} className="text-content-tertiary" />
              {formatarDistancia(patrulha.distance_meters)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar percurso"
          className="shrink-0 w-9 h-9 rounded-full bg-surface-subtle flex items-center justify-center text-content-secondary active:bg-surface-subtleHover"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={26} className="animate-spin text-brand" />
          </div>
        )}

        {/* Percurso ausente não é erro: toda patrulha anterior à migração 188
            está nesse caso, e dizer "falhou" faria parecer defeito o que é só
            história antiga. */}
        {!carregando && pontos.length < 2 && marcos.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <MapPinOff size={30} className="text-content-tertiary mb-3" />
            <p className="font-bold text-content-primary">
              {erro ? 'Não foi possível carregar' : 'Sem percurso guardado'}
            </p>
            <p className="text-sm text-content-secondary mt-1 leading-snug max-w-xs">
              {erro
                ? 'Tente de novo em instantes.'
                : 'O app passou a guardar o traço das patrulhas há pouco tempo. As saídas anteriores mantêm os números, mas não o caminho.'}
            </p>
          </div>
        )}

        {!carregando && (pontos.length >= 2 || marcos.length > 0) && (
          <MapContainer
            center={[(pontos[0] || marcos[0]).lat, (pontos[0] || marcos[0]).lng]}
            zoom={15}
            zoomControl={false}
            attributionControl={false}
            className="w-full h-full"
          >
            <ThemedTileLayer />
            <Enquadrar pontos={pontos} marcos={marcos} />

            {/* Sem traço, mas com ação, ainda há mapa: quem ficou parado e
                registrou três broncas tem os três pontos para ver. */}
            {pontos.length >= 2 && (
              <>
                {/* Duas linhas empilhadas: a de baixo, mais grossa e da cor do
                    fundo, faz o contorno que separa o traço do mapa. Sem ela a
                    linha some sobre uma avenida da mesma cor. */}
                <Polyline
              positions={pontos.map((p) => [p.lat, p.lng])}
              pathOptions={{
                color: 'rgb(var(--surface-base))',
                weight: 9,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
                <Polyline
                  positions={pontos.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: 'rgb(var(--brand))',
                    weight: 5,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />

                {/* Começo e fim. Sem eles a linha não diz para que lado se
                    andou. */}
                <CircleMarker
                  center={[pontos[0].lat, pontos[0].lng]}
                  radius={6}
                  pathOptions={{
                    color: 'rgb(var(--surface-base))',
                    weight: 3,
                    fillColor: 'rgb(var(--content-tertiary))',
                    fillOpacity: 1,
                  }}
                />
                <CircleMarker
                  center={[pontos[pontos.length - 1].lat, pontos[pontos.length - 1].lng]}
                  radius={7}
                  pathOptions={{
                    color: 'rgb(var(--surface-base))',
                    weight: 3,
                    fillColor: 'rgb(var(--brand))',
                    fillOpacity: 1,
                  }}
                />
              </>
            )}

            {/* O que aconteceu no caminho. É o assunto do mapa: o traço diz
                por onde, os pontos dizem o quê. */}
            {marcos.map((a, i) => (
              <CircleMarker
                key={i}
                center={[a.lat, a.lng]}
                radius={7}
                pathOptions={{
                  color: 'rgb(var(--surface-base))',
                  weight: 2.5,
                  fillColor: COR_DA_ACAO[a.t] || 'rgb(var(--brand))',
                  fillOpacity: 1,
                }}
              />
            ))}

          </MapContainer>
        )}
      </div>

      {!carregando && (pontos.length >= 2 || marcos.length > 0) && (
        <div
          className="shrink-0 px-5 py-3 border-t border-edge-subtle"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
        >
          {/* Legenda só dos tipos que aconteceram nesta saída. Listar os quatro
              sempre faria a pessoa procurar cores que não estão no mapa. */}
          {marcos.length > 0 && (
            <div className="flex items-center justify-center gap-x-4 gap-y-1.5 flex-wrap mb-2">
              {Object.entries(ACOES)
                .filter(([tipo]) => marcos.some((a) => a.t === tipo))
                .map(([tipo, { cor, nome }]) => (
                  <span key={tipo} className="inline-flex items-center gap-1.5 text-[11px] text-content-secondary">
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-2 ring-surface-base"
                      style={{ backgroundColor: cor }}
                    />
                    {nome}
                  </span>
                ))}
            </div>
          )}

          {/* A promessa que a migração 188 sustenta, dita para quem tem o botão
              de compartilhar ao lado deste. */}
          <p className="text-[11px] text-content-tertiary text-center leading-snug">
            Só você vê este percurso. Compartilhar a patrulha não compartilha o
            caminho.
          </p>
        </div>
      )}
    </div>
  );
}
