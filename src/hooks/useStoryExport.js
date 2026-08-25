import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';

import { shareImageToInstagramStory, canShareToStory } from '@/lib/instagramStory';
import { salvarImagemNaGaleria, compartilharImagem } from '@/lib/nativeDownload';
import { registrarCompartilhamento } from '@/lib/shareTracking';
import { showAppError } from '@/lib/appError';

// Exportação de um card 1080×1920: rasterizar, baixar e mandar ao story.
//
// Estava dentro do ReportStoryModal, onde nasceu. Quando a patrulha ganhou o
// próprio card, copiar estas noventa linhas teria criado dois caminhos de
// gravação em disco para manter em sincronia — e o caminho nativo é o que tem
// as partes difíceis: permissão de armazenamento no Android, o pulo de
// Documents para ExternalStorage, o savePhoto do álbum e a notificação que abre
// o arquivo. Um bug corrigido numa cópia não chegaria na outra.
//
// O que o hook NÃO sabe: o que está sendo desenhado. Ele recebe uma ref para o
// nó de 1080×1920 e o nome do arquivo; quem chama decide o conteúdo.

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/**
 * @param {object} opcoes
 * @param {string} opcoes.nomeArquivo  sem extensão; vira `<nome>.png`
 * @param {string} [opcoes.shareUrl]   link a anexar ao story, quando houver
 * @param {'report'|'patrol'} [opcoes.tipoConteudo]  o que está sendo compartilhado
 * @param {string} [opcoes.contentId]  id usado pelo instagramStory para cache
 * @param {boolean} [opcoes.pronto]    false bloqueia a exportação (assets a carregar)
 * @param {Function} [opcoes.aoConcluirShare]
 */
