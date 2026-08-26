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
// Então o que existe é uma configuração pequena e serializável — cor primária,
// cor secundária, sexo, tom de pele, corte de cabelo, cor de cabelo, estilo,
// acessório e veículo. `patrolAvatarMarkup.js` monta o SVG a partir dela, e os
// dois lados montam o mesmo.
//
// CADA PEÇA DA APARÊNCIA É UM EIXO INDEPENDENTE
//
// Cabelo já foi um ESTILO DE ROUPA na mesma lista do colete tático, o que
// obrigava a escolher entre um corte e um traje. E a calça já foi um cinza
// fixo, o que fazia todo boneco depender de uma única escolha de cor. Agora
// cada eixo é livre: qualquer cabelo com qualquer roupa, qualquer par de
// cores. O desenho não ganhou um caminho novo por causa disso — ganhou tabelas.
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

// Sexo e pele são escolhas de identidade, não recompensas: ficam disponíveis
// desde o primeiro nível. O desenho usa o sexo para a silhueta e o cabelo; o tom
// de pele é uma cor independente da roupa para uma escolha nunca tingir a outra.
export const PATROL_AVATAR_SEXOS = Object.freeze([
  Object.freeze({ id: 'masculino', label: 'Masculino' }),
  Object.freeze({ id: 'feminino', label: 'Feminino' }),
]);

export const PATROL_AVATAR_TONS_PELE = Object.freeze([
  Object.freeze({ id: 'muito-claro', label: 'Muito clara', base: '#f6d2ba' }),
  Object.freeze({ id: 'claro', label: 'Clara', base: '#edb98a' }),
  // Mantém exatamente o tom que o avatar usava antes desta escolha existir.
  Object.freeze({ id: 'medio', label: 'Média', base: '#e0a479' }),
  Object.freeze({ id: 'moreno', label: 'Morena', base: '#b8734f' }),
  Object.freeze({ id: 'escuro', label: 'Escura', base: '#7a4934' }),
  Object.freeze({ id: 'retinto', label: 'Retinta', base: '#452b23' }),
]);

// O CABELO É ESCOLHA DE IDENTIDADE, E POR ISSO NÃO TEM NÍVEL
//
// Corte e cor ficam disponíveis desde o primeiro nível, como sexo e pele.
// Recompensa é o que se veste, não quem se é. E como cabelo virou eixo próprio,
// todo corte funciona com todo traje: rabo de cavalo com colete tático deixou
// de ser uma combinação impossível.
export const PATROL_AVATAR_CABELOS = Object.freeze([
  Object.freeze({ id: 'curto', label: 'Curto' }),
  Object.freeze({ id: 'medio', label: 'Médio' }),
  Object.freeze({ id: 'longo', label: 'Longo' }),
  Object.freeze({ id: 'rabo', label: 'Rabo de cavalo' }),
  Object.freeze({ id: 'coque', label: 'Coque' }),
  Object.freeze({ id: 'crespo', label: 'Crespo' }),
  Object.freeze({ id: 'raspado', label: 'Raspado' }),
]);

export const PATROL_AVATAR_CORES_CABELO = Object.freeze([
  Object.freeze({ id: 'preto', label: 'Preto', base: '#1f1a1d' }),
  Object.freeze({ id: 'castanho', label: 'Castanho', base: '#4a2f21' }),
  Object.freeze({ id: 'castanho-claro', label: 'Castanho claro', base: '#8a5a35' }),
  Object.freeze({ id: 'loiro', label: 'Loiro', base: '#d3a144' }),
  Object.freeze({ id: 'ruivo', label: 'Ruivo', base: '#a6401f' }),
  Object.freeze({ id: 'grisalho', label: 'Grisalho', base: '#98a2ae' }),
  Object.freeze({ id: 'colorido', label: 'Colorido', base: '#b93a9c' }),
]);

export const PATROL_AVATAR_STYLES = Object.freeze([
  Object.freeze({ id: 'classico', label: 'Clássico', descricao: 'Camiseta na sua cor; no feminino, saia com pregas.', nivelMinimo: 1 }),
  Object.freeze({ id: 'tatico', label: 'Tático', descricao: 'Colete, luvas e equipamento escuro.', nivelMinimo: 2 }),
  Object.freeze({ id: 'urbano', label: 'Urbano', descricao: 'Moletom com capuz; no feminino, saia urbana.', nivelMinimo: 1 }),
  Object.freeze({ id: 'night', label: 'Night', descricao: 'Faixas refletivas para patrulhar no escuro.', nivelMinimo: 3 }),
  Object.freeze({ id: 'camuflado', label: 'Camuflado', descricao: 'Padrão camuflado da cabeça aos pés.', nivelMinimo: 4 }),
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
  // Grafite é o cinza que a calça tinha cravado no desenho antes de a cor de
  // apoio existir: quem já usava o app não vê o boneco mudar sozinho.
  corSecundaria: 'grafite',
  sexo: 'masculino',
  tomPele: 'medio',
  cabelo: 'curto',
  corCabelo: 'castanho',
  estilo: 'classico',
  acessorio: 'mochila',
  veiculo: 'sedan',
});

