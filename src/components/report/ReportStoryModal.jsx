import React, { useMemo, useRef, useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Download,
  Instagram,
  MapPin,
  LayoutTemplate,
  Check,
  BadgeCheck,
  Clock3,
  Wrench,
} from 'lucide-react';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

const normalizeText = (text = '') =>
  String(text || '').replace(/\s+/g, ' ').trim();

const clampText = (text = '', max = 90) => {
  const clean = normalizeText(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + '…';
};

const getSafeFilename = (title = '') =>
  clampText(title || 'bronca', 60)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');

const splitHeadline = (title = '', maxLineLength = 18, maxLines = 4) => {
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

const getCityFromAddress = (address = '', report = {}) => {
  if (report.city) {
    const uf = report.state || report.uf || 'PE';
    return `${report.city}-${uf}`.toUpperCase();
  }

  const clean = normalizeText(address);
  if (!clean) return 'FLORESTA-PE';

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

  if (clean.toUpperCase().includes('FLORESTA')) {
    return 'FLORESTA-PE';
  }

  return 'FLORESTA-PE';
};

const getNormalizedStatus = (status) => {
  const value = normalizeText(status).toLowerCase();

  if (
    ['pendente', 'pending', 'aberta', 'open', 'aguardando'].includes(value)
  ) {
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
          }}
        >
          {statusConfig.label}
        </span>
      </div>
    </div>
  );
}

