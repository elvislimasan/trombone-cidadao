import { useState } from 'react';
import { MapContainer, CircleMarker, Polyline, useMapEvents } from 'react-leaflet';
import { Undo2, Trash2, Check, MousePointerClick } from 'lucide-react';

import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toMultiLineStringWkt } from '@/lib/streetGeometry';
import { formatarKm } from '@/lib/pavementLength';
import { haversine } from '@/lib/navGeo';

// Desenhar o traçado de uma rua à mão.
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
// POR QUE UM MAPA PRÓPRIO, E NÃO O LocationPickerMap
//
// Aquele tem vinte props para escolher UM ponto: marcadores de outras ruas,
// centralização por cidade, camada offline, geocodificação reversa. Aqui é uma
// linha e alguns cliques. Mesmo argumento que o PatrolRouteModal já registrou.

/** Zoom de abertura: perto o bastante para ver a via, largo para achar as pontas. */
const ZOOM = 17;

const Cliques = ({ onClique }) => {
  useMapEvents({ click: (e) => onClique([e.latlng.lng, e.latlng.lat]) });
  return null;
};

/** Comprimento da linha em metros, para a pessoa conferir enquanto desenha. */
const medir = (pontos) => {
  let total = 0;
  for (let i = 1; i < pontos.length; i += 1) {
    const [lngA, latA] = pontos[i - 1];
    const [lngB, latB] = pontos[i];
    total += haversine({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
  }
  return total;
};

/**
 * @param {boolean} aberto
 * @param {string} nomeDaRua
 * @param {{lat:number,lng:number}|null} centro  ponto já cadastrado da rua
 * @param {Array<[number,number]>} pontosIniciais  em [lng,lat]; permite corrigir um traçado
 * @param {(wkt: string) => void} onConcluir  recebe o MULTILINESTRING pronto
 * @param {() => void} onFechar
 */
export default function DesenharTracado({
  aberto,
  nomeDaRua,
  centro,
  pontosIniciais = [],
  onConcluir,
  onFechar,
}) {
  const [pontos, setPontos] = useState(pontosIniciais);

  // O mapa precisa de um centro para montar. Sem o ponto da rua não há de onde
  // partir — quem chama só oferece o botão quando há coordenada.
  if (!aberto || !centro) return null;

  const emLeaflet = pontos.map(([lng, lat]) => [lat, lng]);
  const podeSalvar = pontos.length >= 2;

  const concluir = () => {
    const wkt = toMultiLineStringWkt([pontos]);
    if (!wkt) return;
    onConcluir(wkt);
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-3xl gap-3">
        <DialogHeader>
          <DialogTitle className="text-tc-red">Desenhar o traçado</DialogTitle>
          <DialogDescription>
            Marque o <strong>início</strong> e o <strong>fim</strong> de {nomeDaRua || 'a rua'} — a
            linha é traçada entre os dois. Se a rua fizer curva, toque nos pontos do meio também.
          </DialogDescription>
        </DialogHeader>

        <div className="h-[24rem] w-full overflow-hidden rounded-xl border border-edge-subtle">
          <MapContainer center={[centro.lat, centro.lng]} zoom={ZOOM} className="desenhar-tracado h-full w-full">
            <ThemedTileLayer />
            <Cliques onClique={(ponto) => setPontos((atual) => [...atual, ponto])} />

            {/* O ponto já cadastrado da rua fica visível como referência: é a
                partir dele que a pessoa reconhece onde está. */}
            <CircleMarker
              center={[centro.lat, centro.lng]}
              radius={5}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}
            />

            {emLeaflet.length > 1 && (
              <Polyline positions={emLeaflet} pathOptions={{ weight: 4, opacity: 0.9 }} className="via-pav via-pav--unpaved" />
            )}
            {emLeaflet.map((p, i) => (
              <CircleMarker
                key={`${p[0]}-${p[1]}-${i}`}
                center={p}
                radius={4}
                pathOptions={{ color: '#fff', weight: 2, fillColor: '#ea580c', fillOpacity: 1 }}
              />
            ))}
          </MapContainer>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-content-secondary">
            <MousePointerClick className="h-3.5 w-3.5" />
            {pontos.length === 0
              ? 'Toque no INÍCIO da rua'
              : pontos.length === 1
              ? 'Agora toque no FIM da rua'
              : `${formatarKm(medir(pontos))} · ${pontos.length} pontos — toque de novo para acompanhar curvas`}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={pontos.length === 0}
              onClick={() => setPontos((atual) => atual.slice(0, -1))}
            >
              <Undo2 className="h-3.5 w-3.5" /> Desfazer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-red-500"
              disabled={pontos.length === 0}
              onClick={() => setPontos([])}
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
