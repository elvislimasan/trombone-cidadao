import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { getCardInstagramPublicUrl } from '@/lib/cardInstagramAssets';
import { getReportShareUrl } from '@/lib/shareUtils';
import { useStoryExport } from '@/hooks/useStoryExport';
// A conversao para data URI saiu daqui quando o card da patrulha passou a ter
// fundo proprio no mesmo bucket: dois lugares convertendo imagem seriam dois
// lugares para redescobrir, no primeiro card que voltasse a falhar, que o
// problema era CORS.
import { toDataUri } from '@/lib/storyAssets';
import {
  Download,
  Instagram,
  MapPin,
  LayoutTemplate,
  Check,
  BadgeCheck,
  Clock3,
  Wrench,
  Send,
  X,
  Loader2,
} from 'lucide-react';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function StoryPreviewFrame({ children }) {
  const availableRef = useRef(null);
  const [scale, setScale] = useState(0.15);

  useEffect(() => {
    const element = availableRef.current;
    if (!element) return undefined;

    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.min(width / STORY_WIDTH, height / STORY_HEIGHT));
    };

    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(element);
    window.addEventListener('resize', fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <div ref={availableRef} className="absolute inset-2 sm:inset-4 lg:inset-2 flex items-center justify-center">
      <div
        className="relative shrink-0 overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.4)]"
        style={{ width: STORY_WIDTH * scale, height: STORY_HEIGHT * scale }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: STORY_WIDTH,
            height: STORY_HEIGHT,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.trombonecidadao.app&pcampaignid=web_share';

const normalizeText = (text = '') =>
  String(text || '').replace(/\s+/g, ' ').trim();

const clampText = (text = '', max = 90) => {
  const clean = normalizeText(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + '…';
};

const getDynamicFontSize = (text, baseSize = 68) => {
  if (!text) return baseSize;
  const length = text.length;
  if (length > 60) return Math.max(42, baseSize * 0.75);
  if (length > 40) return Math.max(54, baseSize * 0.8);
  if (length > 25) return Math.max(62, baseSize * 0.85);
  return baseSize;
};

const getSafeFilename = (title = '') =>
  clampText(title || 'bronca', 60)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');

const splitHeadline = (title = '', maxLineLength = 18, maxLines = 6) => {
  const clean = normalizeText(title);

  if (!clean) return ['A cidade precisa', 'olhar para isso'];

  const words = clean.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxLineLength) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

const baseTextShadow =
  '0 4px 14px rgba(0,0,0,0.38), 0 14px 34px rgba(0,0,0,0.24)';

// A LINHA DE LOCAL DO CARD
//
// Ela terminava em "BRASIL" quase sempre, e "BRASIL" não localiza nada: o card
// vai para o story de alguém que precisa saber DE ONDE é aquele poste apagado —
// é essa palavra que decide se o vizinho reconhece o problema ou passa reto.
//
// A causa era a ordem das fontes. A primeira, `report.city`, nunca existiu:
// `reports` guarda `city_id`, e não um texto de cidade — o `if` estava morto
// desde sempre. Sobrava a segunda, que ADIVINHA a cidade quebrando o endereço
// digitado em pedaços e torcendo para o penúltimo ser o município. Num endereço
// como "Rua X, em frente à antiga Construbem" não há penúltimo pedaço nenhum.
//
// Agora a primeira fonte é o cadastro: a cidade vem embutida da consulta, com o
// UF do estado. O palpite sobre o endereço continua atrás dela, para as broncas
// antigas que ficaram sem `city_id` — e "BRASIL" continua sendo o último
// recurso, porque um card sem lugar nenhum ainda é melhor que um card com o
// lugar errado.
const getCityFromAddress = (address = '', report = {}) => {
  const cadastrada = report.city?.name || (typeof report.city === 'string' ? report.city : '');
  if (cadastrada) {
    const uf =
      report.city?.states?.uf
      || report.city?.state?.uf
      || report.state
      || report.uf
      || '';
    return (uf ? `${cadastrada}-${uf}` : cadastrada).toUpperCase();
  }

  const clean = normalizeText(address);
  if (!clean) return 'BRASIL';

  const parts = clean.split(/[,-]/).map((p) => p.trim());

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];

    if (last.length === 2 && /^[A-Z]{2}$/i.test(last)) {
      return `${secondLast}-${last}`.toUpperCase();
    }

    if (secondLast.length === 2 && /^[A-Z]{2}$/i.test(secondLast)) {
      const thirdLast = parts[parts.length - 3];
      if (thirdLast) return `${thirdLast}-${secondLast}`.toUpperCase();
    }
  }

  return 'BRASIL';
};

const getNormalizedStatus = (status) => {
  const value = normalizeText(status).toLowerCase();

  if (['pendente', 'pending', 'aberta', 'open', 'aguardando'].includes(value)) {
    return 'pending';
  }

  if (
    [
      'em andamento',
      'andamento',
      'in_progress',
      'in-progress',
      'progress',
      'resolucao',
      'resolução',
    ].includes(value)
  ) {
    return 'in_progress';
  }

  if (
    ['resolvida', 'resolved', 'finalizada', 'concluida', 'concluída'].includes(
      value
    )
  ) {
    return 'resolved';
  }

  return 'pending';
};

const getStatusConfig = (status) => {
  const normalized = getNormalizedStatus(status);

  if (normalized === 'resolved') {
    return {
      key: 'resolved',
      label: 'BRONCA RESOLVIDA',
      icon: BadgeCheck,
      bgKey: 'resolved',
      tagBg: 'linear-gradient(180deg, #3d9a57 0%, #2f7d45 100%)',
      tagBorder: 'rgba(220,255,225,0.22)',
      tagText: '#ffffff',
      tagAccent: 'rgba(233,255,239,0.24)',
      tagShadow: '0 14px 28px rgba(0,0,0,0.22)',
    };
  }

  if (normalized === 'in_progress') {
    return {
      key: 'in_progress',
      label: 'BRONCA: EM ANDAMENTO',
      icon: Wrench,
      bgKey: 'in_progress',
      tagBg: 'linear-gradient(180deg, #3b6ea8 0%, #274f7a 100%)',
      tagBorder: 'rgba(215,232,255,0.20)',
      tagText: '#ffffff',
      tagAccent: 'rgba(220,235,255,0.20)',
      tagShadow: '0 14px 28px rgba(0,0,0,0.22)',
    };
  }

  return {
    key: 'pending',
    label: 'BRONCA PENDENTE',
    icon: Clock3,
    bgKey: 'pending',
    tagBg: 'linear-gradient(180deg, #cf7424 0%, #fdd10e 100%)',
    tagBorder: 'rgba(255,233,214,0.20)',
    tagText: '#000',
    tagAccent: 'rgba(255,237,220,0.18)',
    tagShadow: '0 14px 28px rgba(0,0,0,0.22)',
  };
};

function StatusTag({ statusConfig }) {
  const StatusIcon = statusConfig.icon;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        marginBottom: 36,
        boxShadow: statusConfig.tagShadow,
      }}
    >
      <div
        style={{
          width: 12,
          background: statusConfig.tagAccent,
          borderTopLeftRadius: 14,
          borderBottomLeftRadius: 14,
        }}
      />

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 16,
          padding: '18px 26px 18px 22px',
          background: statusConfig.tagBg,
          color: statusConfig.tagText,
          borderTopRightRadius: 14,
          borderBottomRightRadius: 14,
          border: `1px solid ${statusConfig.tagBorder}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.07,
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.72) 0.9px, transparent 0.9px)',
            backgroundSize: '12px 12px',
            mixBlendMode: 'soft-light',
            pointerEvents: 'none',
          }}
        />

        <StatusIcon
          size={34}
          style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}
        />

        <span
          style={{
            fontSize: 40,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            position: 'relative',
            zIndex: 1,
            textShadow: baseTextShadow,
          }}
        >
          {statusConfig.label}
        </span>
      </div>
    </div>
  );
}

// Cor solida por status, usada como piso quando a textura de fundo nao carrega.
// Sem isso o card cai para preto e perde a leitura de status.
const FALLBACK_BG_COLOR = {
  pending: '#8f2f10',
  in_progress: '#24405f',
  resolved: '#245536',
};

function resolveBgKey(bgType, reportStatus) {
  if (bgType === 'auto') return getStatusConfig(reportStatus).bgKey;
  return bgType;
}

const BG_FILE_BY_KEY = {
  pending: 'bg-pending-1.png',
  in_progress: 'bg-in-progress.png',
  resolved: 'bg-resolved.png',
};

function getStatusBackgroundStyle(bgType, customBgColor, reportStatus, bgDataUri) {
  if (bgType === 'color') {
    return {
      backgroundColor: customBgColor,
    };
  }

  const resolvedBgType = resolveBgKey(bgType, reportStatus);
  const backgroundColor = FALLBACK_BG_COLOR[resolvedBgType] || '#111111';

  // Sem o data URI pronto, renderiza a cor solida: um backgroundImage com URL
  // remota sujaria o canvas e faria o toPng falhar.
  if (!bgDataUri) {
    return { backgroundColor };
  }

  return {
    backgroundColor,
    backgroundImage: `url(${bgDataUri})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

function ReportImage({
  coverPhotoUrl,
  enableImageEffect = true,
  enableHoleEffect = false,
}) {
  if (!coverPhotoUrl) return null;

  if (enableHoleEffect) {
    return (
   
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '48%',
            filter: 'drop-shadow(0 14px 24px rgba(0,0,0,0.35))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '-18px',
              background:
                'radial-gradient(circle at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0) 100%)',
              filter: 'blur(10px)',
              clipPath:
                'polygon(5% 12%, 16% 5%, 34% 9%, 48% 3%, 68% 8%, 82% 4%, 95% 12%, 91% 31%, 98% 47%, 92% 64%, 96% 81%, 84% 94%, 66% 89%, 49% 97%, 29% 91%, 12% 95%, 4% 81%, 8% 62%, 2% 46%, 9% 27%)',
              zIndex: 1,
            }}
          />

          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              clipPath:
                'polygon(5% 12%, 16% 5%, 34% 9%, 48% 3%, 68% 8%, 82% 4%, 95% 12%, 91% 31%, 98% 47%, 92% 64%, 96% 81%, 84% 94%, 66% 89%, 49% 97%, 29% 91%, 12% 95%, 4% 81%, 8% 62%, 2% 46%, 9% 27%)',
              background: '#111',
              zIndex: 2,
            }}
          >
            <img
              src={coverPhotoUrl}
              alt="Report"
              crossOrigin="anonymous"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scale(1.12)',
                filter: 'brightness(1.02) contrast(1.08) saturate(1.04)',
              }}
            />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                boxShadow:
                  'inset 0 0 18px rgba(0,0,0,0.55), inset 0 0 48px rgba(0,0,0,0.4)',
              }}
            />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background:
                  'radial-gradient(ellipse at center, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.28) 100%)',
              }}
            />
          </div>
        </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: enableImageEffect ? 20 : 8,
        overflow: 'hidden',
        position: 'relative',
        marginBottom: 42,
        boxShadow: enableImageEffect
          ? '0 24px 48px rgba(0,0,0,0.38)'
          : '0 18px 32px rgba(0,0,0,0.28)',
      }}
    >
      <img
        src={coverPhotoUrl}
        alt="Report"
        crossOrigin="anonymous"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: enableImageEffect ? 'scale(1.02)' : 'scale(1)',
          filter: enableImageEffect
            ? 'brightness(0.96) contrast(1.04)'
            : 'none',
        }}
      />

      {enableImageEffect && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.22)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