const primeiroId = (catalogo) => catalogo[0].id;

const texto = (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : '');

const escolher = (catalogo, valor, padrao) => {
  const id = texto(valor);
  return catalogo.some((item) => item.id === id) ? id : padrao;
};

const buscar = (catalogo, valor) =>
  catalogo.find((item) => item.id === valor) ||
  catalogo.find((item) => item.id === primeiroId(catalogo));

// Sem escolha explícita, o corte acompanha o sexo. É só um ponto de partida —
// os dois catálogos são livres a partir daí, e ninguém fica preso ao padrão.
const cabeloPadrao = (sexo) => (sexo === 'feminino' ? 'longo' : DEFAULT_PATROL_AVATAR.cabelo);

/**
 * Toda peça desconhecida vira a peça padrão, isoladamente. Um estilo inventado
 * na configuração salva não pode levar a cor junto — a pessoa perderia uma
 * escolha que estava certa.
 *
 * A MIGRAÇÃO DO ANTIGO ESTILO "RABO" ACONTECE AQUI
 *
 * "Cabelo longo" era um estilo de roupa. Quem escolheu aquilo escolheu um
 * CABELO, e é isso que precisa sobreviver: o estilo volta a ser o clássico e o
 * corte vira rabo de cavalo. Sem esta linha, todo mundo que usava o estilo
 * antigo abriria o app com um boneco de cabeça diferente.
 */
export const normalizePatrolAvatar = (valor) => {
  const bruto = valor && typeof valor === 'object' ? valor : {};
  const sexo = escolher(PATROL_AVATAR_SEXOS, bruto.sexo, DEFAULT_PATROL_AVATAR.sexo);
  const legadoRabo = texto(bruto.estilo) === 'rabo';

  return {
    cor: escolher(PATROL_AVATAR_COLORS, bruto.cor, DEFAULT_PATROL_AVATAR.cor),
    corSecundaria: escolher(PATROL_AVATAR_COLORS, bruto.corSecundaria, DEFAULT_PATROL_AVATAR.corSecundaria),
    sexo,
    tomPele: escolher(PATROL_AVATAR_TONS_PELE, bruto.tomPele, DEFAULT_PATROL_AVATAR.tomPele),
    cabelo: escolher(
      PATROL_AVATAR_CABELOS,
      bruto.cabelo,
      legadoRabo ? 'rabo' : cabeloPadrao(sexo),
    ),
    corCabelo: escolher(PATROL_AVATAR_CORES_CABELO, bruto.corCabelo, DEFAULT_PATROL_AVATAR.corCabelo),
    estilo: legadoRabo
      ? DEFAULT_PATROL_AVATAR.estilo
      : escolher(PATROL_AVATAR_STYLES, bruto.estilo, DEFAULT_PATROL_AVATAR.estilo),
    acessorio: escolher(PATROL_AVATAR_ACCESSORIES, bruto.acessorio, DEFAULT_PATROL_AVATAR.acessorio),
    veiculo: escolher(PATROL_AVATAR_VEHICLES, bruto.veiculo, DEFAULT_PATROL_AVATAR.veiculo),
  };
};

/**
 * Aparência usada pela experiência atual da patrulha.
 *
 * A personalização completa pode voltar depois, então não migramos nem
 * apagamos as escolhas antigas do storage. A tela e o mapa apenas projetam a
 * configuração salva para o uniforme urbano enquanto a escolha disponível é
 * binária (masculino/feminino).
 */
export const toPatrolUrbanAvatar = (valor) => ({
  ...normalizePatrolAvatar(valor),
  estilo: 'urbano',
});

export const getPatrolAvatarColor = (id) => buscar(PATROL_AVATAR_COLORS, id);
export const getPatrolAvatarSexo = (id) =>
  PATROL_AVATAR_SEXOS.find((item) => item.id === id) ||
  PATROL_AVATAR_SEXOS.find((item) => item.id === DEFAULT_PATROL_AVATAR.sexo);
export const getPatrolAvatarTomPele = (id) =>
  PATROL_AVATAR_TONS_PELE.find((item) => item.id === id) ||
  PATROL_AVATAR_TONS_PELE.find((item) => item.id === DEFAULT_PATROL_AVATAR.tomPele);
export const getPatrolAvatarCabelo = (id) =>
  PATROL_AVATAR_CABELOS.find((item) => item.id === id) ||
  PATROL_AVATAR_CABELOS.find((item) => item.id === DEFAULT_PATROL_AVATAR.cabelo);
export const getPatrolAvatarCorCabelo = (id) =>
  PATROL_AVATAR_CORES_CABELO.find((item) => item.id === id) ||
  PATROL_AVATAR_CORES_CABELO.find((item) => item.id === DEFAULT_PATROL_AVATAR.corCabelo);
