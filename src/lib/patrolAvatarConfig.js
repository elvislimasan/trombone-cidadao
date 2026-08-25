// O vocabulário do avatar da patrulha.
//
// POR QUE UMA CONFIGURAÇÃO, E NÃO VÁRIOS DESENHOS
//
// O boneco aparece em dois lugares que não podem divergir: o marcador do mapa,
// que nasce de uma string dentro de um `L.divIcon`, e a tela de preparação, que
// é React. Se cada estilo fosse um componente, o mapa não conseguiria usá-lo —
// e manter dois catálogos de bonecos garantiria que um dia a pessoa escolhesse
// uma coisa e visse outra na rua.
//
// Então o que existe é uma configuração pequena e serializável (cor, estilo,
// acessório, veículo). `patrolAvatarMarkup.js` monta o SVG a partir dela, e os
// dois lados montam o mesmo.
//
// AS CORES SÃO HEX, E NÃO TOKENS DO TEMA
//
// Aqui é escolha de aparência do usuário, não semântica de interface: o verde
// que a pessoa escolheu tem que continuar verde no tema escuro. Cada cor traz
// os três tons que o desenho usa — cheio, sombra e brilho — em vez de calcular
// derivadas em tempo de execução.

export const PATROL_AVATAR_STORAGE_KEY = 'patrol_avatar';

// `rgb` e `rgbClara` são os mesmos tons em tripla, porque a base luminosa do
// CSS precisa deles COM transparência — `rgb(var(--x) / 0.5)` não funciona a
// partir de um hex. Ficam pré-calculados para não haver conversão em tempo de
// execução a cada leitura de GPS.
export const PATROL_AVATAR_COLORS = Object.freeze([
  Object.freeze({ id: 'azul', label: 'Azul', base: '#2563eb', escura: '#1a44b8', clara: '#7aa7ff', rgb: '37 99 235', rgbClara: '122 167 255' }),
  Object.freeze({ id: 'verde', label: 'Verde', base: '#16a34a', escura: '#14803c', clara: '#5fd98c', rgb: '22 163 74', rgbClara: '95 217 140' }),
  Object.freeze({ id: 'vermelho', label: 'Vermelho', base: '#dc2626', escura: '#a81b1b', clara: '#fb8080', rgb: '220 38 38', rgbClara: '251 128 128' }),
  Object.freeze({ id: 'laranja', label: 'Laranja', base: '#ea580c', escura: '#b8420a', clara: '#fda568', rgb: '234 88 12', rgbClara: '253 165 104' }),
  Object.freeze({ id: 'roxo', label: 'Roxo', base: '#7c3aed', escura: '#5f27c4', clara: '#b291f7', rgb: '124 58 237', rgbClara: '178 145 247' }),
  Object.freeze({ id: 'grafite', label: 'Grafite', base: '#334155', escura: '#1e293b', clara: '#7c8ba1', rgb: '51 65 85', rgbClara: '124 139 161' }),
  Object.freeze({ id: 'branco', label: 'Branco', base: '#e8edf5', escura: '#b9c4d4', clara: '#ffffff', rgb: '232 237 245', rgbClara: '255 255 255' }),
]);

export const PATROL_AVATAR_STYLES = Object.freeze([
  Object.freeze({ id: 'classico', label: 'Clássico', descricao: 'Cabelo à mostra e camiseta na sua cor.' }),
  Object.freeze({ id: 'tatico', label: 'Tático', descricao: 'Colete, luvas e tudo escuro.' }),
  Object.freeze({ id: 'urbano', label: 'Urbano', descricao: 'Moletom com capuz.' }),
  Object.freeze({ id: 'night', label: 'Night', descricao: 'Faixas refletivas para o escuro.' }),
  Object.freeze({ id: 'camuflado', label: 'Camuflado', descricao: 'Padrão camuflado e boné mole.' }),
  Object.freeze({ id: 'rabo', label: 'Cabelo longo', descricao: 'Rabo de cavalo saindo do boné.' }),
]);

