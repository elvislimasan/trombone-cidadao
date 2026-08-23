import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';

import { categoriaPorId, nomeDaCategoria } from '@/lib/reportCategories';

const MapView = lazy(() => import('@/components/MapView'));
const PatrolOverlay = lazy(() => import('@/components/patrol/PatrolOverlay'));

// A patrulha rodando: mapa + painel, em tela cheia.
//
// POR QUE SAIU DA MapPage
//
// A patrulha nasceu como rota renderizada SOBRE o mapa de consulta, para não
// remontar o Leaflet na transição. Funcionou, mas o preço apareceu com o tempo:
// a MapPage passou a carregar quinze condicionais `if (navMode)` — não busca
// clusters, não sincroniza cidade, não mostra loader, esconde a legenda,
// desliga o toque, some com o chrome. Cada recurso novo de qualquer um dos dois
// modos obrigava a reler os freios do outro.
//
// Aqui as duas telas voltam a ter uma responsabilidade cada: a MapPage consulta,
// esta patrulha. O `MapView` continua compartilhado — ele é componente, não
// página, e é justamente por ser o mesmo que o traço, os pinos e a rotação se
// comportam igual nos dois lugares.
//
// O QUE SE PERDEU NA MUDANÇA
//
// Entrar na patrulha agora monta um Leaflet novo, com a recarga de tiles que a
// solução antiga evitava. É o custo consciente da separação. Ele fica menor
// porque o mapa só monta DEPOIS da primeira leitura de GPS: sem isso o Leaflet
// fixaria o centro no padrão e daria o salto que a MapPage documentava — dois
// carregamentos em vez de um.

export default function PatrolRunPage() {
  const navigate = useNavigate();
  const { categoria: categoriaBruta } = useParams();

  // Toda patrulha é de uma categoria. Sem categoria válida — link velho de
  // quando existia a "patrulha completa", ou URL digitada errada — a pessoa vai
  // escolher uma, em vez de cair numa tela que não sabe o que procurar.
  const categoria = categoriaPorId(categoriaBruta) ? categoriaBruta : null;

  const [posicao, setPosicao] = useState(null);
  const [broncas, setBroncas] = useState([]);
  const [rastro, setRastro] = useState([]);

  // O mapa desenha o corredor, não o enquadramento: são poucas dezenas de pinos
  // em vez de centenas, e a referência só muda quando o corredor é rebuscado.
  // Sem isso seriam centenas de setLatLng por segundo no Leaflet.
  const clusters = useMemo(
    () =>
      broncas.map((b) => ({
        isCluster: false,
        lat: b.lat,
        lng: b.lng,
        count: 1,
        ids: [b.id],
        report: { ...b, location: { lat: b.lat, lng: b.lng } },
      })),
    [broncas]
  );

  const sair = useCallback(() => {
    navigate('/missoes', { replace: true });
  }, [navigate]);

  if (!categoria) return <Navigate to="/missoes" replace />;

  const titulo = `Patrulha · ${nomeDaCategoria(categoria)}`;

  return (
    <div className="fixed inset-0 bg-surface-base overflow-hidden">
      <Helmet>
        <title>{titulo} | Trombone Cidadão</title>
        {/* Fora dos buscadores: é uma tela de uso, não de conteúdo. */}
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* O mapa só entra com a posição em mãos — ver o comentário do topo. */}
      {posicao && (
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <MapView
              clusters={clusters}
              initialCenter={posicao}
              navMode
              navPosition={posicao}
              navTrail={rastro}
              showLegend={false}
              showModeToggle={false}
              interactive={false}
              // Em patrulha nada disso é alcançável: os popins estão desligados
              // e o mapa não aceita toque. Ficam como no-op para o MapView não
              // precisar de guarda em cada chamada.
              onReportClick={() => {}}
              onUpvote={() => {}}
              onUpdateClick={() => {}}
              onBoundsChange={() => {}}
              onRecenter={() => {}}
            />
          </div>
        </Suspense>
      )}

      <Suspense fallback={null}>
        <PatrolOverlay
          categoria={categoria}
          onPosicao={setPosicao}
          onBroncas={setBroncas}
          onRastro={setRastro}
          onSair={sair}
        />
      </Suspense>
    </div>
  );
}