function getStatusBackgroundStyle(bgType, customBgColor, reportStatus) {
  if (bgType === 'color') {
    return {
      backgroundColor: customBgColor,
    };
  }

  let resolvedBgType = bgType;

  if (bgType === 'auto') {
    resolvedBgType = getStatusConfig(reportStatus).bgKey;
  }

  let bgUrl = '/card-instagram/bg-pending-1.png';

  if (resolvedBgType === 'in_progress') {
    bgUrl = '/card-instagram/bg-in-progress.png';
  } else if (resolvedBgType === 'resolved') {
    bgUrl = '/card-instagram/bg-resolved.png';
  } else if (resolvedBgType === 'pending') {
    bgUrl = '/card-instagram/bg-pending-1.png';
  }

  return {
    backgroundImage: `url(${bgUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

function StoryTemplateInstagram({
  report,
  coverPhotoUrl,
  bgStyle,
  enableImageEffect = true,
}) {
  const title = report?.title || '';
  const address = report?.address || '';
  const titleLines = splitHeadline(title, 19, 4);
  const statusConfig = getStatusConfig(report?.status);

  const playStoreUrl =
    'https://play.google.com/store/apps/details?id=com.trombonecidadao.app&pcampaignid=web_share';

  const qrCodePlayStore = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    playStoreUrl
  )}`;

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
            'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.14) 28%, rgba(0,0,0,0.24) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
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
              textShadow: '0 4px 10px rgba(0,0,0,0.28)',
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
              textShadow: '0 4px 10px rgba(0,0,0,0.28)',
            }}
          >
            CIDADÃO
          </span>
        </div>
      </div>

      {/* Content */}
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

        {/* Title */}
        <div
          style={{
            fontSize: 68,
            lineHeight: 1.05,
            fontWeight: 900,
            textAlign: 'center',
            textTransform: 'uppercase',
            color: '#eceade',
            textShadow:
              '0 4px 12px rgba(0,0,0,0.5), 0 14px 28px rgba(0,0,0,0.18)',
            marginBottom: 90,
            width: '100%',
            maxWidth: 960,
            whiteSpace: 'pre-line',
          }}
        >
          {titleLines.join('\n')}
        </div>

        {/* Image */}
        {coverPhotoUrl && (
          <div
            style={{
              width: '100%',
              aspectRatio: '16/9',
              borderRadius: 8,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.30)',
              border: '1px solid rgba(255,255,255,0.04)',
              marginBottom: 42,
              background: '#121212',
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
                transform: enableImageEffect ? 'scale(1.045)' : 'scale(1)',
                filter: enableImageEffect
                  ? 'brightness(0.84) contrast(0.92) saturate(0.80) blur(0.6px)'
                  : 'none',
              }}
            />

            {enableImageEffect && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'radial-gradient(ellipse at center, rgba(255,255,255,0.01) 0%, rgba(0,0,0,0.04) 50%, rgba(0,0,0,0.46) 100%)',
                    pointerEvents: 'none',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                      linear-gradient(to right, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.08) 12%, rgba(0,0,0,0.00) 24%, rgba(0,0,0,0.00) 76%, rgba(0,0,0,0.08) 88%, rgba(0,0,0,0.32) 100%),
                      linear-gradient(to bottom, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.04) 12%, rgba(0,0,0,0.00) 24%, rgba(0,0,0,0.00) 74%, rgba(0,0,0,0.08) 88%, rgba(0,0,0,0.28) 100%)
                    `,
                    pointerEvents: 'none',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    boxShadow:
                      'inset 0 0 90px rgba(0,0,0,0.40), inset 0 0 24px rgba(0,0,0,0.14)',
                    pointerEvents: 'none',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.08,
                    backgroundImage:
                      'radial-gradient(rgba(255,255,255,0.72) 0.75px, transparent 0.75px)',
                    backgroundSize: '12px 12px',
                    mixBlendMode: 'soft-light',
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Location */}
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
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: '#eceade',
                textTransform: 'uppercase',
                textShadow:
                  '0 4px 12px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6)',
                letterSpacing: '0.02em',
                textAlign: 'center',
              }}
            >
              {getCityFromAddress(address, report)}
            </span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Footer */}
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
                  backgroundColor: statusConfig.bgKey === 'resolved' ? '#31894a' : statusConfig.bgKey === 'pending' ? '#d52407' : '#346397',
                  width: 110,
                  height: 110,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                }}
              >
                <img
                  src="/card-instagram/like-svgrepo-com (1).svg"
                  style={{ width: 75, height: 75 }}
                  alt="Like"
                />
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
                boxShadow: '0 6px 15px rgba(0,0,0,0.3)',
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
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
            }}
          >
            <img
              src={qrCodePlayStore}
              alt="QR Code Play Store"
              style={{ width: '100%', height: '100%' }}
              crossOrigin="anonymous"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const StoryRenderer = React.forwardRef(function StoryRenderer(
  { report, coverPhotoUrl, bgStyle, enableImageEffect = true },
  ref
) {
  return (
    <div ref={ref} style={{ width: STORY_WIDTH, height: STORY_HEIGHT }}>
      <StoryTemplateInstagram
        report={report}
        coverPhotoUrl={coverPhotoUrl}
        bgStyle={bgStyle}
        enableImageEffect={enableImageEffect}
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
  const exportRef = useRef(null);
  const [layout, setLayout] = useState('instagram');
  const [downloading, setDownloading] = useState(false);
  const [enableImageEffect, setEnableImageEffect] = useState(true);

  // auto = escolhe pelo status
  const [bgType, setBgType] = useState('auto');
  const [customBgColor, setCustomBgColor] = useState('#111111');

  const currentBgStyle = useMemo(() => {
    return getStatusBackgroundStyle(bgType, customBgColor, report?.status);
  }, [bgType, customBgColor, report?.status]);

  const safeTitle = useMemo(
    () => getSafeFilename(report?.title || 'trombone-cidadao'),
    [report?.title]
  );

  const handleDownload = useCallback(async () => {
    if (!exportRef.current || downloading) return;

    try {
      setDownloading(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        canvasWidth: STORY_WIDTH,
        canvasHeight: STORY_HEIGHT,
        backgroundColor: '#111111',
        skipAutoScale: true,
      });

      const fileName = `story-${layout}-${safeTitle}.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Erro ao gerar story:', error);
      alert('Não foi possível gerar a imagem do story.');
    } finally {
      setDownloading(false);
    }
  }, [layout, safeTitle, downloading]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[95vh] sm:h-[90vh] lg:h-[85vh] p-0 flex flex-col overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-4 sm:p-6 border-b bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Instagram className="text-pink-600" size={24} />
            <DialogTitle className="text-xl sm:text-2xl font-black">
              Criar Story para Instagram
            </DialogTitle>
          </div>

          <DialogDescription className="text-xs sm:text-sm hidden xs:block">
            Escolha um estilo visual e baixe o card otimizado para os stories.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto lg:overflow-hidden p-4 sm:p-6 lg:p-4 bg-gray-50/30 no-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4 sm:gap-8 lg:gap-4 h-full">
            {/* Sidebar */}
            <div className="space-y-4 sm:space-y-6 lg:space-y-4">
              <div>
                <h3 className="text-[10px] sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 sm:mb-4 lg:mb-2">
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
                            ? 'border-tc-red bg-tc-red/10 shadow-sm ring-1 ring-tc-red/20'
                            : 'border-transparent hover:bg-muted bg-white'
                        }`}
                      >
                        <div
                          className={`p-1 sm:p-2 rounded-lg transition-colors ${
                            active
                              ? 'bg-tc-red text-white'
                              : 'bg-muted text-muted-foreground'
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
                              active ? 'text-tc-red' : 'text-foreground'
                            }`}
                          >
                            {item.label}
                            {active && (
                              <Check
                                size={10}
                                className="text-tc-red sm:w-3.5 sm:h-3.5 lg:w-3 lg:h-3 flex-shrink-0"
                              />
                            )}
                          </div>

                          <p className="text-[10px] hidden sm:block text-muted-foreground mt-1 leading-relaxed lg:line-clamp-1">
                            {item.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {layout === 'instagram' && (
                <div className="pt-2 border-t border-gray-100 space-y-4">
                  <div>
                    <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Fundo do Story
                    </h3>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setBgType('auto')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'auto'
                            ? 'border-tc-red bg-tc-red/5 text-tc-red'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        Automático
                      </button>

                      <button
                        onClick={() => setBgType('pending')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'pending'
                            ? 'border-tc-red bg-tc-red/5 text-tc-red'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        Vermelho
                      </button>

                      <button
                        onClick={() => setBgType('in_progress')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'in_progress'
                            ? 'border-tc-red bg-tc-red/5 text-tc-red'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        Azul
                      </button>

                      <button
                        onClick={() => setBgType('resolved')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'resolved'
                            ? 'border-tc-red bg-tc-red/5 text-tc-red'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        Verde
                      </button>

                      <button
                        onClick={() => setBgType('color')}
                        className={`col-span-2 p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold flex items-center justify-between ${
                          bgType === 'color'
                            ? 'border-tc-red bg-tc-red/5 text-tc-red'
                            : 'border-gray-200 bg-white'
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
                    <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Efeitos
                    </h3>

                    <button
                      onClick={() => setEnableImageEffect(!enableImageEffect)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border-2 transition-all ${
                        enableImageEffect
                          ? 'border-tc-red bg-tc-red/5 text-tc-red font-bold'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      <span className="text-[10px]">
                        Suavizar imagem da bronca
                      </span>

                      <div
                        className={`w-8 h-4 rounded-full relative transition-colors ${
                          enableImageEffect ? 'bg-tc-red' : 'bg-gray-200'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${
                            enableImageEffect ? 'right-0.5' : 'left-0.5'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="flex flex-col gap-3 sm:gap-4 lg:gap-2 h-full min-w-0">
              <div className="bg-muted/30 rounded-2xl p-2 sm:p-4 lg:p-2 flex items-center justify-center border border-dashed border-muted-foreground/20 overflow-hidden h-[360px] xs:h-[400px] sm:h-[480px] lg:h-[350px] xl:h-[480px] flex-shrink-0 relative group">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/80 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <Instagram size={12} className="text-pink-500" />
                  Visualização 1080x1920
                </div>

                <div className="w-[172px] h-[307px] sm:w-[216px] sm:h-[384px] md:w-[237px] md:h-[422px] lg:w-[162px] lg:h-[288px] xl:w-[216px] xl:h-[384px] relative flex-shrink-0 shadow-[0_40px_100px_rgba(0,0,0,0.4)] transition-all">
                  <div
                    className="absolute top-0 left-0 w-[1080px] h-[1920px] origin-top-left !scale-[0.159] sm:!scale-[0.20] md:!scale-[0.22] lg:!scale-[0.15] xl:!scale-[0.20]"
                    style={{ transform: 'scale(0.159)' }}
                  >
                    <div className="w-full h-full relative overflow-hidden bg-black">
                      <StoryRenderer
                        report={report}
                        coverPhotoUrl={coverPhotoUrl}
                        bgStyle={currentBgStyle}
                        enableImageEffect={enableImageEffect}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground px-1">
                Status atual detectado:{' '}
                <span className="font-bold text-foreground">
                  {getStatusConfig(report?.status).label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-6 lg:p-4 border-t bg-white flex flex-row items-center justify-between gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-10 sm:h-12 lg:h-10 px-4 sm:px-8 lg:px-4 font-bold"
          >
            Cancelar
          </Button>

          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="bg-tc-red hover:bg-tc-red/90 text-white gap-2 h-10 sm:h-12 lg:h-10 px-6 sm:px-8 lg:px-6 font-bold shadow-lg shadow-tc-red/20 flex-1 sm:flex-none"
          >
            {downloading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Download size={18} />
            )}
            {downloading ? 'Gerando...' : 'Baixar para Instagram'}
          </Button>
        </DialogFooter>

        {/* Hidden export */}
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
            coverPhotoUrl={coverPhotoUrl}
            bgStyle={currentBgStyle}
            enableImageEffect={enableImageEffect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportStoryModal;