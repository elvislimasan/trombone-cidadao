import { forwardRef } from 'react';
import { STORY_WIDTH, STORY_HEIGHT } from '@/hooks/useStoryExport';

// Card 1080×1920 da patrulha concluída.
//
// TUDO EM ESTILO INLINE, DE PROPÓSITO
//
// O html-to-image rasteriza o nó lendo o estilo COMPUTADO de cada elemento.
// Classes do Tailwind funcionam, mas dependem de a folha de estilo já ter sido
// aplicada no momento da leitura — e como este nó vive fora da tela, é o tipo
// de dependência que falha em silêncio e produz um card sem cor.
//
// Pela mesma razão nada aqui usa token de tema: o card não é interface, é
// artefato. Vai para o story de alguém e precisa ser o mesmo no claro e no
// escuro — a marca do Trombone é vermelha nos dois.
//
// OS ÍCONES SÃO SVG ESCRITO À MÃO
//
// Nenhuma fonte de ícone precisa estar carregada no instante da rasterização, e
// nenhuma requisição precisa ter voltado. É a diferença entre um card com
// ícones e um card com quadrados vazios.
//
// O FUNDO VEM DO BUCKET, JÁ CONVERTIDO
//
// `bg-patrulha.png` mora em `card-instagram`, ao lado dos fundos de bronca, e
// chega aqui como data URI (ver storyAssets.js). Passar a URL crua sujaria o
// canvas e derrubaria a exportação inteira — foi o que já custou o "erro ao
// baixar" do card de bronca. Sem o fundo, o degradê abaixo assume: o card sai
// mais simples, mas sai.
//
// ORNAMENTOS DESENHADOS AQUI
//
// As faixas diagonais do canto, a malha de pontos, os riscos de comemoração ao
// lado do título e os alfinetes da chamada são código, não imagem. Se algum
// deles JÁ existir dentro de `bg-patrulha.png`, vai aparecer duas vezes — é só
// apagar o bloco correspondente, cada um está isolado e comentado.

const VERMELHO = '#dc2626';
const VERMELHO_VIVO = '#ef4444';
const AMARELO = '#fbbf24';
const VERDE = '#4ade80';
const CREME = '#fde8e8';
const PRETO = '#120404';

/**
 * Número e unidade separados.
 *
 * "24min" com tudo do mesmo tamanho faz a unidade competir com o número, e é o
 * número que a pessoa lê de relance. A unidade desce para 0,45 do corpo e vira
 * legenda colada.
 */
const formatarDuracao = (segundos) => {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return { valor: String(s), unidade: 's' };
  const min = Math.floor(s / 60);
  if (min < 60) return { valor: String(min), unidade: 'min' };
  return { valor: `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`, unidade: '' };
};

const formatarDistancia = (metros) => {
  const m = Math.max(0, Math.round(metros || 0));
  if (m < 1000) return { valor: String(m), unidade: 'm' };
  return { valor: (m / 1000).toFixed(1).replace('.', ','), unidade: 'km' };
};

// ── Ícones ────────────────────────────────────────────────────────────────────

const TRACOS = {
  relogio: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.2 2',
  rota: 'M6.5 20a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM15 6.5H9.8A3.3 3.3 0 006.5 9.8a3.3 3.3 0 003.3 3.3h4.4a3.3 3.3 0 013.3 3.3 3.3 3.3 0 01-3.3 3.4H9',
  pessoas:
    'M16.5 20v-1.8a3.6 3.6 0 00-3.6-3.6H6.6A3.6 3.6 0 003 18.2V20M9.7 11.1a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zM21 20v-1.8a3.6 3.6 0 00-2.7-3.5M15.6 4.1a3.6 3.6 0 010 7',
  confirmado: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8.4 12.2l2.5 2.5 4.7-5',
  documento:
    'M14 3H7.5A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7l-4-4zM14 3v4h4M9.5 13h5M9.5 17h5',
  sino: 'M18 8.6a6 6 0 10-12 0c0 6-2.4 7.4-2.4 7.4h16.8S18 14.6 18 8.6zM13.7 20a2 2 0 01-3.4 0',
  bandeira: 'M5 21V4M5 4h10.5l-1.6 3.6L15.5 11H5',
};

