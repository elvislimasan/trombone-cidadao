// Nomes pelos quais a rua e conhecida no dia a dia, sem substituir o nome
// oficial. O banco guarda uma lista; o formulario aceita uma linha por nome.

const chave = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/\p{Mn}/gu, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

export const normalizarApelidosDaRua = (valor, nomeOficial = '') => {
  const itens = Array.isArray(valor)
    ? valor
    : String(valor || '').split(/[\n;,]+/);
  const oficial = chave(nomeOficial);
  const vistos = new Set();

  return itens.reduce((lista, item) => {
    const nome = String(item || '').replace(/\s+/g, ' ').trim();
    const id = chave(nome);
    if (!id || id === oficial || vistos.has(id)) return lista;
    vistos.add(id);
    lista.push(nome);
    return lista;
  }, []);
};

export const apelidosDaRua = (street) =>
  normalizarApelidosDaRua(street?.informal_names, street?.name);

export const apelidosParaFormulario = (street) =>
  apelidosDaRua(street).join('\n');