export const PATROL_AVATAR_ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'mochila', label: 'Mochila' }),
  Object.freeze({ id: 'tatica', label: 'Mochila tática' }),
  Object.freeze({ id: 'nenhuma', label: 'Sem mochila' }),
  Object.freeze({ id: 'garrafa', label: 'Garrafa' }),
  Object.freeze({ id: 'radio', label: 'Rádio' }),
  Object.freeze({ id: 'oculos', label: 'Óculos' }),
  Object.freeze({ id: 'fone', label: 'Fone' }),
]);

export const PATROL_AVATAR_VEHICLES = Object.freeze([
  Object.freeze({ id: 'sedan', label: 'Sedan' }),
  Object.freeze({ id: 'suv', label: 'SUV' }),
  Object.freeze({ id: 'picape', label: 'Picape' }),
  Object.freeze({ id: 'esportivo', label: 'Esportivo' }),
  Object.freeze({ id: 'utilitario', label: 'Utilitário' }),
]);

export const DEFAULT_PATROL_AVATAR = Object.freeze({
  cor: 'azul',
  estilo: 'classico',
  acessorio: 'mochila',
  veiculo: 'sedan',
});

const primeiroId = (catalogo) => catalogo[0].id;

const escolher = (catalogo, valor, padrao) => {
  const id = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  return catalogo.some((item) => item.id === id) ? id : padrao;
};

const buscar = (catalogo, valor) =>
  catalogo.find((item) => item.id === valor) ||
  catalogo.find((item) => item.id === primeiroId(catalogo));

/**
 * Toda peça desconhecida vira a peça padrão, isoladamente. Um estilo inventado
 * na configuração salva não pode levar a cor junto — a pessoa perderia uma
 * escolha que estava certa.
 */
export const normalizePatrolAvatar = (valor) => {
  const bruto = valor && typeof valor === 'object' ? valor : {};
  return {
    cor: escolher(PATROL_AVATAR_COLORS, bruto.cor, DEFAULT_PATROL_AVATAR.cor),
    estilo: escolher(PATROL_AVATAR_STYLES, bruto.estilo, DEFAULT_PATROL_AVATAR.estilo),
    acessorio: escolher(PATROL_AVATAR_ACCESSORIES, bruto.acessorio, DEFAULT_PATROL_AVATAR.acessorio),
    veiculo: escolher(PATROL_AVATAR_VEHICLES, bruto.veiculo, DEFAULT_PATROL_AVATAR.veiculo),
  };
};

export const getPatrolAvatarColor = (id) => buscar(PATROL_AVATAR_COLORS, id);
export const getPatrolAvatarStyle = (id) => buscar(PATROL_AVATAR_STYLES, id);
export const getPatrolAvatarAccessory = (id) => buscar(PATROL_AVATAR_ACCESSORIES, id);
export const getPatrolAvatarVehicle = (id) => buscar(PATROL_AVATAR_VEHICLES, id);

export const readStoredPatrolAvatar = (storage) => {
  try {
    return normalizePatrolAvatar(JSON.parse(storage?.getItem?.(PATROL_AVATAR_STORAGE_KEY)));
  } catch {
    // Storage bloqueado, JSON quebrado, versão antiga do formato — em todos os
    // casos o boneco padrão é melhor do que uma tela sem avatar.
    return { ...DEFAULT_PATROL_AVATAR };
  }
};

export const storePatrolAvatar = (storage, valor) => {
  const avatar = normalizePatrolAvatar(valor);
  try { storage?.setItem?.(PATROL_AVATAR_STORAGE_KEY, JSON.stringify(avatar)); } catch {}
  return avatar;
};

/**
 * Chave curta e estável da configuração. O marcador do Leaflet é reconstruído
 * só quando ela muda: recriar o nó a cada leitura de GPS reiniciaria a
 * caminhada e o boneco piscaria no mapa a cada segundo.
 */
export const patrolAvatarKey = (avatar, modo, emMovimento, gpsAtivo = true) => {
  const { cor, estilo, acessorio, veiculo } = normalizePatrolAvatar(avatar);
  const traje = modo === 'driving' ? veiculo : `${estilo}-${acessorio}`;
  return `${modo}|${cor}|${traje}|${emMovimento ? 'm' : 'p'}|${gpsAtivo ? 'g' : 'x'}`;
};