const Icone = ({ d, tamanho = 40, cor = AMARELO }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
    <path d={d} stroke={cor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Alfinete de mapa cheio, usado na etiqueta de local e na chamada. */
const Alfinete = ({ tamanho = 26, cor = VERMELHO_VIVO, brilho = false }) => (
  <svg width={tamanho} height={tamanho * 1.16} viewBox="0 0 24 28" fill="none" style={{ display: 'block' }}>
    {brilho && <ellipse cx="12" cy="25.5" rx="7" ry="2.2" fill="rgba(239,68,68,0.28)" />}
    <path
      d="M12 23.5s8.4-7.2 8.4-13.4A8.4 8.4 0 103.6 10.1c0 6.2 8.4 13.4 8.4 13.4z"
      fill={cor}
      stroke="rgba(255,255,255,0.25)"
      strokeWidth="0.8"
    />
    <circle cx="12" cy="10" r="3.1" fill="#ffffff" />
  </svg>
);

// ── Peças ─────────────────────────────────────────────────────────────────────

const Numero = ({ traco, valor, unidade, rotulo, cor }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
    <Icone d={traco} tamanho={44} cor={cor} />
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span
        style={{
          fontSize: 64,
          fontWeight: 900,
          lineHeight: 1,
          color: '#ffffff',
          letterSpacing: '-0.04em',
        }}
      >
        {valor}
      </span>
      {unidade && (
        <span style={{ fontSize: 29, fontWeight: 800, lineHeight: 1, color: '#ffffff' }}>
          {unidade}
        </span>
      )}
    </div>
    <div
      style={{
        fontSize: 21,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)',
      }}
    >
      {rotulo}
    </div>
  </div>
);

const Conquista = ({ traco, cor, valor, titulo, legenda }) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      background: 'rgba(0,0,0,0.45)',
      border: `2px solid ${cor}55`,
      borderRadius: 26,
      padding: '24px 22px',
    }}
  >
    <div
      style={{
        width: 74,
        height: 74,
        borderRadius: '50%',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.5)',
        border: `2px solid ${cor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icone d={traco} tamanho={38} cor={cor} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 50, fontWeight: 900, lineHeight: 1, color: '#ffffff' }}>
          {valor}
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 900,
            lineHeight: 1.12,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#ffffff',
            whiteSpace: 'pre-line',
          }}
        >
          {titulo}
        </span>
      </div>
      <div
        style={{
          fontSize: 21,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.58)',
          marginTop: 8,
        }}
      >
        {legenda}
      </div>
    </div>
  </div>
);

// ── Card ──────────────────────────────────────────────────────────────────────

const PatrolStoryCard = forwardRef(function PatrolStoryCard(
  { contagens, duracaoS, distanciaM, nivel, titulo, lugar, feitos, fundoUrl, logoUrl },
  ref
) {
  // Missão cumprida também produz bronca: as duas contam junto, senão o card
  // diria "0 broncas" para quem acabou de registrar uma.
  const broncas = (feitos?.broncas ?? 0) + (feitos?.missoes ?? 0);
  const sinais = feitos?.sinais ?? 0;

  const tempo = formatarDuracao(duracaoS);
  const distancia = formatarDistancia(distanciaM);

  return (
    <div
      ref={ref}
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // Degradê de reserva: é o que se vê caso o fundo do bucket não carregue.
        background: `radial-gradient(115% 65% at 50% 4%, #7f1d1d 0%, #4a0d0d 45%, ${PRETO} 100%)`,
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        color: '#ffffff',
        padding: '64px 56px 56px',
        boxSizing: 'border-box',
      }}
    >
      {fundoUrl && (
        <img
          src={fundoUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* Escurecimento sobre o fundo: garante contraste do texto qualquer que
          seja a arte, sem depender de ela ter sido desenhada escura. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(18,4,4,0.40) 0%, rgba(18,4,4,0.12) 28%, rgba(18,4,4,0.68) 100%)',
        }}
      />

      {/* ORNAMENTO — faixas diagonais do canto superior esquerdo. */}
      <div
        style={{
          position: 'absolute',
          top: -60,
          left: -70,
          width: 330,
          height: 210,
          transform: 'rotate(-32deg)',
          background: `repeating-linear-gradient(90deg, ${VERMELHO} 0 7px, transparent 7px 30px)`,
          opacity: 0.75,
        }}
      />

      {/* ORNAMENTO — malha de pontos do canto superior direito. */}
      <div
        style={{
          position: 'absolute',
          top: 62,
          right: 56,
          width: 176,
          height: 104,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.20) 3px, transparent 3px)',
          backgroundSize: '26px 26px',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* ── Marca ── */}
        <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 18 }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{ width: 86, height: 86, objectFit: 'contain', display: 'block' }}
            />
          )}
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 37, fontWeight: 900, lineHeight: 1, color: '#ffffff' }}>
              TROMBONE
            </div>
            <div style={{ fontSize: 37, fontWeight: 900, lineHeight: 1.1, color: AMARELO }}>
              CIDADÃO
            </div>
          </div>
        </div>

        {/* ── Título ── */}
        <div style={{ position: 'relative', marginTop: 92, width: '100%' }}>
          {/* ORNAMENTO — riscos de comemoração, um par de cada lado. */}
          <svg
            width="92"
            height="112"
            viewBox="0 0 24 28"
            style={{ position: 'absolute', top: -22, left: 26 }}
          >
            <path
              d="M3 16 L3 8 M9.5 6 L6.5 12.5 M15 3.5 L14 10"
              stroke={AMARELO}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          <svg
            width="92"
            height="112"
            viewBox="0 0 24 28"
            style={{ position: 'absolute', top: -22, right: 26 }}
          >
            <path
              d="M21 16 L21 8 M14.5 6 L17.5 12.5 M9 3.5 L10 10"
              stroke={AMARELO}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>

          <div
            style={{
              fontSize: 118,
              fontWeight: 900,
              lineHeight: 0.95,
              textAlign: 'center',
              letterSpacing: '-0.04em',
              textShadow: '0 8px 26px rgba(0,0,0,0.55)',
            }}
          >
            PATRULHA
            <br />
            <span style={{ color: AMARELO }}>CONCLUÍDA!</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 31,
            fontWeight: 600,
            lineHeight: 1.3,
            textAlign: 'center',
            color: CREME,
            maxWidth: 700,
          }}
        >
          Mais um trecho da cidade
          <br />
          fiscalizado por quem mora nela.
        </div>

        {/* O bairro entra como etiqueta, não dentro da frase: "Mais um trecho de
            Vila Nova" exigiria acertar preposição e gênero para cada nome de
            bairro do Brasil, e errar isso num card que vai para o story alheio
            é o tipo de detalhe que ninguém perdoa. */}
        {lugar && (
          <div
            style={{
              marginTop: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 30px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.6)',
              border: '2px solid rgba(255,255,255,0.14)',
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            <Alfinete tamanho={22} />
            {lugar}
          </div>
        )}

        {/* ── Números do trajeto ── */}
        <div
          style={{
            marginTop: 34,
            width: '100%',
            display: 'flex',
            background: 'rgba(0,0,0,0.5)',
            border: `2px solid ${VERMELHO}44`,
            borderRadius: 30,
            padding: '32px 10px',
          }}
        >
          <Numero
            traco={TRACOS.relogio}
            cor={VERMELHO_VIVO}
            valor={tempo.valor}
            unidade={tempo.unidade}
            rotulo="Tempo"
          />
          <Numero
            traco={TRACOS.rota}
            cor={AMARELO}
            valor={distancia.valor}
            unidade={distancia.unidade}
            rotulo="Percorrido"
          />
          <Numero
            traco={TRACOS.pessoas}
            cor={VERDE}
            valor={contagens?.passadas ?? 0}
            rotulo="Passou por"
          />
          <Numero
            traco={TRACOS.confirmado}
            cor={AMARELO}
            valor={contagens?.confirmadas ?? 0}
            rotulo="Confirmou"
          />
        </div>

        {/* ── O que ficou registrado ── */}
        <div style={{ marginTop: 18, width: '100%', display: 'flex', gap: 18 }}>
          <Conquista
            traco={TRACOS.documento}
            cor={VERMELHO_VIVO}
            valor={broncas}
            titulo={broncas === 1 ? 'Bronca\nregistrada' : 'Broncas\nregistradas'}
            legenda="Sua voz vira ação!"
          />
          <Conquista
            traco={TRACOS.sino}
            cor={AMARELO}
            valor={sinais}
            titulo={sinais === 1 ? 'Sinalização\nfeita' : 'Sinalizações\nfeitas'}
            legenda="A comunidade atende!"
          />
        </div>

        {/* A sobra vertical fica AQUI, antes do título — não depois.

            Com o espaçador embaixo, a faixa subia colada nos cartões de
            registro e virava mais uma linha da mesma tabela. Empurrá-la com
            margem fixa resolveria nesta combinação de dados e falharia na
            próxima: o excedente muda conforme o título é longo, o bairro some
            ou o nível não existe.

            Do jeito certo, a faixa desce sempre até o pé do bloco, e a folga
            que sobra vai toda para cima dela. O `minHeight` é só o piso: sem
            ele, um card muito cheio deixaria a faixa encostar nos cartões. */}
        <div style={{ flex: 1, minHeight: 46 }} />

        {/* Título de bairro: é a conquista que muda de mão. A medalha, uma vez
            conquistada, é sua para sempre; o título é da janela de 90 dias, e
            alguém pode tomá-lo na semana que vem. */}
        {titulo && (
          <div
            style={{
              marginBottom: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '16px 36px 16px 18px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              border: `2px solid ${AMARELO}`,
            }}
          >
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 18,
                background: VERMELHO,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icone d={TRACOS.bandeira} tamanho={32} cor="#ffffff" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 31, fontWeight: 900, color: '#ffffff', lineHeight: 1.1 }}>
                {titulo.titulo}
              </div>
              {nivel?.label && (
                <div style={{ fontSize: 23, fontWeight: 700, marginTop: 6 }}>
                  {/* Só o nível em amarelo: destacar a frase inteira faria o
                      rótulo competir com o título logo acima. */}
                  <span style={{ color: AMARELO }}>Nível {nivel.level}</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}> · {nivel.label}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Chamada ──
            Sem moldura: é o fecho da peça, e uma caixa a mais aqui só somaria
            uma borda depois de três. Os alfinetes e a trilha tracejada fazem o
            papel do quadro, e dizem visualmente do que o card trata. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            padding: '30px 150px 26px',
            boxSizing: 'border-box',
            textAlign: 'center',
          }}
        >
          {/* ORNAMENTO — trilha entre os dois alfinetes. */}
          <svg
            width="100%"
            height="150"
            viewBox="0 0 900 150"
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: 22, left: 0, right: 0 }}
          >
            <path
              d="M78 44 C 210 128, 690 128, 822 44"
              stroke={VERMELHO_VIVO}
              strokeWidth="4"
              strokeDasharray="14 16"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          </svg>

          <div style={{ position: 'absolute', top: 4, left: 34 }}>
            <Alfinete tamanho={72} brilho />
          </div>
          <div style={{ position: 'absolute', top: 4, right: 34 }}>
            <Alfinete tamanho={72} brilho />
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.2, color: '#ffffff' }}>
              Você fiscalizou.
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.2, color: AMARELO }}>
              A cidade agradece.
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1.35,
                color: 'rgba(255,255,255,0.62)',
              }}
            >
              Pequenas ações fazem
              <br />
              uma grande diferença.
            </div>
          </div>
        </div>

        {/* ── Assinatura ── */}
        <div
          style={{
            marginTop: 26,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 22,
          }}
        >
          <div style={{ flex: 1, height: 3, background: VERMELHO }} />
          <div style={{ fontSize: 27, fontWeight: 900 }}>
            #NossaCidade<span style={{ color: VERMELHO_VIVO }}>MaisSegura</span>
          </div>
          <div style={{ flex: 1, height: 3, background: VERMELHO }} />
        </div>
      </div>
    </div>
  );
});

export default PatrolStoryCard;
