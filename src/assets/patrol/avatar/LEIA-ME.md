# Renders do avatar da patrulha

Especificação dos arquivos que substituem o desenho vetorial do boneco no mapa.
Enquanto uma peça não tiver arquivo aqui, `src/components/patrol/avatar/` desenha
aquela configuração inteira em SVG. Nunca fica meio raster, meio vetor.

---

## O que o navegador faz com estes arquivos

**As peças coloríveis são renderizadas em BRANCO.** A cor entra depois, no CSS:
uma camada da cor escolhida recortada pelo alfa da imagem, e a imagem por cima
em `mix-blend-mode: multiply`. Branco × cor devolve a cor; cinza × cor devolve a
cor na sombra.

É isso que faz 52 arquivos cobrirem **1.008.420** aparências. Renderizar uma
imagem por combinação é impossível; renderizar por estilo custaria 10 arquivos e
mataria cor da roupa, cor de apoio, tom de pele e cor de cabelo.

Consequência direta: **não pinte a camisa de vermelho no render.** Pinte de
branco e deixe a luz fazer o cinza.

---

## Canvas e âncora

| | |
|---|---|
| Canvas do master | **1024 × 1280** px (proporção 0,8) |
| Canvas publicado | **384 × 480** px (o script converte) |
| Linha dos pés | **y = 1216** (95% da altura) |
| Centro horizontal | **x = 512** |
| Topo da cabeça | ~y = 64 |
| Fundo | transparente (alfa real, sem matte branco) |

A proporção 0,8 e a linha de 95% **não são escolha estética**: são o mesmo quadro
do SVG (`viewBox 256×320`, `chao: 304`). O CSS ancora o marcador por elas
(`.patrol-avatar-planted`). Se o canvas vier em 2:3, a imagem encaixota e os pés
saem do lugar — e a troca para o fallback vetorial fica visível.

---

## A cena precisa ser UMA só

Todas as camadas de uma mesma câmera têm que sair da **mesma cena, mesma câmera,
mesma pose, mesma luz** — mostrando e escondendo peças entre um render e outro.
É o único jeito de a calça encaixar no corpo e o cabelo encaixar na cabeça.

Na prática isso quer dizer um pipeline 3D (Blender, Character Creator, VRoid), e
**não** geração por prompt: dois prompts nunca devolvem a mesma pessoa na mesma
posição, e a pilha sai desalinhada.

- **Câmera**: ortográfica, ou perspectiva longa (≥ 85 mm) na altura do meio do
  personagem. Frente e costas são a mesma câmera girada 180° em torno do
  personagem — não mova a câmera de altura entre as duas.
- **Pose**: parada, simétrica, braços levemente afastados do corpo. A **mesma**
  em todos os arquivos.
- **Luz**: chave suave em cima e à esquerda (~35°), preenchimento fraco à
  direita. Sem luz de contorno vinda de trás — ela cria uma franja clara que o
  `multiply` transforma em sujeira.
- **Sombra no chão**: **não** renderize. O CSS desenha a sombra de contato e o
  anel de GPS, e eles precisam continuar dinâmicos.

---

## Nomes dos arquivos

O caminho relativo a esta pasta, sem extensão, **é** a chave que o código
procura. Nome fora do padrão não quebra nada — a peça só continua vetorial.

```
<pasta>/<id>-<camera>.webp
```

`<camera>` é `frente` ou `costas`. Os `<id>` saem dos catálogos de
`src/lib/patrolAvatarConfig.js`.

| Pasta | ids | Tingido com | Obrigatório |
|---|---|---|---|
| `corpo/` | `masculino`, `feminino` | tom de pele | sim |
| `calca/` | `classico`, `tatico`, `urbano`, `night`, `camuflado` | cor de apoio | sim |
| `roupa/` | `classico`, `tatico`, `urbano`, `night`, `camuflado` | cor primária | sim |
| `cabelo/` | `curto`, `medio`, `longo`, `rabo`, `coque`, `crespo`, `raspado` | cor do cabelo | sim |
| `acessorio/` | `mochila`, `tatica`, `garrafa`, `radio`, `oculos`, `fone` | — (cor final no render) | não |

`acessorio/nenhuma` não existe: "sem mochila" é a ausência de arquivo.

### A fatia de trás do acessório

```
acessorio/<id>-frente-atras.webp
```

Opcional, e só faz sentido na câmera frontal. É o que fica **atrás** do corpo:
o volume da mochila escapando pelos lados do tronco. Sem ela, escolher "com
mochila" e olhar de frente devolve o mesmo boneco de "sem mochila", porque de
frente só as alças aparecem.

### Ordem de empilhamento

De trás para a frente, decidida em `renderizacoes.js`:

