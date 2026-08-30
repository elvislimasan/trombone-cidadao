import { v4 as uuidv4 } from 'uuid';

import { showAppError, showAppNotice } from '@/lib/appError';
import { normalizarCep } from '@/lib/cepLookup';
import {
  pavementMediaStoragePath,
  removePavementMedia,
  uploadPavementMedia,
} from '@/lib/pavementStreetMedia';

const fileTypeLabel = (fileName) => {
  const extension = String(fileName || '').match(/\.([^.]+)$/)?.[1];
  return extension ? extension.toUpperCase() : '';
};

const fileTitle = (fileName) => String(fileName || '').replace(/\.[^.]+$/, '');

/** Os caminhos de Storage de uma rua — para apagar junto com ela. */
export const storagePathsFromStreet = (street) => [
  ...(Array.isArray(street?.historical_documents) ? street.historical_documents : []),
  ...(Array.isArray(street?.historical_photos) ? street.historical_photos : []),
].map(pavementMediaStoragePath).filter(Boolean);

/**
 * Grava a rua. Devolve `true` se gravou.
 *
 * POR QUE ISTO NÃO MORA MAIS NA TELA DE GERENCIAR
 *
 * Não é um `update`: é checagem de duplicidade por cidade, upload de anexos ao
 * Storage, ROLLBACK dos uploads quando a gravação falha, e resolução do
 * `city_id` pelo bairro escolhido. Três telas precisam disso agora — a de
 * gerenciar, o mapa e a página da rua.
 *
 * Copiar em vez de compartilhar é como as três divergem, e a parte que diverge
 * calada é o rollback: ele só roda no caminho de erro, que ninguém testa à mão.
 * Uma cópia sem ele deixa arquivo órfão no bucket a cada falha de gravação.
 *
 * A função não recebe a lista de ruas da tela: os anexos anteriores ela busca
 * sozinha, pelo `id`. Ver o comentário na altura do UPDATE para o porquê.
 */
