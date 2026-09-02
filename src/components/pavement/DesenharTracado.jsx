import { useRef, useState } from 'react';
import { MapContainer, CircleMarker, Marker, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Check, CornerDownRight, MousePointerClick, Trash2, Undo2 } from 'lucide-react';

import { MapBaseLayer, MapLayerToggle, MAP_LAYER } from '@/components/map/MapDisplayControls';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toMultiLineStringWkt } from '@/lib/streetGeometry';
import { formatarKm } from '@/lib/pavementLength';
import { haversine } from '@/lib/navGeo';

// Desenhar — e CORRIGIR — o traçado de uma rua à mão.
//
// POR QUE ISTO PRECISA EXISTIR AO LADO DA BUSCA NO OPENSTREETMAP
//
// A importação acerta a maioria e erra sempre as mesmas: rua que o OSM não tem,
// rua sem nome oficial (a "Rua Projetada 20" não existe lá com esse nome), e
// grafia que não casou. São justamente as ruas novas e as mais precárias — as
// que mais interessam a um mapa de PAVIMENTAÇÃO.
//
// Sem esta ferramenta, essas ruas ficariam para sempre como um ponto, e o mapa
// nunca fecharia. E `path_source` já separava 'osm' de 'manual' desde a
// migração 203, justamente para que a reimportação em massa não passe por cima
// do que alguém desenhou.
//
// CORRIGIR NÃO É REDESENHAR
//
// O traçado gravado abre aqui dentro, e cada vértice é um pino que se ARRASTA.
// Enquanto a única forma de mexer numa rua era refazê-la ponto a ponto, o
// traçado quase certo — o do OSM que passa por dentro do quarteirão numa ponta,
// ou o desenhado às pressas — ficava como estava: doze cliques para consertar
// um deles é um preço que ninguém paga duas vezes. Arrastar é o gesto que
// transforma "está quase" em "está certo".
//
// O TOQUE NO PINO REMOVE O PONTO
//
// É a operação irmã de arrastar, e ela não pode virar mais um modo com botão
// próprio: um editor com "modo mover" e "modo apagar" faz a pessoa errar o modo
// antes de errar o ponto. O `arrastou` abaixo é o que impede um arraste de
// terminar apagando o que acabou de ser posicionado.
//
// POR QUE UM MAPA PRÓPRIO, E NÃO O LocationPickerMap
//
// Aquele tem vinte props para escolher UM ponto: marcadores de outras ruas,
// centralização por cidade, camada offline, geocodificação reversa. Aqui é uma
// linha e alguns cliques. Mesmo argumento que o PatrolRouteModal já registrou.

/** Zoom de abertura: perto o bastante para ver a via, largo para achar as pontas. */
const ZOOM = 17;

