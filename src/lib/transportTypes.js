// Tipos de veículo das opções de transporte.
//
// A lista mora aqui, e não num enum do Postgres, porque três telas precisam
// dela ao mesmo tempo (filtro do guia, formulário de cadastro e página de
// detalhes) e porque ela vai crescer conforme cidades novas entram — cada
// região tem seu transporte informal característico. A coluna
// `transport.vehicle_type` é text livre (migration 180): um valor fora desta
// lista degrada para o rótulo genérico em vez de quebrar a tela.
//
// O `icon` é o NOME de um export do lucide-react, não o componente: assim este
// módulo não importa React e continua legível por qualquer coisa. Quem desenha
// resolve o nome com `iconeDoTipoTransporte`.

export const TIPOS_TRANSPORTE = [
  { id: 'moto', name: 'Moto / Mototáxi', icon: 'Bike' },
  { id: 'tuktuk', name: 'Tuk Tuk', icon: 'CarTaxiFront' },
  { id: 'carro', name: 'Carro / Táxi', icon: 'Car' },
  { id: 'van', name: 'Van / Lotação', icon: 'Truck' },
  { id: 'onibus', name: 'Ônibus', icon: 'Bus' },
];

export const tipoTransportePorId = (id) =>
  TIPOS_TRANSPORTE.find((t) => t.id === id) || null;

export const nomeDoTipoTransporte = (id) =>
  tipoTransportePorId(id)?.name || null;

/**
 * Nome do ícone ilustrativo do tipo — sempre devolve algum.
 *
 * A página de detalhes reserva 256px de altura para a imagem principal. Sem
 * `image_url` o `<img>` quebrava e sobrava um retângulo vazio com o alt text,
 * pior que não ter espaço nenhum. Com um ícone garantido (o do tipo, ou o
 * ônibus genérico quando o tipo não foi preenchido) o bloco vira ilustração
 * em vez de erro.
 */
export const iconeDoTipoTransporte = (id) =>
  tipoTransportePorId(id)?.icon || 'Bus';