export const getPatrolAvatarStyle = (id) => buscar(PATROL_AVATAR_STYLES, id);
export const getPatrolAvatarAccessory = (id) => buscar(PATROL_AVATAR_ACCESSORIES, id);
export const getPatrolAvatarVehicle = (id) => buscar(PATROL_AVATAR_VEHICLES, id);

/**
 * Regras de desbloqueio ficam no catálogo, perto da aparência que governam.
 * Um nível inválido equivale ao nível inicial; nunca pode abrir uma recompensa
 * por acidente. O id desconhecido, por sua vez, não representa estilo algum.
 */
export const isPatrolAvatarStyleUnlocked = (id, nivel) => {
  const estiloId = typeof id === 'string' ? id.trim().toLowerCase() : '';
  const estilo = PATROL_AVATAR_STYLES.find((item) => item.id === estiloId);
  if (!estilo) return false;

  const numero = Number(nivel);
  const nivelSeguro = Number.isFinite(numero) && numero >= 1
    ? Math.floor(numero)
    : 1;
  return nivelSeguro >= estilo.nivelMinimo;
};

export const readStoredPatrolAvatar = (storage) => {
  try {
    return normalizePatrolAvatar(JSON.parse(storage?.getItem?.(PATROL_AVATAR_STORAGE_KEY)));
  } catch {
    // Storage bloqueado, JSON quebrado, versão antiga do formato — em todos os
    // casos o boneco padrão é melhor do que uma tela sem avatar.
    return { ...DEFAULT_PATROL_AVATAR };
  }
};

/**
 * O sexo que o PERFIL já conhece.
 *
 * POR QUE O PERFIL É O PONTO DE PARTIDA
 *
 * A pessoa já montou um avatar no cadastro. Abrir a patrulha e encontrar um
 * boneco de outro sexo é a única leitura possível de "o app não me conhece" —
 * e obriga uma escolha que ela já fez uma vez. O perfil guarda a configuração
 * do `react-nice-avatar`, e `sex` ali é `man` ou `woman`.
 *
 * ELE NUNCA SOBRESCREVE UMA ESCOLHA DA PATRULHA
 *
 * É ponto de partida, não autoridade: quem trocou o boneco na folha de escolha
 * decidiu depois, e sobre um assunto mais específico. Ver
 * `patrolAvatarComPerfil`.
 */
export const patrolAvatarSexoDoPerfil = (perfil) => {
  const bruto = perfil?.avatar_config;
  if (!bruto) return null;

  let config = bruto;
  if (typeof bruto === 'string') {
    // O Supabase devolve `jsonb` já desserializado, mas cadastros antigos
    // gravaram texto. Um JSON quebrado aqui não pode impedir a patrulha.
    try { config = JSON.parse(bruto); } catch { return null; }
  }

  const sexo = typeof config?.sex === 'string' ? config.sex.trim().toLowerCase() : '';
  if (sexo === 'woman') return 'feminino';
  if (sexo === 'man') return 'masculino';
  return null;
};

/**
 * A aparência da patrulha, considerando o que o perfil sabe.
 *
 * `salvo` é a configuração CRUA do storage — não normalizada. A diferença
 * importa: `normalizePatrolAvatar` preenche sexo com o padrão, e depois disso
 * é impossível distinguir "escolheu masculino" de "nunca escolheu". Só com o
 * valor cru dá para saber que o perfil ainda pode falar.
 */
export const patrolAvatarComSexoPadrao = (salvo, sexoPadrao) => {
  const base = toPatrolUrbanAvatar(salvo);
  const jaEscolheu = salvo && typeof salvo === 'object' && typeof salvo.sexo === 'string';
  if (jaEscolheu || !sexoPadrao) return base;
  return { ...base, sexo: sexoPadrao };
};

export const patrolAvatarComPerfil = (salvo, perfil) =>
  patrolAvatarComSexoPadrao(salvo, patrolAvatarSexoDoPerfil(perfil));

/** A configuração crua do storage, sem normalizar. Ver `patrolAvatarComPerfil`. */
export const readRawPatrolAvatar = (storage) => {
  try {
    const bruto = JSON.parse(storage?.getItem?.(PATROL_AVATAR_STORAGE_KEY));
    return bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : null;
  } catch {
    return null;
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
  const {
    cor, corSecundaria, sexo, tomPele, cabelo, corCabelo, estilo, acessorio, veiculo,
  } = normalizePatrolAvatar(avatar);
  // Dentro do carro a pessoa não aparece. Ignorar escolhas invisíveis aumenta o
  // reaproveitamento do ícone; a pé elas precisam invalidar o cache do Leaflet.
  const traje = modo === 'driving'
    ? veiculo
    : `${sexo}-${tomPele}-${cabelo}-${corCabelo}-${estilo}-${acessorio}`;
  return `${modo}|${cor}|${corSecundaria}|${traje}|${emMovimento ? 'm' : 'p'}|${gpsAtivo ? 'g' : 'x'}`;
};