function StoryTemplateInstagram({
  report,
  coverPhotoUrl,
  bgStyle,
  enableImageEffect = true,
  enableHoleEffect = false,
  qrCodePlayStore = '',
  likeIconUrl = '',
}) {
  const title = report?.title || '';
  const address = report?.address || '';
  const fontSize = getDynamicFontSize(title, 68);
  const titleLines = splitHeadline(title, title.length > 40 ? 25 : 19, 6);
  const statusConfig = getStatusConfig(report?.status);

  return (
    <div
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
        ...bgStyle,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.14) 28%, rgba(0,0,0,0.32) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          zIndex: 3,
        }}
      >
        <img
          src="/logo.png"
          style={{ width: 196, height: 196, objectFit: 'contain' }}
          alt="Logo"
        />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: 68,
              fontWeight: 900,
              color: '#d52407',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              textShadow: baseTextShadow,
            }}
          >
            TROMBONE
          </span>
          <span
            style={{
              fontSize: 68,
              fontWeight: 900,
              color: '#ffd20c',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              textShadow: baseTextShadow,
            }}
          >
            CIDADÃO
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 430,
          left: 60,
          right: 60,
          bottom: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        <StatusTag statusConfig={statusConfig} />

        <div
          style={{
            fontSize: fontSize,
            lineHeight: 0.92,
            fontWeight: 900,
            textAlign: 'center',
            textTransform: 'uppercase',
            color: '#eceade',
            textShadow: baseTextShadow,
            marginBottom: 90,
            width: '100%',
            maxWidth: 950,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
          }}
        >
          {titleLines.join('\n')}
        </div>

        <ReportImage
          coverPhotoUrl={coverPhotoUrl}
          enableImageEffect={enableImageEffect}
          enableHoleEffect={enableHoleEffect}
        />

        {address && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              width: 'max-content',
              marginBottom: 40,
            }}
          >
            <MapPin
              size={44}
              color="#FF3B30"
              fill="#FF3B30"
              style={{
                filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.38))',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: '#eceade',
                textTransform: 'uppercase',
                textShadow: baseTextShadow,
                letterSpacing: '0.02em',
                textAlign: 'center',
              }}
            >
              {getCityFromAddress(address, report)}
            </span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div
          style={{
            width: '100%',
            backgroundColor: 'rgba(25, 15, 12, 0.36)',
            backdropFilter: 'blur(2px)',
            border: '3px solid #ffd20c',
            borderRadius: 12,
            padding: '30px 40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 30,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 22px 42px rgba(0,0,0,0.28)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: -10,
              right: -10,
              width: 400,
              height: 15,
              background: '#FF3B30',
              transform: 'rotate(-15deg)',
              opacity: 0.6,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              right: -10,
              width: 400,
              height: 10,
              background: '#FF3B30',
              transform: 'rotate(-15deg)',
              opacity: 0.4,
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 15,
              flex: 1,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <div
                style={{
                  backgroundColor:
                    statusConfig.bgKey === 'resolved'
                      ? '#31894a'
                      : statusConfig.bgKey === 'pending'
                      ? '#d52407'
                      : '#346397',
                  width: 110,
                  height: 110,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 14px 26px rgba(0,0,0,0.18)',
                }}
              >
                  {likeIconUrl && (
                    <img
                      src={likeIconUrl}
                      style={{ width: 75, height: 75 }}
                      alt="Like"
                    />
                  )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  lineHeight: 1.1,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 38,
                      fontWeight: 900,
                      color: '#ffd20c',
                      letterSpacing: '0.02em',
                      textShadow: baseTextShadow,
                    }}
                  >
                    BAIXE O APP
                  </span>
                  <span
                    style={{
                      fontSize: 32,
                      fontWeight: 600,
                      color: '#eceade',
                      marginLeft: 10,
                      textShadow: baseTextShadow,
                    }}
                  >
                    E CADASTRE
                  </span>
                </div>

                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 600,
                    color: '#eceade',
                    textShadow: baseTextShadow,
                  }}
                >
                  SUA BRONCA TAMBÉM
                </span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#ffd20c',
                color: '#000000',
                padding: '12px 30px',
                borderRadius: 999,
                fontSize: 34,
                fontWeight: 900,
                textAlign: 'center',
                textTransform: 'uppercase',
                boxShadow: '0 18px 36px rgba(0,0,0,0.22)',
                width: 'fit-content',
                marginTop: 5,
                backgroundImage:
                  'linear-gradient(180deg, #ffd20c 0%, #f4ca14 100%)',
              }}
            >
              APOIAR NO TROMBONE
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#FFFFFF',
              padding: 12,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 180,
              height: 180,
              flexShrink: 0,
              position: 'relative',
              zIndex: 1,
              boxShadow: '0 18px 36px rgba(0,0,0,0.22)',
            }}
          >
            {qrCodePlayStore && (
              <img
                src={qrCodePlayStore}
                alt="QR Code Play Store"
                style={{ width: '100%', height: '100%' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const StoryRenderer = React.forwardRef(function StoryRenderer(
  {
    report,
    coverPhotoUrl,
    bgStyle,
    enableImageEffect = true,
    enableHoleEffect = false,
    qrCodePlayStore = '',
    likeIconUrl = '',
  },
  ref
) {
  return (
    <div ref={ref} style={{ width: STORY_WIDTH, height: STORY_HEIGHT }}>
      <StoryTemplateInstagram
        report={report}
        coverPhotoUrl={coverPhotoUrl}
        bgStyle={bgStyle}
        enableImageEffect={enableImageEffect}
        enableHoleEffect={enableHoleEffect}
        qrCodePlayStore={qrCodePlayStore}
        likeIconUrl={likeIconUrl}
      />
    </div>
  );
});

const layoutOptions = [
  {
    value: 'instagram',
    label: 'Instagram',
    description: 'Layout oficial para stories do Instagram',
  },
];

const ReportStoryModal = ({
  isOpen,
  onClose,
  report,
  qrCodeUrl,
  coverPhotoUrl,
}) => {
  const [layout, setLayout] = useState('instagram');
  const [enableImageEffect, setEnableImageEffect] = useState(true);
  const [enableHoleEffect, setEnableHoleEffect] = useState(false);

  const [bgType, setBgType] = useState('auto');
  const [customBgColor, setCustomBgColor] = useState('#111111');

  // Todos os assets do card viram data URI antes da exportacao: o toPng falha
  // se qualquer imagem do DOM vier de outra origem sem CORS.
  const [assets, setAssets] = useState({
    backgrounds: {},
    likeIcon: '',
    qrCode: '',
    coverPhoto: '',
  });
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      setAssetsReady(false);

      const [qrCode, likeIcon, coverPhoto, pending, inProgress, resolved] =
        await Promise.all([
          QRCode.toDataURL(PLAY_STORE_URL, {
            width: 500,
            margin: 1,
            errorCorrectionLevel: 'M',
          }).catch(() => ''),
          toDataUri(getCardInstagramPublicUrl('like-svgrepo-com (1).svg')),
          toDataUri(coverPhotoUrl),
          toDataUri(getCardInstagramPublicUrl(BG_FILE_BY_KEY.pending)),
          toDataUri(getCardInstagramPublicUrl(BG_FILE_BY_KEY.in_progress)),
          toDataUri(getCardInstagramPublicUrl(BG_FILE_BY_KEY.resolved)),
        ]);

      if (cancelled) return;

      setAssets({
        qrCode,
        likeIcon,
        coverPhoto,
        backgrounds: {
          pending,
          in_progress: inProgress,
          resolved,
        },
      });
      setAssetsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, coverPhotoUrl]);

  const currentBgStyle = useMemo(() => {
    const bgKey = resolveBgKey(bgType, report?.status);
    return getStatusBackgroundStyle(
      bgType,
      customBgColor,
      report?.status,
      assets.backgrounds[bgKey]
    );
  }, [bgType, customBgColor, report?.status, assets.backgrounds]);

  const safeTitle = useMemo(
    () => getSafeFilename(report?.title || 'trombone-cidadao'),
    [report?.title]
  );

  // Rasterizar, salvar em disco e mandar ao story vivem no useStoryExport:
  // o caminho nativo tem as partes difíceis (galeria via MediaStore, folha do
  // sistema, notificação) e o card da patrulha usa exatamente o mesmo. Duas
  // cópias divergiriam no primeiro conserto.
  //
  // `storyShareAvailable` vem do hook agora: ele sabe distinguir o deep link
  // do Instagram da folha do sistema, e a folha existe também no navegador.
  const {
    exportRef,
    baixando: downloading,
    compartilhando: sharing,
    ocupado,
    baixar: handleDownload,
    compartilhar: handleShareToStory,
    podeCompartilhar: storyShareAvailable,
    viaInstagram,
  } = useStoryExport({
    nomeArquivo: `story-${layout}-${safeTitle}`,
    shareUrl: report?.id ? getReportShareUrl(report.id) : undefined,
    tipoConteudo: 'report',
    contentId: report?.id,
    pronto: assetsReady,
    aoConcluirShare: onClose,
  });

  // Fechado é desmontado, não escondido: a FeedCard já monta este componente só
  // quando abre, mas a ReportPage o mantém sempre montado e controla por prop.
  // Sem esta saída, o painel animado apareceria na tela em ambas.
  if (!isOpen) return null;


  return (
    // Mesma concha do ReportUpdateModal: folha que sobe de baixo no celular e
    // vira caixa centrada a partir de sm. Antes era um Dialog de 95vw × 95vh,
    // que no celular ocupava a tela toda sem ser tela cheia — sobravam faixas
    // de 2,5% nas laterais e o rodapé encostava na barra de gestos.
    //
    // A largura cresce só no lg, onde o corpo vira duas colunas: com max-w-lg
    // ali a pré-visualização ficaria espremida ao lado dos controles.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[3000]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        className="bg-surface-raised rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg lg:max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: '94vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Instagram className="text-pink-600 flex-shrink-0" size={20} />
            <div className="min-w-0">
              <h2 className="text-[17px] font-extrabold text-content-primary tracking-tight truncate">
                Criar Story
              </h2>
              <p className="text-xs text-content-tertiary mt-0.5 truncate">
                Escolha o estilo e compartilhe no Instagram
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-surface-sunken text-content-secondary hover:bg-surface-subtleHover transition-colors active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 no-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4 lg:gap-5 h-full">
            <div className="space-y-4 lg:space-y-4">
              <div>
                <h3 className="text-[10px] sm:text-sm font-semibold uppercase tracking-wider text-content-tertiary mb-2 sm:mb-4 lg:mb-2">
                  Modelo de Layout
                </h3>

                <div className="flex flex-row sm:flex-col gap-1.5 sm:gap-2 overflow-x-visible sm:overflow-x-auto pb-1 sm:pb-0">
                  {layoutOptions.map((item) => {
                    const active = layout === item.value;

                    return (
                      <button
                        key={item.value}
                        onClick={() => setLayout(item.value)}
                        className={`flex items-center sm:items-start flex-row gap-1.5 sm:gap-4 lg:gap-2 p-1.5 sm:p-4 lg:p-2 rounded-xl text-left transition-all border-2 flex-1 sm:flex-none ${
                          active
                            ? 'border-brand bg-brand/10 shadow-sm ring-1 ring-brand/20'
                            : 'border-transparent hover:bg-surface-subtleHover bg-surface-subtle'
                        }`}
                      >
                        <div
                          className={`p-1 sm:p-2 rounded-lg transition-colors ${
                            active
                              ? 'bg-brand text-content-onBrand'
                              : 'bg-surface-sunken text-content-tertiary'
                          }`}
                        >
                          <LayoutTemplate
                            size={14}
                            className="sm:w-5 sm:h-5 lg:w-4 lg:h-4"
                          />
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div
                            className={`font-bold text-[10px] sm:text-sm lg:text-xs flex items-center gap-1 sm:gap-2 lg:gap-1 truncate ${
                              active ? 'text-brand' : 'text-content-primary'
                            }`}
                          >
                            {item.label}
                            {active && (
                              <Check
                                size={10}
                                className="text-brand sm:w-3.5 sm:h-3.5 lg:w-3 lg:h-3 flex-shrink-0"
                              />
                            )}
                          </div>

                          <p className="text-[10px] hidden sm:block text-content-tertiary mt-1 leading-relaxed lg:line-clamp-1">
                            {item.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {layout === 'instagram' && (
                <div className="pt-2 border-t border-edge-subtle space-y-4">
                  <div>
                    <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-content-tertiary mb-3">
                      Fundo do Story
                    </h3>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setBgType('auto')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'auto'
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-edge-default bg-surface-subtle text-content-primary'
                        }`}
                      >
                        Automático
                      </button>

                      <button
                        onClick={() => setBgType('pending')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'pending'
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-edge-default bg-surface-subtle text-content-primary'
                        }`}
                      >
                        Vermelho
                      </button>

                      <button
                        onClick={() => setBgType('in_progress')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'in_progress'
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-edge-default bg-surface-subtle text-content-primary'
                        }`}
                      >
                        Azul
                      </button>

                      <button
                        onClick={() => setBgType('resolved')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'resolved'
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-edge-default bg-surface-subtle text-content-primary'
                        }`}
                      >
                        Verde
                      </button>

                      <button
                        onClick={() => setBgType('color')}
                        className={`col-span-2 p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold flex items-center justify-between ${
                          bgType === 'color'
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-edge-default bg-surface-subtle text-content-primary'
                        }`}
                      >
                        <span>Cor personalizada</span>
                        <input
                          type="color"
                          value={customBgColor}
                          onChange={(e) => {
                            setCustomBgColor(e.target.value);
                            setBgType('color');
                          }}
                          className="w-4 h-4 p-0 border-0 rounded cursor-pointer"
                        />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-content-tertiary mb-3">
                      Efeitos
                    </h3>

                    <button
                      onClick={() => setEnableImageEffect(!enableImageEffect)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border-2 transition-all ${
                        enableImageEffect
                          ? 'border-brand bg-brand/5 text-brand font-bold'
                          : 'border-edge-default bg-surface-subtle text-content-secondary'
                      }`}
                    >
                      <span className="text-[10px]">
                        Suavizar imagem da bronca
                      </span>

                      {/* Trilho/bolinha do toggle: sempre branco sobre fundo colorido/cinza, funciona igual nos dois temas */}
                      <div
                        className={`w-8 h-4 rounded-full relative transition-colors ${
                          enableImageEffect ? 'bg-brand' : 'bg-surface-sunken'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${
                            enableImageEffect ? 'right-0.5' : 'left-0.5'
                          }`}
                        />
                      </div>
                    </button>

                    <button
                      onClick={() => setEnableHoleEffect(!enableHoleEffect)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border-2 transition-all mt-2 ${
                        enableHoleEffect
                          ? 'border-brand bg-brand/5 text-brand font-bold'
                          : 'border-edge-default bg-surface-subtle text-content-secondary'
                      }`}
                    >
                      <span className="text-[10px]">
                        Efeito buraco na imagem
                      </span>

                      <div
                        className={`w-8 h-4 rounded-full relative transition-colors ${
                          enableHoleEffect ? 'bg-brand' : 'bg-surface-sunken'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${
                            enableHoleEffect ? 'right-0.5' : 'left-0.5'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5 lg:gap-2 h-full min-w-0">
              {/* Tokens semânticos no lugar de bg-muted/border-muted-foreground:
                  o resto do modal já migrou, e os antigos não acompanham o tema.

                  As alturas encolheram junto com o resto — a moldura só precisa
                  caber o card, e o card mais alto aqui tem 307px (escala 0,159
                  sobre 1920). Sobra folga, não vazio. */}
              <div className="bg-surface-sunken rounded-2xl p-2 sm:p-4 lg:p-2 flex items-center justify-center border border-dashed border-edge-default overflow-hidden h-[330px] xs:h-[360px] sm:h-[440px] lg:h-[350px] xl:h-[460px] flex-shrink-0 relative group">
                {/* Chip flutuante sobre a preview, sempre escuro/texto branco de proposito - overlay padrao sobre imagem, nao segue o tema */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/80 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <Instagram size={12} className="text-pink-500" />
                  Visualização 1080x1920
                </div>

                <StoryPreviewFrame>
                  {/* Fundo do card do story em si (conteudo/artefato), fixo de proposito */}
                  <div className="w-full h-full relative overflow-hidden bg-black">
                    <StoryRenderer
                      report={report}
                      coverPhotoUrl={assets.coverPhoto || coverPhotoUrl}
                      bgStyle={currentBgStyle}
                      enableImageEffect={enableImageEffect}
                      enableHoleEffect={enableHoleEffect}
                      qrCodePlayStore={assets.qrCode}
                      likeIconUrl={assets.likeIcon}
                    />
                  </div>
                </StoryPreviewFrame>
              </div>

              <div className="text-xs text-content-tertiary px-1">
                Status atual detectado:{' '}
                <span className="font-bold text-content-primary">
                  {getStatusConfig(report?.status).label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé
            ────────────────────────────────────────────────────────────────────
            Antes: três botões com rótulo por extenso numa linha só. Em tela
            estreita "Compartilhar no story" quebrava em duas linhas e vazava
            pela borda — era o que a captura mostrava.

            Agora a hierarquia decide o espaço. Compartilhar é a ação que o
            modal existe para oferecer e fica com o dobro da largura de
            Cancelar; Baixar é alternativa, e vira um quadrado de 48px com o
            ícone. Três rótulos por extenso não cabem em 360px de tela sem
            encolher a fonte abaixo do legível.

            Quando não há compartilhamento nativo (web, iOS sem Instagram),
            Baixar assume o lugar de ação principal e volta a ter rótulo — aí
            são dois botões, e sobra espaço. */}
        <div
          className="flex-shrink-0 bg-surface-raised border-t border-edge-subtle"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          {/* O aviso de "preparando" morava dentro do rótulo do botão. Com o
              botão virando ícone, ele precisava de um lugar próprio — e uma
              faixa que aparece e some não empurra o rodapé de forma permanente. */}
          <AnimatePresence>
            {!assetsReady && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mx-5 mt-3 px-3.5 py-2 rounded-xl bg-surface-sunken flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-content-tertiary flex-shrink-0" />
                  <span className="text-xs font-semibold text-content-secondary leading-tight">
                    Preparando as imagens do card…
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2.5 px-5 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={ocupado}
              className="flex-1 rounded-2xl h-12 text-sm font-semibold border-edge-default text-content-primary"
            >
              Cancelar
            </Button>

            {storyShareAvailable ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownload}
                  disabled={ocupado || !assetsReady}
                  aria-label="Baixar imagem"
                  title="Baixar imagem"
                  className="w-12 flex-shrink-0 p-0 rounded-2xl h-12 border-edge-default text-content-primary"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download size={18} />
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={handleShareToStory}
                  disabled={ocupado || !assetsReady}
                  className="flex-[2] rounded-2xl h-12 gap-2 text-sm font-bold bg-cta-bg border border-cta-border text-cta-fg hover:brightness-110 shadow-elevation-2 active:scale-[0.98] disabled:opacity-60"
                >
                  {sharing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      {viaInstagram ? 'Compartilhar' : 'Publicar no story'}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleDownload}
                disabled={ocupado || !assetsReady}
                className="flex-[2] rounded-2xl h-12 gap-2 text-sm font-bold bg-cta-bg border border-cta-border text-cta-fg hover:brightness-110 shadow-elevation-2 active:scale-[0.98] disabled:opacity-60"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Baixar imagem
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'fixed',
            left: -9999,
            top: 0,
            width: STORY_WIDTH,
            height: STORY_HEIGHT,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <StoryRenderer
            ref={exportRef}
            report={report}
            coverPhotoUrl={assets.coverPhoto || coverPhotoUrl}
            bgStyle={currentBgStyle}
            enableImageEffect={enableImageEffect}
            enableHoleEffect={enableHoleEffect}
            qrCodePlayStore={assets.qrCode}
            likeIconUrl={assets.likeIcon}
          />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ReportStoryModal;
