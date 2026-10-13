import { cepsDaRua } from './pavementReport.js';
import { apelidosDaRua } from './streetAliases.js';

const normalizarTexto = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

// Sugestões e recorte do mapa usam o mesmo critério de busca.
export const correspondeABuscaDeRua = (rua, busca) => {
  const termo = normalizarTexto(busca);
  if (!termo) return true;

  if ([rua?.name, rua?.bairro?.name, ...apelidosDaRua(rua)]
    .some((nome) => normalizarTexto(nome).includes(termo))) return true;

  // Só consultas numéricas são comparadas aos CEPs: "Rua 20" continua
  // sendo um nome de rua. Aceita CEP parcial, com ou sem hífen e espaços.
  const digitos = termo.replace(/\D/g, '');
  if (!digitos || !/^[\d\s-]+$/.test(termo)) return false;

  return cepsDaRua(rua).some(({ cep }) => cep.replace(/\D/g, '').includes(digitos));
};
