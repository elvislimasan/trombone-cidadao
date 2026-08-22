import { useCallback, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Media } from '@capacitor-community/media';
import { LocalNotifications } from '@capacitor/local-notifications';

import { useToast } from '@/components/ui/use-toast';
import { shareImageToInstagramStory } from '@/lib/instagramStory';
import { registrarCompartilhamento } from '@/lib/shareTracking';

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
  const { toast } = useToast();
  const exportRef = useRef(null);

  const [baixando, setBaixando] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const ocupado = baixando || compartilhando;

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

  const baixar = useCallback(async () => {
    if (!exportRef.current || ocupado || !pronto) return;

    try {
      setBaixando(true);
      const dataUrl = await renderizar();
      const arquivo = `${nomeArquivo}.png`;

      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await LocalNotifications.checkPermissions();
          if (perm.display !== 'granted') {
            await LocalNotifications.requestPermissions();
          }
        } catch {}

        const base64 = dataUrl.split(',')[1] || '';
        const platform = Capacitor.getPlatform();
        let directory = Directory.Documents;
        let downloadPath = arquivo;

        // Android grava na pasta pública de imagens, senão o arquivo fica na
        // área privada do app e a galeria nunca o enxerga.
        if (platform === 'android') {
          try { await Filesystem.requestPermissions(); } catch {}
          directory = Directory.ExternalStorage;
          downloadPath = `Pictures/TromboneCidadao/Stories/${arquivo}`;
        }

        await Filesystem.writeFile({
          path: downloadPath,
          data: base64,
          directory,
          recursive: true,
        });

        const uriResult = await Filesystem.getUri({ directory, path: downloadPath });
        try {
          if (Media.requestPermissions) await Media.requestPermissions();
        } catch {}
        try {
          await Media.savePhoto({ path: uriResult.uri, album: 'Trombone Cidadão' });
        } catch {}

        try {
          const notificationId = Math.floor(Date.now() % 2147483647);
          await LocalNotifications.schedule({
            notifications: [
              {
                title: 'Card baixado!',
                body: 'O card foi salvo na sua galeria. Toque para abrir.',
                id: notificationId,
                schedule: { at: new Date(Date.now() + 100) },
                extra: { filePath: uriResult.uri, contentType: 'image/png' },
              },
            ],
          });
        } catch {
          toast({
            title: 'Card salvo na galeria',
            description: 'Notificação não disponível no dispositivo.',
          });
        }
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

      toast({ title: 'Card pronto!', description: 'A imagem foi gerada e baixada.' });
      return true;
    } catch (error) {
      console.error('[useStoryExport] falha ao baixar:', error);
      toast({
        title: 'Erro ao gerar o card',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setBaixando(false);
    }
  }, [ocupado, pronto, renderizar, nomeArquivo, toast, tipoConteudo, contentId]);

  const compartilhar = useCallback(async () => {
    if (!exportRef.current || ocupado || !pronto) return;

    try {
      setCompartilhando(true);
      const dataUrl = await renderizar();

      const { linkAttached } = await shareImageToInstagramStory({
        dataUrl,
        reportId: contentId,
        shareUrl,
      });

      if (linkAttached) {
        // Não dá para saber se o Instagram renderizou o sticker: a permissão de
        // link em story é da conta do usuário, invisível para o app.
        toast({
          title: 'Card enviado ao Instagram',
          description:
            'Se sua conta permitir link em story, o sticker do Trombone já vai estar lá.',
          duration: 4000,
        });
      }
      registrarCompartilhamento(tipoConteudo, contentId, 'story');
      aoConcluirShare?.();
      return true;
    } catch (error) {
      console.error('[useStoryExport] falha ao compartilhar:', error);
      const naoInstalado = String(error?.message || '') === 'INSTAGRAM_NOT_INSTALLED';

      toast({
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
  }, [ocupado, pronto, renderizar, contentId, shareUrl, toast, aoConcluirShare, tipoConteudo]);

  return { exportRef, baixando, compartilhando, ocupado, baixar, compartilhar, renderizar };
}