// O alvo de toque tem 24 px, e o ponto desenhado tem 12: num celular, um alvo
// do tamanho do desenho é impossível de acertar, e um desenho do tamanho do
// alvo cobre a rua que se está seguindo.
const iconeDoVertice = L.divIcon({
  className: 'tracado-vertice',
  html:
    '<span style="display:flex;width:24px;height:24px;align-items:center;justify-content:center">'
    + '<i style="display:block;width:12px;height:12px;border-radius:9999px;background:#ea580c;'
    + 'border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></i></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const Cliques = ({ onClique }) => {
  useMapEvents({ click: (e) => onClique([e.latlng.lng, e.latlng.lat]) });
  return null;
};

/** Comprimento de uma linha em metros, para a pessoa conferir enquanto desenha. */
const medirLinha = (pontos) => {
  let total = 0;
  for (let i = 1; i < pontos.length; i += 1) {
    const [lngA, latA] = pontos[i - 1];
    const [lngB, latB] = pontos[i];
    total += haversine({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
  }
  return total;
};

/** A soma dos trechos. Eles NÃO são ligados entre si — ver `extensaoDaRua`. */
const medir = (linhas) => linhas.reduce((total, linha) => total + medirLinha(linha), 0);

/**
 * @param {boolean} aberto
 * @param {string} nomeDaRua
 * @param {{lat:number,lng:number}|null} centro  ponto já cadastrado da rua
 * @param {Array<Array<[number,number]>>} linhasIniciais  trechos em [lng,lat] do traçado gravado
 * @param {(wkt: string) => void} onConcluir  recebe o MULTILINESTRING pronto
 * @param {() => void} onFechar
 */
export default function DesenharTracado({
  aberto,
  nomeDaRua,
  centro,
  linhasIniciais = [],
  onConcluir,
  onFechar,
}) {
  // Sempre existe um trecho aberto para receber cliques — mesmo numa rua nova,
  // onde ele começa vazio.
  const [linhas, setLinhas] = useState(() =>
    (linhasIniciais.length > 0 ? linhasIniciais.map((l) => [...l]) : [[]]));
  const [ativa, setAtiva] = useState(() => Math.max(0, linhasIniciais.length - 1));
  const [camada, setCamada] = useState(MAP_LAYER.STANDARD);

  // O clique do Leaflet no pino chega DEPOIS do `dragend`. Sem esta trava, todo
  // arraste terminaria apagando o ponto que acabou de ser movido.
  const arrastou = useRef(false);

  // O mapa precisa de um centro para montar. Sem o ponto da rua não há de onde
  // partir — quem chama só oferece o botão quando há coordenada.
  if (!aberto || !centro) return null;

  const total = linhas.reduce((n, l) => n + l.length, 0);
  const daAtiva = linhas[ativa] || [];
  const podeSalvar = linhas.some((l) => l.length >= 2);

  const acrescentar = (ponto) =>
    setLinhas((atual) => atual.map((linha, i) => (i === ativa ? [...linha, ponto] : linha)));

  const mover = (i, j, latlng) =>
    setLinhas((atual) =>
      atual.map((linha, li) =>
        (li === i ? linha.map((p, pi) => (pi === j ? [latlng.lng, latlng.lat] : p)) : linha)));

  const remover = (i, j) => {
    // Trecho que ficou sem nenhum ponto some. Fora do updater de propósito: um
    // `setAtiva` dentro dele rodaria duas vezes no modo estrito do React.
    const sobrando = linhas
      .map((linha, li) => (li === i ? linha.filter((_, pi) => pi !== j) : linha))
      .filter((linha) => linha.length > 0);

    if (sobrando.length === 0) { setLinhas([[]]); setAtiva(0); return; }
    setLinhas(sobrando);
    setAtiva((a) => Math.min(a, sobrando.length - 1));
  };

  const desfazer = () =>
    setLinhas((atual) => atual.map((linha, i) => (i === ativa ? linha.slice(0, -1) : linha)));

  const novoTrecho = () => {
    setLinhas((atual) => [...atual, []]);
    setAtiva(linhas.length);
  };

  const concluir = () => {
    const wkt = toMultiLineStringWkt(linhas);
    if (!wkt) return;
    onConcluir(wkt);
    onFechar();
  };

  const dica = total === 0
    ? 'Toque no INÍCIO da rua'
    : total === 1
      ? 'Agora toque no FIM da rua'
      : `${formatarKm(medir(linhas))} · ${total} pontos — arraste um pino para ajustar, toque nele para remover`;

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-3xl gap-3">
        <DialogHeader>
          <DialogTitle className="text-tc-red">
            {linhasIniciais.length > 0 ? 'Corrigir o traçado' : 'Desenhar o traçado'}
          </DialogTitle>
          <DialogDescription>
            {linhasIniciais.length > 0
              ? `O traçado gravado de ${nomeDaRua || 'a rua'} está aí. Arraste os pinos para acertar a posição, toque num pino para removê-lo, ou toque no mapa para acrescentar pontos ao trecho atual.`
              : <>Marque o <strong>início</strong> e o <strong>fim</strong> de {nomeDaRua || 'a rua'} — a
                linha é traçada entre os dois. Se a rua fizer curva, toque nos pontos do meio também.</>}
          </DialogDescription>
        </DialogHeader>

        {/* O SATÉLITE AQUI NÃO É CONFORTO, É O QUE TORNA O DESENHO POSSÍVEL
            Boa parte das ruas sem pavimentação não existe no mapa padrão: o OSM
            não tem o traçado, e quem desenha fica clicando sobre um fundo em
            branco. Na imagem de satélite a rua está lá, de terra, visível. */}
        <div className="relative h-[24rem] w-full overflow-hidden rounded-xl border border-edge-subtle">
          <MapContainer center={[centro.lat, centro.lng]} zoom={ZOOM} className="desenhar-tracado h-full w-full">
            <MapBaseLayer layer={camada} />
            <Cliques onClique={acrescentar} />

            {/* O ponto já cadastrado da rua fica visível como referência: é a
                partir dele que a pessoa reconhece onde está. */}
            <CircleMarker
              center={[centro.lat, centro.lng]}
              radius={5}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}
            />

            {linhas.map((linha, i) => (
              linha.length > 1 && (
                <Polyline
                  key={`linha-${i}`}
                  positions={linha.map(([lng, lat]) => [lat, lng])}
                  pathOptions={{ weight: 4, opacity: i === ativa ? 0.95 : 0.55 }}
                  className="via-pav via-pav--unpaved"
                  interactive={false}
                />
              )
            ))}

            {linhas.map((linha, i) =>
              linha.map(([lng, lat], j) => (
                <Marker
                  key={`ponto-${i}-${j}`}
                  position={[lat, lng]}
                  icon={iconeDoVertice}
                  draggable
                  eventHandlers={{
                    dragstart: () => { arrastou.current = true; },
                    drag: (e) => mover(i, j, e.target.getLatLng()),
                    // O `setTimeout` deixa o clique que o Leaflet dispara logo
                    // após o arraste passar com a trava ainda ligada.
                    dragend: () => { setTimeout(() => { arrastou.current = false; }, 0); },
                    click: () => { if (!arrastou.current) remover(i, j); },
                  }}
                />
              )))}
          </MapContainer>

          <div className="absolute right-3 top-3 z-[800]">
            <MapLayerToggle layer={camada} onLayerChange={setCamada} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-content-secondary">
            <MousePointerClick className="h-3.5 w-3.5" />
            {dica}
          </span>
          <div className="ml-auto flex gap-2">
            {/* UMA RUA CORTADA POR UMA PRAÇA SÃO DOIS TRECHOS, E NÃO UM
                Ligar as duas pontas somaria a travessia da praça como se fosse
                rua — é o mesmo motivo pelo qual `extensaoDaRua` mede segmento a
                segmento sem juntar os pedaços. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={daAtiva.length < 2}
              onClick={novoTrecho}
            >
              <CornerDownRight className="h-3.5 w-3.5" /> Novo trecho
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={daAtiva.length === 0}
              onClick={desfazer}
            >
              <Undo2 className="h-3.5 w-3.5" /> Desfazer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-red-500"
              disabled={total === 0}
              onClick={() => { setLinhas([[]]); setAtiva(0); }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          {/* Um ponto só não é uma linha. Desabilitar em vez de aceitar e falhar
              no banco poupa a pessoa de descobrir isso depois de salvar. */}
          <Button type="button" className="gap-1.5" disabled={!podeSalvar} onClick={concluir}>
            <Check className="h-4 w-4" /> Usar este traçado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
