import florestaPe from '@/data/ibge/floresta-pe-urban-boundary.json';

const normalizar = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

// O arquivo e pequeno e vai empacotado no app. Assim, gerar o PDF nao depende
// da disponibilidade de um servico externo no momento do download. Novas
// cidades entram aqui depois de extrair a respectiva malha oficial do IBGE.
const LIMITES_POR_CIDADE = {
  'floresta|pe': florestaPe,
};

export const limiteUrbanoIbgeParaCidade = (cidade) => {
  const nome = normalizar(cidade?.name);
  const uf = normalizar(cidade?.state?.uf);
  return LIMITES_POR_CIDADE[`${nome}|${uf}`] || null;
};
