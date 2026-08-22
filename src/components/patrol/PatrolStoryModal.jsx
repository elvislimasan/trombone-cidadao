import { useEffect, useState } from 'react';
import { X, Download, Send, Loader2 } from 'lucide-react';

import { useStoryExport, STORY_WIDTH, STORY_HEIGHT } from '@/hooks/useStoryExport';
import { canShareToStory } from '@/lib/instagramStory';
import {
  toDataUri,
  bucketDataUri,
  ARQUIVO_FUNDO_PATRULHA,
} from '@/lib/storyAssets';
import PatrolStoryCard from './PatrolStoryCard';

// Card da patrulha: prévia, baixar e mandar ao story.
//
// O card é desenhado DUAS vezes: uma reduzida, aqui na tela, e outra em
// 1080×1920 fora do quadro, que é a que o toPng rasteriza. Escalar a prévia com
// `transform` para exportar dela sairia com o texto rasterizado no tamanho
// pequeno; o nó de tamanho real é o que garante a nitidez.
//
// A prévia usa `scale` sobre o mesmo componente em vez de uma versão simplificada
// — assim o que a pessoa vê é o que ela publica, e não há um segundo layout
// para manter em sincronia.

const compartilhaNoStory = canShareToStory();

export default function PatrolStoryModal({
  contagens,
  duracaoS,
  distanciaM,
  nivel,
  titulo,
  lugar,
  feitos,
  shareUrl,
  patrulhaId,
  onFechar,
}) {
  // Fundo e logo viram data URI ANTES de qualquer exportação.
  //
  // Imagem remota crua suja o canvas, e a partir daí o toPng lança em vez de
  // devolver o PNG. `pronto` mantém os botões desligados até a conversão
  // terminar — pouco mais que um piscar, e evita o card sair sem fundo por ter
  // sido exportado cedo demais.
  const [arte, setArte] = useState({ fundoUrl: '', logoUrl: '', pronta: false });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [fundoUrl, logoUrl] = await Promise.all([
        bucketDataUri(ARQUIVO_FUNDO_PATRULHA),
        toDataUri('/logo.png'),
      ]);
      if (!cancelado) setArte({ fundoUrl, logoUrl, pronta: true });
    })();
    return () => { cancelado = true; };
  }, []);

  const { exportRef, baixando, compartilhando, ocupado, baixar, compartilhar } =
    useStoryExport({
      nomeArquivo: `patrulha-${patrulhaId || Date.now()}`,
      shareUrl,
      tipoConteudo: 'patrol',
      contentId: patrulhaId,
      pronto: arte.pronta,
    });

  const dados = {
    contagens,
    duracaoS,
    distanciaM,
    nivel,
    titulo,
    lugar,
    feitos,
    fundoUrl: arte.fundoUrl,
    logoUrl: arte.logoUrl,
  };

  // `fixed`, não `absolute`.
  //
  // Dentro da patrulha os dois davam no mesmo: o pai é uma camada que já ocupa
  // a tela inteira. Mas este modal também abre pelo histórico de patrulhas, que
  // é uma página que rola — e ali `absolute` não encontra ancestral posicionado
  // nenhum, então `inset-0` passa a valer o DOCUMENTO inteiro, não a janela.
  //
  // O resultado era a caixa medindo a altura de toda a página e o card, que
  // fica centrado nela, aparecendo lá embaixo — depois de uma tela e meia de
  // vazio abaixo do cabeçalho. Foi o que apareceu na captura.
  return (
    <div className="fixed inset-0 z-[1005] flex flex-col bg-surface-base">
      <div className="flex items-start justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-4 border-b border-edge-subtle">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-content-primary leading-tight">
            Seu card da patrulha
          </h2>
          <p className="text-sm text-content-secondary mt-0.5">
            Publique no story e chame mais gente para a rua
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="shrink-0 w-11 h-11 -mt-1 -mr-1 inline-flex items-center justify-center rounded-full text-content-secondary active:bg-surface-subtleHover"
        >
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
        <div
          className="relative shrink-0 shadow-[0_30px_80px_rgba(0,0,0,0.45)] rounded-xl overflow-hidden"
          style={{ width: STORY_WIDTH * 0.24, height: STORY_HEIGHT * 0.24 }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: STORY_WIDTH,
              height: STORY_HEIGHT,
              transform: 'scale(0.24)',
            }}
          >
            <PatrolStoryCard {...dados} />
          </div>
        </div>
      </div>

      {/* Mesmo rodapé compacto do card de bronca: compartilhar leva o dobro da
          largura de fechar, e baixar vira ícone quando os três não cabem. */}
      <div
        className="border-t border-edge-subtle px-5 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onFechar}
            disabled={ocupado}
            className="flex-1 h-12 rounded-2xl border border-edge-default text-content-primary text-sm font-semibold disabled:opacity-50"
          >
            Agora não
          </button>

          {compartilhaNoStory ? (
            <>
              <button
                type="button"
                onClick={baixar}
                disabled={ocupado || !arte.pronta}
                aria-label="Baixar imagem"
                title="Baixar imagem"
                className="w-12 shrink-0 h-12 rounded-2xl border border-edge-default text-content-primary inline-flex items-center justify-center disabled:opacity-50"
              >
                {baixando ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Download size={18} />
                )}
              </button>

              <button
                type="button"
                onClick={compartilhar}
                disabled={ocupado || !arte.pronta}
                className="flex-[2] h-12 rounded-2xl bg-brand text-content-onBrand text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {compartilhando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Compartilhar
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={baixar}
              disabled={ocupado || !arte.pronta}
              className="flex-[2] h-12 rounded-2xl bg-brand text-content-onBrand text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {baixando ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Baixar imagem
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Nó real de 1080×1920, fora do quadro: é ele que vira PNG. */}
      <div
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          width: STORY_WIDTH,
          height: STORY_HEIGHT,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <PatrolStoryCard ref={exportRef} {...dados} />
      </div>
    </div>
  );
}