export function useStoryExport({
  nomeArquivo,
  shareUrl,
  contentId,
  tipoConteudo,
  pronto = true,
  aoConcluirShare,
} = {}) {
  const exportRef = useRef(null);

  const [baixando, setBaixando] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const ocupado = baixando || compartilhando;

  // ── Quem consegue compartilhar, e por qual caminho ──────────────────────────
  //
  // `viaInstagram` é o deep link direto (plugin nativo + app id da Meta).
  // `podeCompartilhar` é mais largo: inclui a folha do sistema, que existe no
  // nativo sempre e no navegador quando há Web Share com arquivo.
  //
  // A distinção importa porque o botão principal do card era "Baixar imagem"
  // em tudo que não fosse o caminho A — inclusive no Chrome do celular, onde a
  // folha do sistema existe e leva ao Instagram. Quem abria o app pelo
  // navegador só via o download e tinha que publicar o card à mão.
  const viaInstagram = canShareToStory();
  const podeCompartilhar =
    viaInstagram ||
    Capacitor.isNativePlatform() ||
    (typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function');

  /**
   * Rasteriza o nó em PNG.
   *
   * A espera de 500ms não é superstição: o nó fica fora da tela e o toPng lê o
   * layout já calculado. Sem a folga, fontes recém-carregadas e imagens ainda
   * decodificando saem do quadro — o card vinha com texto na fonte errada.
   */
  const renderizar = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return toPng(exportRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      canvasWidth: STORY_WIDTH,
      canvasHeight: STORY_HEIGHT,
      backgroundColor: '#111111',
      skipAutoScale: true,
    });
  }, []);

  /**
   * Entrega um PNG já rasterizado ao aparelho.
   *
   * Separado do `baixar` por causa do fallback do compartilhamento: quando a
   * folha do sistema recusa arquivo, `compartilhar` precisa cair no download —
   * e chamar `baixar()` de dentro dele não funcionava, porque o guarda de
   * `ocupado` já estava fechado pelo próprio compartilhamento em andamento. O
   * botão simplesmente não fazia nada.
   */
  const entregarDownload = useCallback(async (dataUrl) => {
    const arquivo = `${nomeArquivo}.png`;

    if (Capacitor.isNativePlatform()) {
      // Gravava em `Pictures/TromboneCidadao/Stories/` sob ExternalStorage,
      // o que é escrita em diretório público — negada desde o Android 10, e
      // o card simplesmente nunca era salvo. Agora o arquivo vai para a área
      // do app e entra na galeria pelo MediaStore, que não pede permissão.
      // Ver lib/nativeDownload.
      await salvarImagemNaGaleria({
        base64: dataUrl.split(',')[1] || '',
        fileName: arquivo,
      });
    } else {
      const link = document.createElement('a');
      link.download = arquivo;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Baixar para publicar à mão conta como compartilhar: é a mesma
    // intenção, e no iOS sem Instagram é o único caminho que existe. A chave
    // única da tabela garante que baixar e depois compartilhar não conte duas.
    registrarCompartilhamento(tipoConteudo, contentId, 'download');

  }, [nomeArquivo, tipoConteudo, contentId]);

  const baixar = useCallback(async () => {
    if (!exportRef.current || ocupado || !pronto) return;

    try {
      setBaixando(true);
      await entregarDownload(await renderizar());
      return true;
    } catch (error) {
      console.error('[useStoryExport] falha ao baixar:', error);
      showAppError({
        title: 'Erro ao gerar o card',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setBaixando(false);
    }
  }, [ocupado, pronto, renderizar, entregarDownload]);

  const compartilhar = useCallback(async () => {
    if (!exportRef.current || ocupado || !pronto) return;

    try {
      setCompartilhando(true);
      const dataUrl = await renderizar();

      // ── Caminho A: deep link direto para o story ──
      //
      // Só existe onde o plugin nativo e o app id da Meta estão os dois
      // presentes. É o melhor caminho — a pessoa cai no editor de story com a
      // imagem já posta — mas é o mais restrito.
      if (viaInstagram) {
        const { linkAttached } = await shareImageToInstagramStory({
          dataUrl,
          reportId: contentId,
          shareUrl,
        });

        if (linkAttached) {
          // Não dá para saber se o Instagram renderizou o sticker: a permissão
          // de link em story é da conta do usuário, invisível para o app.
        }
        registrarCompartilhamento(tipoConteudo, contentId, 'story');
        aoConcluirShare?.();
        return true;
      }

      // ── Caminho B: folha de compartilhamento do sistema ──
      //
      // No navegador não existe deep link para o story do Instagram: a Meta só
      // aceita o intent (Android) ou o pasteboard (iOS), e nenhum dos dois é
      // alcançável de uma página. A folha do sistema com o PNG anexado é o que
      // sobra — e resolve o mesmo problema, porque o Instagram aparece nela e
      // oferece "Stories" ao receber a imagem.
      //
      // `compartilharImagem` devolve false quando a plataforma recusa arquivo
      // (Chrome de desktop é o caso comum). Aí baixar não é consolo, é a única
      // coisa que funciona ali.
      const foi = await compartilharImagem({
        dataUrl,
        base64: dataUrl.split(',')[1] || '',
        fileName: `${nomeArquivo}.png`,
        texto: 'Trombone Cidadão',
        url: shareUrl,
      });

      if (!foi) {
        await entregarDownload(dataUrl);
        return true;
      }

      registrarCompartilhamento(tipoConteudo, contentId, 'story');
      aoConcluirShare?.();
      return true;
    } catch (error) {
      console.error('[useStoryExport] falha ao compartilhar:', error);
      const naoInstalado = String(error?.message || '') === 'INSTAGRAM_NOT_INSTALLED';

      showAppError({
        title: naoInstalado ? 'Instagram não encontrado' : 'Não foi possível compartilhar',
        description: naoInstalado
          ? 'Instale o Instagram para postar direto no story.'
          : 'Tente baixar o card e postar manualmente.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setCompartilhando(false);
    }
  }, [
    ocupado, pronto, renderizar, contentId, shareUrl, aoConcluirShare,
    tipoConteudo, nomeArquivo, entregarDownload, viaInstagram,
  ]);

  return {
    exportRef, baixando, compartilhando, ocupado, baixar, compartilhar,
    renderizar, podeCompartilhar, viaInstagram,
  };
}
