// A OSSATURA DO AVATAR: onde cada peça vive dentro do quadro.
//
// POR QUE UM ARQUIVO SÓ DE NÚMEROS
//
// O boneco é montado por oito peças que moram em arquivos diferentes. Elas não
// se conhecem, mas precisam encaixar: o pescoço tem que nascer dentro da gola,
// a alça da mochila tem que sair do ombro, o tênis tem que começar onde a
// canela termina. Enquanto cada peça carregava as próprias medidas, mexer na
// altura do ombro pedia a mesma edição em quatro lugares — e no dia em que um
// ficasse para trás o braço saía flutuando.
//
// O QUADRO É 256x320, E ISSO NÃO É UM DETALHE
//
// O desenho anterior vivia em 40x48: um espaço tão apertado que meio ponto era
// um pixel inteiro na tela, e curva orgânica ali não cabia — só cápsulas e
// retângulos. Em 256 unidades de largura há resolução para paths com
// afunilamento, sombra interna e brilho sem que nada colapse no arredondamento.
//
// A PROPORÇÃO É CHIBI, E ELA É A DECISÃO CENTRAL
//
// A figura tem pouco menos de três cabeças de altura. Isso não é estilo: é
// legibilidade. O marcador aparece entre 40px e 100px no mapa, e a esta escala
// um boneco realista de sete cabeças entrega um rosto de dois pixels — ou seja,
// nenhum. Com a cabeça ocupando mais de um terço do corpo, o rosto sobrevive a
// 48x60px, e é o rosto que faz o olho ler "pessoa" em vez de "ícone".
//
// Pela mesma razão mãos e tênis são grandes: são as pontas do movimento, e são
// elas que dizem "caminhando" antes de qualquer detalhe ser distinguível.
//
// OS PÉS FICAM NA LINHA 304, E O CSS SABE DISSO
//
// `.patrol-avatar-planted` ancora o boneco pelos pés (304/320 = 95% da altura)
// e a largura acompanha 256/320 = 0.8 da altura. Mexer no quadro aqui pede
// mexer lá — o teste do quadro existe para lembrar.

export const QUADRO = { largura: 256, altura: 320, chao: 304 };

export const MEIO = 128;

/* --- Cabeça --- */
// O crânio é largo em cima e afunila num queixo arredondado. Elipse pura lia
// como bola; o afunilamento é o que dá orientação à cabeça de longe.
export const CRANEO = {
  cx: MEIO, cy: 74, rx: 55, ry: 57,
  topo: 16, queixo: 130,
};

// AS FEIÇÕES FICAM BAIXAS DE PROPÓSITO
//
// Olhos em 88 num crânio que vai de 16 a 130 deixam mais da metade de testa.
// É o que separa "criança/chibi" de "adulto em miniatura", e é também o que
// deixa espaço para o cabelo existir como forma própria em vez de uma borda.
export const ROSTO = {
  olhoY: 88, olhoDx: 27, olhoRx: 12, olhoRy: 14,
  sobrancelhaY: 65,
  narizY: 103,
  bocaY: 114,
  ruborY: 106, ruborDx: 35,
  franjaY: 56,
};

export const ORELHA = { dx: 55, cy: 88, rx: 11, ry: 15 };

// O pescoço entra por baixo da gola e por cima do tronco: começa acima do
// queixo para não haver emenda visível se a cabeça balançar.
export const PESCOCO = { x: 110, largura: 36, topo: 104, base: 152 };

/* --- Tronco --- */
// Duas silhuetas, os mesmos nomes de medida. Quem desenha não pergunta o sexo:
// pede a tabela e usa os números.
export const TORSO = {
  masculino: {
    ombroY: 146, ombroX: 45,
    cinturaY: 204, cinturaX: 38,
    quadrilY: 230, quadrilX: 42,
    golaY: 152,
  },
  feminino: {
    ombroY: 148, ombroX: 39,
    cinturaY: 200, cinturaX: 30,
    quadrilY: 232, quadrilX: 41,
    golaY: 154,
  },
};

/* --- Braços --- */
// O braço afunila do deltoide ao punho e termina numa mão grande e fechada.
// A mão é redonda de propósito: dedo nenhum sobrevive a 48px, e o círculo lê
// como "mão" enquanto cinco tiras leem como sujeira.
export const BRACO = {
  dx: 51,
  topo: 150, ombroR: 18,
  cotoveloY: 198, cotoveloR: 14,
  punhoY: 236, punhoR: 11,
  maoY: 250, maoR: 17,
  bainhaCurta: 200, bainhaLonga: 234,
};

/* --- Pernas --- */
export const PERNA = {
  dx: 23,
  quadrilY: 220, coxaR: 23,
  joelhoY: 256, joelhoR: 17,
  tornozeloY: 278, tornozeloR: 14,
};

/* --- Calçado --- */
// Grande e de sola clara. A 48px o rosto é uma mancha e a mochila é um bloco;
// o que o olho pega primeiro são duas faixas claras alternando embaixo — e é
// isso que lê como caminhada antes de qualquer outra coisa.
export const CALCADO = { topo: 268, base: QUADRO.chao, meiaLargura: 32 };

/* --- Mochila --- */
// Um pouco mais larga que o tronco: se coubesse dentro dele, de frente a
// mochila sumiria e "com mochila" seria igual a "sem mochila".
export const MOCHILA = { x: 76, largura: 104, topo: 150, base: 246 };

/* --- Saia --- */
export const SAIA = { topo: 222, base: 268, topoX: 44, baseX: 66 };