```
acessorio-atras → corpo → calca → roupa → acessorio → cabelo
```

Cada camada precisa estar **corretamente ocluída** pela cena: a camisa é
renderizada já vestida no corpo (com as dobras que o corpo causa), não como uma
camisa flutuando.

---

## Animação da figura fechada (spritesheet)

Uma figura fechada ganha movimento com uma faixa horizontal de quatro quadros,
no formato clássico dos jogos 2D:

```
figura/<sexo>-<estilo>-<camera>-<estado>-4x1.webp
```

`<estado>` é `walk` ou `idle`. Exemplo: `figura/masculino-urbano-costas-walk-4x1.webp`.

- Canvas: **1536 × 480** px — quatro células de **384 × 480**, da esquerda para
  a direita.
- Cada célula respeita a mesma linha de pés (95%) e o mesmo tamanho de
  personagem das figuras paradas. É isso que impede o boneco de pular de
  tamanho ao começar a andar.
- O ritmo sai do código, não do arquivo: `walk` roda em 960 ms e `idle` em
  6,4 s (ver `DURACAO_DA_ANIMACAO` em `renderizacoes.js`).

A figura estática continua necessária: ela responde pelos estados que não têm
atlas. Hoje `idle` não tem nenhum, e quem dá vida ao boneco parado é a
respiração em CSS — ver adiante.

### Por que não há atlas de repouso

Um ciclo de "parado" são quatro quadros que diferem em milímetros. As folhas de
pose disponíveis trazem **gestos inteiros** — mão na cabeça, sinal de positivo,
braços cruzados. Encadeados como ciclo, o boneco trocaria de pose sozinho no
meio da rua, o que lê como falha e não como repouso.

Enquanto um ciclo de respiração de verdade não existir, `patrol-avatar-render-idle`
(no `index.css`) faz o corpo inflar e desinflar a partir dos pés. Publicar
`figura/<sexo>-<estilo>-<camera>-idle-4x1.webp` desliga a respiração de CSS
automaticamente e passa a mandar.

---

## As folhas de origem e o fatiador

Os `.png` desta pasta são as folhas de contato que vieram do gerador — 16 poses
numa grade 8×2 (linha 1 frente, linha 2 costas), ou um ciclo de caminhada numa
tira. Eles **não entram no bundle**: o glob de `carregarRenders.js` só varre
`.webp`. Ficam versionados de propósito, porque sem eles ninguém consegue
refatiar.

```bash
node scripts/patrol-avatar-sprites.mjs --diagnostico   # mostra as caixas, nao escreve
node scripts/patrol-avatar-sprites.mjs                 # publica os .webp
```

O fatiador resolve o que o gerador não entrega: acha o conteúdo real pelo alfa,
escala para a altura de referência e pousa cada figura centrada, com os pés na
linha de 95%. Num ciclo, escala e linha do chão são compartilhadas por todos os
quadros — é o que preserva o balanço — mas **o centro horizontal é por quadro**,
porque a variação de x nessas folhas é onde o gerador desenhou a pose, e não
movimento: compartilhá-la fazia o boneco derivar para o lado ao caminhar.

---

## Contagem

| Pasta | Arquivos |
|---|---|
| `corpo/` | 2 sexos × 2 câmeras = 4 |
| `calca/` | 5 estilos × 2 câmeras = 10 |
| `roupa/` | 5 estilos × 2 câmeras = 10 |
| `cabelo/` | 7 cortes × 2 câmeras = 14 |
| `acessorio/` | 6 peças × 2 câmeras = 12 |
| `acessorio/` (fatia de trás) | 6 peças × 1 câmera = 6 |
| **Total** | **56** |

O caminho raster só liga quando `corpo`, `calca`, `roupa` e `cabelo` existem
para aquela configuração e aquela câmera. Ou seja: dá para começar por
`corpo/feminino-*`, `calca/urbano-*`, `roupa/urbano-*` e `cabelo/rabo-*` — 8
arquivos — e ver a primeira combinação virar 3D no mapa enquanto todo o resto
continua vetorial.

---

## Como publicar

Deixe os masters de 1024×1280 fora do bundle (por exemplo em
`renders-master/`, ignorado pelo git) e rode:

```bash
npm run avatar:renders            # converte masters -> 384x480 webp nesta pasta
npm run avatar:renders -- --conferir   # lista o que ainda falta
```

**Não commite os masters.** Um WebP de 1024×1280 decodifica para ~5 MB de
bitmap na RAM independentemente de aparecer com 58px na tela, e este app já
convive com OOM kill no Android (ver `CLAUDE.md`). Em 384×480 são ~740 KB por
camada decodificada, e o marcador nunca precisa de mais que seis.
