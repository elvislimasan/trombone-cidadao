import { Suspense, lazy, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';

const MapView = lazy(() => import('@/components/MapView'));
const AuditOverlay = lazy(() => import('@/components/audit/AuditOverlay'));

// A auditoria rodando: mapa + painel, em tela cheia.
//
// O MAPA MOSTRA UMA COISA SÓ
//
// Nenhuma bronca aprovada aparece aqui — nem cluster, nem pino de consulta. Só
// os problemas em aberto que alguém marcou de passagem e ninguém foi conferir.
//
// É o que separa esta tela da patrulha e da MapPage: lá o mapa é o acervo da
// cidade, e a pergunta é "o que existe por aqui?". Aqui ele é uma lista de
// tarefas com coordenadas, e a pergunta é "o que falta responder?". Misturar as
// duas faria os pontos a conferir se perderem entre centenas de pinos iguais.
//
// Por isso `clusters` vai vazio de propósito: o MapView desenha os sinais pela
// prop `navMissoes`, que é a única fonte desta tela.

export default function AuditRunPage() {
  const navigate = useNavigate();

  const [posicao, setPosicao] = useState(null);
  const [sinais, setSinais] = useState([]);
  const [escolhido, setEscolhido] = useState(null);

  const sair = useCallback(() => {
    navigate('/missoes', { replace: true });
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-surface-base overflow-hidden">
      <Helmet>
        <title>Conferir problemas | Trombone Cidadão</title>
        {/* Fora dos buscadores: é uma tela de uso, não de conteúdo. */}
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* O mapa só entra com a posição em mãos: sem ela o Leaflet fixaria o
          centro no padrão e daria um salto quando o GPS respondesse. */}
      {posicao && (
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <MapView
              clusters={[]}
              initialCenter={posicao}
              navMode
              navPosition={posicao}
              navMissoes={sinais}
              onNavMissaoClick={setEscolhido}
              showLegend={false}
              showModeToggle={false}
              interactive={false}
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
        <AuditOverlay
          onPosicao={setPosicao}
          onSinais={setSinais}
          escolhidoDoMapa={escolhido}
          onEscolherDoMapa={setEscolhido}
          onSair={sair}
        />
      </Suspense>
    </div>
  );
}
