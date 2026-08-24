import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FileOpener } from '@capacitor-community/file-opener';
import { Share } from '@capacitor/share';
import { Media } from '@capacitor-community/media';

// Gravação de arquivo no aparelho — o caminho que FUNCIONA em Android moderno.
//
// ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
//
// Seis telas gravavam arquivo por conta própria, todas com a mesma linha:
//
//     directory = Directory.ExternalStorage;
//     downloadPath = `Download/${fileName}`;
//
// Isso escreve direto em /storage/emulated/0/Download, o que exige
// WRITE_EXTERNAL_STORAGE. O manifest declara essa permissão com
// `maxSdkVersion="29"` — porque a partir do Android 10 ela não é mais
// concedida — e o app tem targetSdk 36. Ou seja: o `requestPermissions()` que
// vinha antes da escrita retornava sem conceder nada, e o writeFile morria com
//
//     EACCES (Permission denied)
//
// que é exatamente o erro da captura do relatório de broncas. Não tinha a ver
// com estar logado ou não; qualquer aparelho com Android 10+ falhava sempre.
//
// ── O CAMINHO CORRETO ───────────────────────────────────────────────────────
//
// Sob scoped storage o app só escreve livremente na área privada dele. Daí em
// diante existem duas saídas para o arquivo chegar ao usuário, e a escolha
// depende do TIPO:
//
//   documento (PDF) → abrir no visualizador do sistema / folha de
//                     compartilhamento, de onde a pessoa salva onde quiser
//   imagem (PNG)    → MediaStore via Media.savePhoto, que insere na galeria
//                     sem permissão nenhuma no Android 10+
//
// Os dois funcionam igual no iOS, que é a regra do CLAUDE.md: nada de caminho
// nativo que só existe num dos sistemas.

/** Converte um doc do jsPDF em base64 puro (sem o prefixo data:). */
export const pdfParaBase64 = (doc) => {
  const dataUri = doc.output('datauristring');
  return dataUri.slice(dataUri.indexOf(',') + 1);
};

/**
 * Grava um arquivo na área privada do app e devolve a URI nativa.
 *
 * Directory.Cache, não Documents: o arquivo aqui é um intermediário para o
 * visualizador ou para a galeria, e deixar o sistema limpá-lo depois é melhor
 * do que acumular PDFs que a pessoa já salvou onde queria.
 */
const gravarNoCache = async (fileName, base64) => {
  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: fileName,
  });

  return uri;
};

/**
 * Notificação que reabre o arquivo depois.
 *
 * O listener global de `localNotificationActionPerformed` em App.jsx lê
 * `extra.filePath` e chama o FileOpener — por isso o `extra` tem que vir
 * preenchido. Best-effort: sem permissão de notificação o arquivo já foi
 * entregue de qualquer forma, então a falha aqui não vira erro para o usuário.
 */