export const savePavementStreet = async ({
  supabase,
  streetToSave,
  bairros,
  isScopedAmbassador = false,
  myActiveCityIds = [],
}) => {
  const { id, name, location, bairro, bairro_name, cep, ceps, work_id, path_wkt, path_source, path, cityIdDoPino, ...data } = streetToSave;

  if (!name || name.trim() === '') {
      showAppError({ title: "Erro ao salvar", description: "O nome da rua é obrigatório.", variant: "destructive" });
      return false;
  }

  // O BAIRRO DEIXOU DE SER OBRIGATÓRIO, MAS A CIDADE NÃO
  //
  // A cidade é o que faz a rua aparecer no mapa certo, e ela não pode ser nula
  // — já houve bug de rua gravada sem cidade que simplesmente não existia para
  // nenhuma tela. O que mudou é de ONDE ela pode vir.
  //
  // O bairro continua mandando quando existe, e o motivo é de coerência: ele
  // tem chave estrangeira para a cidade e é ele que a página exibe. Se o pino
  // dissesse cidade A e o bairro pertencesse à cidade B, a rua ficaria numa
  // cidade com bairro de outra — dado contraditório que nenhuma tela sabe
  // desenhar.
  //
  // Sem bairro, a coordenada responde. `cityIdDoPino` chega resolvido de quem
  // chama porque a resolução é um hook, e isto aqui é função pura de gravação.
  const selectedBairro = data.bairro_id ? bairros.find((b) => b.id === data.bairro_id) : null;

  if (data.bairro_id && !selectedBairro?.city_id) {
    showAppError({ title: "Bairro sem cidade definida", description: "Escolha outro bairro ou cadastre o bairro corretamente antes.", variant: "destructive" });
    return false;
  }

  const resolvedCityId = selectedBairro?.city_id || cityIdDoPino || null;
  if (!resolvedCityId) {
    // DUAS FALHAS DIFERENTES, DUAS MENSAGENS DIFERENTES.
    //
    // "Falta o ponto" e "o ponto não disse qual é a cidade" pedem ações
    // opostas: na primeira a pessoa marca o pino, na segunda marcar de novo não
    // resolve nada — a busca reversa é que não respondeu, e o caminho é
    // escolher o bairro. Uma mensagem só mandaria metade das pessoas repetir o
    // que já fizeram.
    const temPino = Boolean(location);
    showAppError({
      title: temPino ? "Não identifiquei a cidade pelo ponto" : "Falta o bairro ou o ponto no mapa",
      description: temPino
        ? "A busca pela coordenada não retornou a cidade. Escolha um bairro para definir a cidade da rua."
        : "A cidade da rua vem do bairro ou da coordenada. Escolha um bairro ou marque o ponto no mapa.",
      variant: "destructive",
    });
    return false;
  }

  if (isScopedAmbassador && !myActiveCityIds.includes(resolvedCityId)) {
    showAppError({ title: "Fora da sua área", description: "Você só pode gerenciar ruas nas suas cidades.", variant: "destructive" });
    return false;
  }

  const trimmedName = name.trim();
  // A checagem de nome repetido é POR CIDADE.
  //
  // Sem o recorte, ela olhava a tabela inteira: "Rua São João" cadastrada em
  // Palmares bloqueava o cadastro de "Rua São João" em qualquer outra cidade
  // do país. É o nome de rua mais comum do Brasil — e o embaixador da cidade
  // vizinha via "já existe no sistema" sem ter como descobrir onde.
  let query = supabase
      .from('pavement_streets')
      .select('id', { count: 'exact', head: true })
      .eq('city_id', resolvedCityId)
      .ilike('name', trimmedName);

  if (id) {
      query = query.neq('id', id);
  }

  const { error: checkError, count } = await query;

  if (checkError) {
      showAppError({ title: "Erro ao verificar duplicidade", description: checkError.message, variant: "destructive" });
      return false;
  }

  if (count > 0) {
      showAppError({ title: "Rua já cadastrada", description: `A rua "${trimmedName}" já existe nesta cidade.`, variant: "destructive" });
      return false;
  }

  const locationString = location ? `POINT(${location.lng} ${location.lat})` : null;

  // `path_wkt` só entra quando veio uma busca nesta sessão de edição. Sem a
  // chave no payload, o UPDATE não toca na coluna — que é o que preserva o
  // traçado de quem editou só a legenda de uma foto.
  const tracado = typeof streetToSave.path_wkt === 'string'
    ? { path: streetToSave.path_wkt, path_source: streetToSave.path_source || 'osm' }
    : {};

  const recordId = id || uuidv4();
  const uploadedPaths = [];

  let historicalDocuments;
  let historicalPhotos;
  try {
    historicalDocuments = [];
    for (const item of data.historical_documents || []) {
      if (!item?.file && !String(item?.url || '').trim()) continue;
      let stored = null;
      if (item.file) {
        stored = await uploadPavementMedia({
          supabase,
          file: item.file,
          cityId: resolvedCityId,
          streetId: recordId,
          kind: 'document',
        });
        uploadedPaths.push(stored.path);
      }
      historicalDocuments.push({
        title: item.title?.trim() || fileTitle(item.file?.name || item.original_name) || 'Documento',
        description: item.description?.trim() || '',
        type: item.file ? fileTypeLabel(item.file.name) : (item.type || ''),
        size: item.file ? item.file.size : (item.size || ''),
        original_name: item.file?.name || item.original_name || '',
        // 'lei' e o unico valor que alimenta o filtro de lei municipal. Tudo
        // que nao foi marcado vira 'outro' — inclusive cadastro antigo.
        kind: item.kind === 'lei' ? 'lei' : 'outro',
        url: stored?.url || item.url,
        ...(stored?.path || item.path ? { path: stored?.path || item.path } : {}),
      });
    }

    historicalPhotos = [];
    let jaTemDestaque = false;
    for (const item of data.historical_photos || []) {
      if (!item?.file && !String(item?.url || '').trim()) continue;
      let stored = null;
      if (item.file) {
        stored = await uploadPavementMedia({
          supabase,
          file: item.file,
          cityId: resolvedCityId,
          streetId: recordId,
          kind: 'photo',
        });
        uploadedPaths.push(stored.path);
      }
      const subject = item.subject === 'honoree' ? 'honoree' : 'street';
      // A trava final do destaque exclusivo. A tela já garante isso, mas ela
      // é a interface — e o que chega aqui pode vir de um formulário meio
      // preenchido, de um cadastro antigo, ou de outra tela amanhã.
      const featured = subject === 'street' && item.featured === true && !jaTemDestaque;
      if (featured) jaTemDestaque = true;
      historicalPhotos.push({
        caption: item.caption?.trim() || '',
        date: item.date || '',
        subject,
        featured,
        original_name: item.file?.name || item.original_name || '',
        url: stored?.url || item.url,
        ...(stored?.path || item.path ? { path: stored?.path || item.path } : {}),
      });
    }
  } catch (uploadError) {
    try { await removePavementMedia(supabase, uploadedPaths); } catch {}
    showAppError({
      title: 'Erro ao enviar anexos',
      description: uploadError.message || 'Não foi possível enviar os arquivos ao Supabase.',
      variant: 'destructive',
    });
    return false;
  }

  const vistos = new Set();
  const cepsParaSalvar = (Array.isArray(ceps) ? ceps : []).reduce((lista, item) => {
    const numero = normalizarCep(item?.cep);
    if (!numero || vistos.has(numero)) return lista;
    vistos.add(numero);
    lista.push({ cep: numero, bairro_id: item?.bairro_id || null });
    return lista;
  }, []);

  const payload = {
    name: trimmedName,
    is_unnamed: Boolean(data.is_unnamed),
    // CEPS: A LISTA É A VERDADE, `cep` É COMPATIBILIDADE
    //
    // Linha sem número é linha em branco que ficou na tela — descartar aqui
    // evita gravar `{cep: ""}` e fazer a rua parecer ter CEP cadastrado.
    // Repetido também sai: mesma faixa duas vezes não é trecho novo.
    ceps: cepsParaSalvar,
    // A coluna antiga continua recebendo o PRIMEIRO CEP enquanto houver
    // leitor que só a conhece. Ela sai numa migração posterior, quando
    // ninguém mais depender dela — ver 202_pavement_street_ceps.sql.
    cep: cepsParaSalvar[0]?.cep || null,
    status: data.status,
    paving_date: data.paving_date,
    pavement_type: data.pavement_type,
    bairro_id: data.bairro_id,
    location: locationString,
    city_id: resolvedCityId,
    honoree_name: data.honoree_name?.trim() || null,
    biography: data.biography?.trim() || null,
    curiosities: data.curiosities?.trim() || null,
    historical_documents: historicalDocuments,
    historical_photos: historicalPhotos,
    ...tracado,
  };

  // OS ANEXOS ANTIGOS SÃO BUSCADOS AQUI, E NÃO RECEBIDOS DE QUEM CHAMA.
  //
  // Eles servem para apagar do bucket o que foi SUBSTITUÍDO — o irmão do
  // rollback, e igualmente invisível: quem não os tem não perde a gravação, só
  // deixa arquivo órfão para trás, sem erro e sem aviso.
  //
  // A versão anterior desta função os tirava de uma lista `streets` passada
  // pela tela. Isso é uma armadilha: `PavementMapView` recebe a lista FILTRADA
  // por status e busca, enquanto a página tem a lista inteira. Passar a errada
  // compila, salva, e vaza — para sempre, sem ninguém notar. Buscar aqui torna
  // o acerto impossível de errar, ao custo de uma consulta por edição, numa
  // ação de admin que acontece algumas vezes por dia.
  //
  // Tem de ser ANTES do update: depois dele a linha já traz os anexos novos.
  let previousPaths = [];
  if (id) {
    const { data: anterior } = await supabase
      .from('pavement_streets')
      .select('historical_documents, historical_photos')
      .eq('id', id)
      .maybeSingle();
    // Falha aqui não derruba a gravação: sem a lista antiga o pior que
    // acontece é o arquivo trocado ficar no bucket, que é o comportamento que
    // já existia quando a tela não sabia informá-la.
    previousPaths = storagePathsFromStreet(anterior);
  }

  let error;
  if (id) {
    ({ error } = await supabase.from('pavement_streets').update(payload).eq('id', id));
  } else {
    ({ error } = await supabase.from('pavement_streets').insert({ id: recordId, ...payload }));
  }

  if (error) {
    try { await removePavementMedia(supabase, uploadedPaths); } catch {}
    showAppError({ title: "Erro ao salvar rua", description: error.message, variant: "destructive" });
    return false;
  } else {
    const currentPaths = [
      ...historicalDocuments.map(pavementMediaStoragePath),
      ...historicalPhotos.map(pavementMediaStoragePath),
    ].filter(Boolean);
    const removedPaths = previousPaths.filter((path) => !currentPaths.includes(path));
    try {
      await removePavementMedia(supabase, removedPaths);
    } catch (storageError) {
      console.error('A rua foi salva, mas anexos substituídos não foram removidos:', storageError);
    }

    showAppNotice({
      title: id ? 'Rua atualizada' : 'Rua adicionada',
      description: uploadedPaths.length > 0 ? 'Os anexos foram enviados ao Supabase.' : '',
    });
    return true;
  }
};
