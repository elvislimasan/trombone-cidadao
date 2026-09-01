import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

import { showAppNotice } from '@/lib/appError';

// A folha de compartilhamento do sistema, com a mesma escada de FeedCard,
// ReportDetails e PetitionJourney: plugin nativo, Web Share, e área de
// transferência como último recurso.
//
// POR QUE VIROU FUNÇÃO
//
// A escada estava copiada em quatro componentes, e o degrau que diverge calado
// é sempre o último: quem esquece o `clipboard` deixa o botão de compartilhar
// não fazer nada em desktop, onde `navigator.share` não existe. Numa função só,
// o degrau existe para todo mundo que chamar.
//
// Ninguém precisa tratar erro: cancelar o compartilhamento é uma ação normal do
// usuário, não uma falha.

export const compartilharLink = async ({ title, text, url }) => {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, url });
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text, url });
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showAppNotice({ title: 'Link copiado' });
      return true;
    }
  } catch {
    // Cancelado pelo usuário, ou compartilhamento indisponível.
  }
  return false;
};