const notificarArquivoPronto = async ({ uri, contentType, titulo, corpo }) => {
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          title: titulo,
          body: corpo,
          id: Math.floor(Date.now() % 2147483647),
          schedule: { at: new Date(Date.now() + 100) },
          extra: { filePath: uri, contentType },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * Salva um documento (PDF e afins) e entrega ao usuário.
 *
 * Na web faz o download normal do navegador. No nativo grava no cache e ABRE:
 * a pessoa tocou em "Relatório" esperando ver o relatório, e o visualizador do
 * sistema já traz o "salvar em..." dele. Se nenhum app souber abrir o tipo,
 * cai na folha de compartilhamento, que sempre tem "Salvar em Arquivos".
 *
 * @param {object} opcoes
 * @param {string} opcoes.base64       conteúdo sem o prefixo `data:`
 * @param {string} opcoes.fileName     nome com extensão
 * @param {string} [opcoes.contentType]
 * @param {string} [opcoes.tituloShare] título da folha de compartilhamento
 * @returns {Promise<{uri: string}>}
 */
export const salvarDocumento = async ({
  base64,
  fileName,
  contentType = 'application/pdf',
  tituloShare = 'Compartilhar arquivo',
}) => {
  const uri = await gravarNoCache(fileName, base64);

  await notificarArquivoPronto({
    uri,
    contentType,
    titulo: 'Arquivo pronto',
    corpo: `${fileName} — toque para abrir.`,
  });

  try {
    await FileOpener.open({ filePath: uri, contentType });
  } catch {
    // Nenhum visualizador registrado para o tipo. A folha de
    // compartilhamento é o plano B universal: sempre oferece "Salvar em
    // Arquivos" no iOS e "Salvar no Drive"/gerenciador no Android.
    try {
      await Share.share({ title: tituloShare, files: [uri] });
    } catch {
      // Compartilhamento cancelado pelo usuário não é falha: o arquivo está
      // gravado e a notificação continua reabrindo ele.
    }
  }

  return { uri };
};

/**
 * Salva uma imagem na galeria do aparelho.
 *
 * `Media.savePhoto` grava via MediaStore no Android e via Photos no iOS —
 * nenhum dos dois exige escrita em diretório público, que é o que quebrava
 * antes. O arquivo de cache é só a origem da cópia.
 *
 * @returns {Promise<{uri: string, naGaleria: boolean}>}
 */
export const salvarImagemNaGaleria = async ({
  base64,
  fileName,
  album = 'Trombone Cidadão',
}) => {
  const uri = await gravarNoCache(fileName, base64);

  let naGaleria = false;
  try {
    if (Media.requestPermissions) await Media.requestPermissions();
  } catch {}
  try {
    await Media.savePhoto({ path: uri, album });
    naGaleria = true;
  } catch {
    // Sem galeria o arquivo ainda existe no cache, e a notificação abaixo
    // continua sendo um caminho válido até ele.
  }

  await notificarArquivoPronto({
    uri,
    contentType: 'image/png',
    titulo: naGaleria ? 'Card salvo na galeria!' : 'Card pronto!',
    corpo: naGaleria
      ? 'A imagem foi salva na sua galeria. Toque para abrir.'
      : 'Toque para abrir a imagem.',
  });

  return { uri, naGaleria };
};

/**
 * Compartilha uma imagem pela folha do sistema.
 *
 * É o que permite mandar o card para o story do Instagram sem o plugin nativo
 * de story: a folha lista o Instagram, e de lá a pessoa escolhe "Stories".
 * Um passo a mais que o deep link direto, mas é o único caminho que existe na
 * WEB — e na web `navigator.share` com arquivo cobre Android Chrome e iOS
 * Safari, que é onde as pessoas abrem o app pelo navegador.
 *
 * @returns {Promise<boolean>} false quando a plataforma não sabe compartilhar
 *                             arquivo — quem chama cai no download.
 */
export const compartilharImagem = async ({ base64, dataUrl, fileName, texto, url }) => {
  if (Capacitor.isNativePlatform()) {
    const uri = await gravarNoCache(fileName, base64);
    // Só `files`, sem `url`: passar os dois faz parte dos apps receberem a
    // imagem e o link como anexos separados, e o Instagram nesse caso ignora
    // a imagem. O link do Trombone vai no texto.
    await Share.share({
      title: texto,
      text: url ? `${texto} — ${url}` : texto,
      files: [uri],
      dialogTitle: 'Publicar card',
    });
    return true;
  }

  // Web Share Level 2. `canShare({files})` é o teste que importa: o Chrome do
  // desktop tem `navigator.share` mas recusa arquivo, e sem checar o share
  // rejeitaria depois de já ter fechado o modal.
  try {
    if (!navigator.canShare || !navigator.share) return false;

    const resposta = await fetch(dataUrl);
    const blob = await resposta.blob();
    const arquivo = new File([blob], fileName, { type: blob.type || 'image/png' });

    if (!navigator.canShare({ files: [arquivo] })) return false;

    await navigator.share({ files: [arquivo], text: texto, ...(url ? { url } : {}) });
    return true;
  } catch (erro) {
    // AbortError é a pessoa fechando a folha — não é falha, e não deve fazer
    // quem chama cair no download como se o compartilhamento não existisse.
    if (erro?.name === 'AbortError') return true;
    return false;
  }
};
