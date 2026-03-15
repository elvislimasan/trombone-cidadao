import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  X,
  Download,
  Instagram,
  MapPin,
  AlertTriangle,
  ThumbsUp,
  Megaphone,
  LayoutTemplate,
  QrCode,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

const normalizeText = (text = '') => String(text || '').replace(/\s+/g, ' ').trim();

const clampText = (text = '', max = 90) => {
  const clean = normalizeText(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + '…';
};

const getSupportText = (count) => {
  const value = Number(count || 0);
  if (value <= 0) return '0 pessoas apoiaram ainda';
  if (value === 1) return '1 pessoa apoiou';
  return `${value} pessoas apoiaram`;
};

const getShortAddress = (address = '') => {
  const clean = normalizeText(address);
  if (!clean) return 'Localização não informada';
  return clampText(clean, 58);
};

const getCityFromAddress = (address = '', report = {}) => {
  // Prioridade 1: Se o objeto report já tiver a cidade explicitamente
  if (report.city) {
    const uf = report.state || report.uf || 'PE';
    return `${report.city}-${uf}`.toUpperCase();
  }

  const clean = normalizeText(address);
  if (!clean) return 'FLORESTA-PE';
  
  // Tenta encontrar o padrão "Cidade - UF" ou "Cidade, UF" no final da string
  const parts = clean.split(/[,-]/).map(p => p.trim());
  
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    
    // Caso 1: Última parte é UF (2 letras) - Ex: "Floresta - PE"
    if (last.length === 2 && /^[A-Z]{2}$/i.test(last)) {
      return `${secondLast}-${last}`.toUpperCase();
    }
    
    // Caso 2: Penúltima parte é UF e a última é algo como "Brasil" (comum em geocoders)
    if (secondLast.length === 2 && /^[A-Z]{2}$/i.test(secondLast)) {
      const thirdLast = parts[parts.length - 3];
      if (thirdLast) return `${thirdLast}-${secondLast}`.toUpperCase();
    }
  }

  // Se não encontrou padrão de cidade no endereço, mas contém Floresta em qualquer lugar
  if (clean.toUpperCase().includes('FLORESTA')) {
    return 'FLORESTA-PE';
  }

  // Fallback radical: Para este card, se não for um endereço formatado,
  // assume a cidade padrão do projeto para não poluir o layout com descrições.
  return 'FLORESTA-PE';
};

const getDynamicFontSize = (text, baseSize = 92) => {
  if (!text) return baseSize;
  const length = text.length;
  if (length > 60) return Math.max(42, baseSize * 0.75);
  if (length > 40) return Math.max(54, baseSize * 0.8);
  if (length > 25) return Math.max(72, baseSize * 0.85);
  return baseSize;
};

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

const getSafeFilename = (title = '') =>
  clampText(title || 'bronca', 60)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');

const baseTextShadow = '0 4px 14px rgba(0,0,0,0.38), 0 14px 34px rgba(0,0,0,0.24)';

function BackgroundPhoto({ coverPhotoUrl, dark = 0.48, scale = 1.04, showImage = true, primaryColor = '#e52a2a' }) {
  if (!showImage || !coverPhotoUrl) {
    return null;
  }
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: coverPhotoUrl ? `url(${coverPhotoUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `scale(${scale})`,
          filter: `brightness(${dark}) saturate(0.95)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.24) 48%, rgba(0,0,0,0.66) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          backgroundImage: 'radial-gradient(#ffffff 0.8px, transparent 0.8px)',
          backgroundSize: '12px 12px',
          mixBlendMode: 'overlay',
        }}
      />
    </>
  );
}

function CTAFooterUrgent({ primaryColor = '#f4c430' }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 0,
        background: 'rgba(7,7,7,0.84)',
        border: `2px solid ${primaryColor}8c`, // 0.55 opacity approx
        padding: '28px 28px 30px',
        boxShadow: '0 22px 42px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -30,
          top: -30,
          width: 190,
          height: 190,
          borderRadius: '50%',
          background: `${primaryColor}14`, // 0.08 opacity approx
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            color: primaryColor,
            fontSize: 24,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Clique no link e apoie esta bronca
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 76,
            lineHeight: 0.95,
            fontWeight: 900,
            letterSpacing: '-0.06em',
            textTransform: 'uppercase',
            color: '#ffffff',
            textShadow: baseTextShadow,
          }}
        >
          Dê sua voz
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            background: primaryColor,
            color: '#141414',
            padding: '18px 34px',
            fontSize: 30,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            boxShadow: '0 14px 26px rgba(0,0,0,0.18)',
          }}
        >
          Apoiar no Trombone
        </div>
      </div>
    </div>
  );
}

function CTAFooterEditorial() {
  return (
    <div
      style={{
        borderRadius: 0,
        background: 'rgba(255,255,255,0.93)',
        color: '#111',
        padding: '26px 26px 28px',
        boxShadow: '0 22px 40px rgba(0,0,0,0.22)',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#c41f1f',
        }}
      >
        Mobilize mais gente
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 58,
          lineHeight: 0.96,
          fontWeight: 900,
          letterSpacing: '-0.05em',
        }}
      >
        Compartilhe e
        <br />
        cobre solução
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 24,
          lineHeight: 1.35,
          color: 'rgba(17,17,17,0.76)',
          fontWeight: 600,
        }}
      >
        Mostre esta bronca nos stories e convide outras pessoas a apoiar.
      </div>
    </div>
  );
}

function CTAFooterMinimal() {
  return (
    <div
      style={{
        borderRadius: 0,
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.16)',
        padding: '24px 24px 26px',
        boxShadow: '0 20px 38px rgba(0,0,0,0.22)',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        Clique no link e apoie esta bronca
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 68,
          lineHeight: 0.95,
          fontWeight: 900,
          letterSpacing: '-0.05em',
          color: '#fff',
          textShadow: baseTextShadow,
        }}
      >
        Dê sua voz
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          background: '#ffffff',
          color: '#d92525',
          padding: '16px 28px',
          fontSize: 28,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
        }}
      >
        Apoiar agora
      </div>
    </div>
  );
}

function StoryTemplateUrgent({ report, qrCodeUrl, coverPhotoUrl, showQRCode = true, primaryColor = '#e52a2a', imageMode = 'background' }) {
  const title = report?.title || '';
  const fontSize = getDynamicFontSize(title, 92);
  const titleLines = splitHeadline(title, title.length > 40 ? 25 : 18, 6);
  const address = report?.address;
  const upvotes = Number(report?.upvotes || 0);
  const supportText = getSupportText(upvotes);
  const secondaryColor = '#e52a2a'; // Fixed system red for icons

  return (
    <div
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background: imageMode === 'none' ? 'transparent' : 'linear-gradient(180deg, #141414 0%, #1f1f1f 18%, #111111 100%)',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
      }}
    >
      <BackgroundPhoto coverPhotoUrl={coverPhotoUrl} showImage={imageMode === 'background'} primaryColor={primaryColor} />

      <div style={{ position: 'absolute', top: 28, left: -120, width: 420, height: 24, background: primaryColor, transform: 'rotate(-18deg)', opacity: 0.95 }} />
      <div style={{ position: 'absolute', top: 76, left: -100, width: 340, height: 12, background: primaryColor, transform: 'rotate(-18deg)', opacity: 0.92 }} />
      <div style={{ position: 'absolute', right: -100, bottom: 230, width: 340, height: 22, background: primaryColor, transform: 'rotate(-20deg)', opacity: 0.95 }} />
      <div style={{ position: 'absolute', right: -90, bottom: 188, width: 250, height: 12, background: primaryColor, transform: 'rotate(-20deg)', opacity: 0.92 }} />
      <div style={{ position: 'absolute', inset: 20, border: `6px solid ${primaryColor}d9`, boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.14)' }} />

      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 52,
          right: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '20px 24px',
          background: `linear-gradient(180deg, ${primaryColor}fa 0%, ${primaryColor}f2 100%)`,
          borderRadius: 0,
          boxShadow: '0 18px 40px rgba(0,0,0,0.30)',
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
            flexShrink: 0,
          }}
        >
          <img src="/logo.png" style={{ width: 80, height: 80, objectFit: 'contain' }} alt="Logo" />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: '#000000',
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              textTransform: 'uppercase',
            }}
          >
           Apoie uma bronca
          </div>
          <div
            style={{
              marginTop: 8,
              color: 'rgba(0,0,0,0.7)',
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Trombone Cidadão
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          top: 280,
          bottom: 80,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 18px',
                background: 'rgba(0,0,0,0.58)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 999,
                backdropFilter: 'blur(8px)',
                marginBottom: 26,
              }}
            >
              <AlertTriangle size={24} color={primaryColor} />
              <span
                style={{
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 20,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Bronca ativa
              </span>
            </div>

            <div
              style={{
                fontSize: fontSize,
                lineHeight: 0.92,
                fontWeight: 900,
                letterSpacing: '-0.06em',
                whiteSpace: 'pre-line',
                textShadow: baseTextShadow,
                maxWidth: 950,
                wordBreak: 'break-word',
              }}
            >
              {titleLines.join('\n')}
            </div>

            <div
              style={{
                marginTop: 28,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 14,
                padding: '18px 24px',
                background: 'rgba(10,10,10,0.76)',
                border: '2px solid rgba(255,255,255,0.10)',
                borderRadius: 0,
                boxShadow: '0 18px 36px rgba(0,0,0,0.25)',
                maxWidth: '100%',
              }}
            >
              <MapPin size={28} color={secondaryColor} />
              <span
                style={{
                  fontSize: 30,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  color: '#f6f6f6',
                }}
              >
                {address}
              </span>
            </div>
          </div>

          {imageMode === 'boxed' && coverPhotoUrl && (
            <div 
              style={{ 
                width: '100%', 
                height: 520, 
                borderRadius: 40, 
                overflow: 'hidden', 
                position: 'relative',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                border: '4px solid rgba(255,255,255,0.1)'
              }}
            >
              <img src={coverPhotoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)' }} />
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              display: 'flex',
              gap: 18,
              alignItems: 'stretch',
              marginBottom: 26,
            }}
          >
            <div
              style={{
                flex: 1,
                background: `linear-gradient(180deg, ${primaryColor}fa 0%, ${primaryColor}eb 100%)`,
                color: '#000000',
                borderRadius: 0,
                padding: '22px 26px',
                boxShadow: '0 18px 36px rgba(0,0,0,0.22)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <ThumbsUp size={24} color="#000000" />
                <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Apoio público
                </span>
              </div>

              <div style={{ fontSize: 44, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.05em' }}>
                {upvotes}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 24,
                  lineHeight: 1.25,
                  fontWeight: 700,
                  color: 'rgba(0,0,0,0.7)',
                }}
              >
                {supportText}
              </div>
            </div>

            {qrCodeUrl && showQRCode ? (
              <div
                style={{
                  width: 200,
                  background: 'rgba(255,255,255,0.96)',
                  borderRadius: 0,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 18px 36px rgba(0,0,0,0.22)',
                  flexShrink: 0,
                }}
              >
                <img
                  src={qrCodeUrl}
                  alt="QR Code da bronca"
                  crossOrigin="anonymous"
                  style={{
                    width: '100%',
                    height: 'auto',
                    borderRadius: 0,
                    display: 'block',
                  }}
                />
              </div>
            ) : null}
          </div>

          <CTAFooterUrgent primaryColor={primaryColor} />
        </div>
      </div>
    </div>
  );
}

function StoryTemplateEditorial({ report, qrCodeUrl, coverPhotoUrl, showQRCode = true }) {
  const titleLines = splitHeadline(report?.title, 22, 3);
  const address = getShortAddress(report?.address);
  const upvotes = Number(report?.upvotes || 0);
  const supportText = getSupportText(upvotes);

  return (
    <div
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background: '#171717',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
      }}
    >
      <BackgroundPhoto coverPhotoUrl={coverPhotoUrl} dark={0.44} scale={1.02} />

      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 40,
          right: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
            }}
          >
            <img src="/logo.png" style={{ width: 44, height: 44, objectFit: 'contain' }} alt="Logo" />
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.93)',
              color: '#141414',
              borderRadius: 22,
              padding: '18px 22px',
              boxShadow: '0 16px 32px rgba(0,0,0,0.20)',
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#c41f1f',
              }}
            >
              Trombone Cidadão
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 38,
                lineHeight: 0.95,
                fontWeight: 900,
                letterSpacing: '-0.04em',
              }}
            >
              Bronca ativa
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#c41f1f',
            color: '#fff',
            borderRadius: 999,
            padding: '14px 22px',
            fontWeight: 900,
            fontSize: 20,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            boxShadow: '0 14px 24px rgba(0,0,0,0.18)',
          }}
        >
          Denúncia
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 300,
          bottom: 68,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              maxWidth: 900,
              fontSize: 86,
              lineHeight: 0.94,
              fontWeight: 900,
              letterSpacing: '-0.05em',
              whiteSpace: 'pre-line',
              textShadow: baseTextShadow,
            }}
          >
            {titleLines.join('\n')}
          </div>

          <div
            style={{
              marginTop: 28,
              background: 'rgba(255,255,255,0.90)',
              color: '#111',
              borderRadius: 24,
              padding: '20px 22px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 18px 30px rgba(0,0,0,0.20)',
            }}
          >
            <MapPin size={28} color="#c41f1f" />
            <span style={{ fontSize: 29, fontWeight: 800, lineHeight: 1.25 }}>
              {address}
            </span>
          </div>
        </div>

        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: qrCodeUrl && showQRCode ? '1fr 190px' : '1fr',
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,0.66)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 24,
                padding: '22px 24px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.10em',
                  color: 'rgba(255,255,255,0.72)',
                }}
              >
                Apoio público
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 52,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '-0.05em',
                }}
              >
                {upvotes}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 24,
                  lineHeight: 1.3,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.84)',
                }}
              >
                {supportText}
              </div>
            </div>

            {qrCodeUrl && showQRCode ? (
              <div
                style={{
                  background: 'rgba(255,255,255,0.94)',
                  borderRadius: 24,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={qrCodeUrl}
                  alt="QR Code da bronca"
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16 }}
                />
              </div>
            ) : null}
          </div>

          <CTAFooterEditorial />
        </div>
      </div>
    </div>
  );
}

function StoryTemplateMinimal({ report, qrCodeUrl, coverPhotoUrl, showQRCode = true }) {
  const titleLines = splitHeadline(report?.title, 20, 3);
  const address = getShortAddress(report?.address);
  const upvotes = Number(report?.upvotes || 0);
  const supportText = getSupportText(upvotes);

  return (
    <div
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background: '#101114',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
      }}
    >
      <BackgroundPhoto coverPhotoUrl={coverPhotoUrl} dark={0.42} scale={1.03} />

      <div
        style={{
          position: 'absolute',
          inset: 32,
          borderRadius: 0,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
          backdropFilter: 'blur(6px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 72,
          left: 70,
          right: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 0,
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 14px 28px rgba(0,0,0,0.12)',
            }}
          >
            <img src="/logo.png" style={{ width: 44, height: 44, objectFit: 'contain' }} alt="Logo" />
          </div>

          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.68)',
              }}
            >
              Trombone Cidadão
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 34,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
              }}
            >
              Bronca ativa
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderRadius: 0,
            background: 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.14)',
            fontSize: 18,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Story
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 74,
          right: 74,
          top: 320,
          bottom: 74,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 88,
              lineHeight: 0.92,
              fontWeight: 900,
              letterSpacing: '-0.06em',
              whiteSpace: 'pre-line',
              textShadow: baseTextShadow,
              maxWidth: 860,
            }}
          >
            {titleLines.join('\n')}
          </div>

          <div
            style={{
              marginTop: 26,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              borderRadius: 0,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.14)',
              padding: '16px 20px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <MapPin size={26} color="#ff5757" />
            <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
              {address}
            </span>
          </div>
        </div>

        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: qrCodeUrl && showQRCode ? '1fr 190px' : '1fr',
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                borderRadius: 0,
                background: 'rgba(255,255,255,0.11)',
                border: '1px solid rgba(255,255,255,0.14)',
                padding: '22px 24px',
                backdropFilter: 'blur(14px)',
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.66)',
                }}
              >
                Apoio público
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 52,
                  lineHeight: 1,
                  fontWeight: 900,
                  letterSpacing: '-0.05em',
                }}
              >
                {upvotes}
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 24,
                  lineHeight: 1.3,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.84)',
                }}
              >
                {supportText}
              </div>
            </div>

            {qrCodeUrl && showQRCode ? (
              <div
                style={{
                  borderRadius: 0,
                  background: 'rgba(255,255,255,0.94)',
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={qrCodeUrl}
                  alt="QR Code da bronca"
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: 'auto', borderRadius: 0, display: 'block' }}
                />
              </div>
            ) : null}
          </div>

          <CTAFooterMinimal />
        </div>
      </div>
    </div>
  );
}

function StoryTemplateInstagram({ report, coverPhotoUrl, bgStyle, enableImageEffect = true }) {
  const title = report?.title || '';
  const titleLines = splitHeadline(title, 20, 6);
  const address = report?.address || '';
  
  // Play Store URL for QR Code
  const playStoreUrl = "https://play.google.com/store/apps/details?id=com.trombonecidadao.app&pcampaignid=web_share";
  const qrCodePlayStore = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(playStoreUrl)}`;

  return (
    <div
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
        ...bgStyle,
      }}
    >
      {/* Header with Logo and Megaphone */}
       <div
         style={{
           position: 'absolute',
           top: 120,
           left: 0,
           right: 0,
           display: 'flex',
           flexDirection: 'row',
           alignItems: 'center',
           justifyContent: 'center',
           gap: 20,
         }}
       >
         
          <img src="/logo.png" style={{ width: 196, height: 196, objectFit: 'contain' }} alt="Logo" />
         <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 68, fontWeight: 900, color: '#d52407', lineHeight: 1, letterSpacing: '-0.02em', textShadow: '0 4px 8px rgba(0,0,0,0.3)' }}>TROMBONE</span>
            <span style={{ fontSize: 68, fontWeight: 900, color: '#ffd20c', lineHeight: 1, letterSpacing: '-0.02em', textShadow: '0 4px 8px rgba(0,0,0,0.3)' }}>CIDADÃO</span>
         </div>
       </div>

      {/* Main Content Area */}
      <div
        style={{
          position: 'absolute',
          top: 420,
          left: 60,
          right: 60,
          bottom: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 72,
            lineHeight: 1.05,
            fontWeight: 900,
            textAlign: 'center',
            textTransform: 'uppercase',
            color: '#eceade',
            textShadow: '0 4px 12px rgba(0,0,0,0.5)',
            marginBottom: 120,
            width: '100%',
            maxWidth: 960,
          }}
        >
          {titleLines.join('\n')}
        </div>

        {/* Image Box */}
          {coverPhotoUrl && (
            <div
              style={{
                width: '100%',
                aspectRatio: '16/9',
                borderRadius: enableImageEffect ? 4 : 12,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                border: enableImageEffect ? '1px solid rgba(255,255,255,0.05)' : '4px solid rgba(255,255,255,0.15)',
                marginBottom: 40,
                // WebkitMaskImage and MaskImage to fade edges
                WebkitMaskImage: enableImageEffect ? 'radial-gradient(ellipse at center, black 60%, transparent 100%)' : 'none',
                maskImage: enableImageEffect ? 'radial-gradient(ellipse at center, black 60%, transparent 100%)' : 'none',
              }}
            >
              <img 
                src={coverPhotoUrl} 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  filter: enableImageEffect ? 'contrast(1.1) brightness(0.8) saturate(0.85) sepia(0.1)' : 'none', 
                  mixBlendMode: enableImageEffect ? 'lighten' : 'normal',
                }} 
                alt="Report" 
              />
              
              {/* Grunge / Vignette Overlay */}
              {enableImageEffect && (
                <div 
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at center, transparent 20%, rgba(0,0,0,0.6) 100%)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              
              {/* Texture Overlay */}
              {enableImageEffect && (
                <div 
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.25,
                    backgroundImage: 'url("https://www.transparenttextures.com/patterns/p6.png")', 
                    mixBlendMode: 'overlay',
                    pointerEvents: 'none',
                  }}
                />
              )}
              
              {/* Inner Glow */}
              {enableImageEffect && (
                <div 
                  style={{
                    position: 'absolute',
                    inset: 0,
                    boxShadow: 'inset 0 0 80px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          )}

        {/* Location Tag - Outside Image */}
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
                flexShrink: 0
              }}
            />
            <span 
              style={{ 
                fontSize: 44, 
                fontWeight: 900, 
                color: '#eceade', 
                textTransform: 'uppercase',
                textShadow: '0 4px 12px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6)',
                letterSpacing: '0.02em',
                textAlign: 'center',
              }}
            >
              {getCityFromAddress(address, report)}
            </span>
          </div>
        )}

        {/* Spacer for layout */}
        <div style={{ flex: 1 }} />

        {/* Footer Box */}
        <div
          style={{
            width: '100%',
            backgroundColor: 'transparent',
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
          {/* Decorative red lines like reference */}
          <div style={{ position: 'absolute', bottom: -10, right: -10, width: 400, height: 15, background: '#FF3B30', transform: 'rotate(-15deg)', opacity: 0.6, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 10, right: -10, width: 400, height: 10, background: '#FF3B30', transform: 'rotate(-15deg)', opacity: 0.4, pointerEvents: 'none' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, flex: 1, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
               <div 
                 style={{ 
                   backgroundColor: '#c41f1f', 
                   width: 110, 
                   height: 110, 
                   borderRadius: '50%', 
                   display: 'flex', 
                   alignItems: 'center', 
                   justifyContent: 'center',
                   flexShrink: 0,
                   boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                 }}
               >
                  <img src="/card-instagram/like-svgrepo-com (1).svg" style={{ width: 75, height: 75 }} alt="Like" />
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                  <div>
                    <span style={{ fontSize: 38, fontWeight: 900, color: '#ffd20c', letterSpacing: '0.02em' }}>BAIXE O APP</span>
                    <span style={{ fontSize: 32, fontWeight: 600, color: '#eceade', marginLeft: 10 }}>E CADASTRE</span>
                  </div>
                  <span style={{ fontSize: 32, fontWeight: 600, color: '#eceade' }}>SUA BRONCA TAMBÉM</span>
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
                backgroundImage: 'linear-gradient(180deg, #ffd20c 0%, #f4ca14 100%)',
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
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
            }}
          >
            <img src={qrCodePlayStore} alt="QR Code Play Store" style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const StoryRenderer = React.forwardRef(function StoryRenderer(
  { layout, report, qrCodeUrl, coverPhotoUrl, showQRCode = true, primaryColor = '#e52a2a', imageMode = 'background', bgStyle, enableImageEffect = true },
  ref
) {
  const commonStyle = {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
  };

  return (
    <div ref={ref} style={commonStyle}>
      {layout === 'instagram' ? (
        <StoryTemplateInstagram report={report} coverPhotoUrl={coverPhotoUrl} bgStyle={bgStyle} enableImageEffect={enableImageEffect} />
      ) : layout === 'editorial' ? (
        <StoryTemplateEditorial report={report} qrCodeUrl={qrCodeUrl} coverPhotoUrl={coverPhotoUrl} showQRCode={showQRCode} />
      ) : layout === 'minimal' ? (
        <StoryTemplateMinimal report={report} qrCodeUrl={qrCodeUrl} coverPhotoUrl={coverPhotoUrl} showQRCode={showQRCode} />
      ) : (
        <StoryTemplateUrgent 
          report={report} 
          qrCodeUrl={qrCodeUrl} 
          coverPhotoUrl={coverPhotoUrl} 
          showQRCode={showQRCode} 
          primaryColor={primaryColor}
          imageMode={imageMode}
        />
      )}
    </div>
  );
});

const layoutOptions = [
  {
    value: 'instagram',
    label: 'Instagram',
    description: 'Layout oficial para stories do Instagram',
  },
  /* {
    value: 'urgent',
    label: 'Urgente',
    description: 'Mais forte, urbano e chamativo',
  }, */
];

const PRESET_COLORS = [
  { label: 'Vermelho', value: '#e52a2a' },
  { label: 'Amarelo', value: '#f4c430' },
  { label: 'Laranja', value: '#ea580c' },
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
  const [showQRCode, setShowQRCode] = useState(true);
  const [imageMode, setImageMode] = useState('background'); // 'background', 'boxed', 'none'
  const [primaryColor, setPrimaryColor] = useState('#e52a2a');
  const [enableImageEffect, setEnableImageEffect] = useState(true);

  // New Background states
  const [bgType, setBgType] = useState('default'); // 'default', 'second', 'third', 'color'
  const [customBgColor, setCustomBgColor] = useState('#111111');

  const currentBgStyle = useMemo(() => {
    if (bgType === 'color') return { backgroundColor: customBgColor };
    let bgUrl = '/card-instagram/bg-stories.png';
    if (bgType === 'second') bgUrl = '/card-instagram/bg-second.png';
    if (bgType === 'third') bgUrl = '/card-instagram/bg-third.png';
    
    return { 
      backgroundImage: `url(${bgUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }, [bgType, customBgColor]);

  const safeTitle = useMemo(
    () => getSafeFilename(report?.title || 'trombone-cidadao'),
    [report?.title]
  );

  const handleDownload = useCallback(async () => {
    if (!exportRef.current || downloading) return;

    try {
      setDownloading(true);
      // Give it a moment to ensure images are loaded
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2, // Good quality for Instagram
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        canvasWidth: STORY_WIDTH,
        canvasHeight: STORY_HEIGHT,
        backgroundColor: imageMode === 'none' ? null : '#111111',
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
  }, [layout, safeTitle, downloading, showQRCode, primaryColor, imageMode]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[95vh] sm:h-[90vh] lg:h-[85vh] p-0 flex flex-col overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-4 sm:p-6 border-b bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Instagram className="text-pink-600" size={24} />
            <DialogTitle className="text-xl sm:text-2xl font-black">Criar Story para Instagram</DialogTitle>
          </div>
          <DialogDescription className="text-xs sm:text-sm hidden xs:block">
            Escolha um estilo visual e baixe o card otimizado para os stories.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto lg:overflow-hidden p-4 sm:p-6 lg:p-4 bg-gray-50/30 no-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4 sm:gap-8 lg:gap-4 h-full">
            {/* Sidebar de Opções */}
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
                        <div className={`p-1 sm:p-2 rounded-lg transition-colors ${active ? 'bg-tc-red text-white' : 'bg-muted text-muted-foreground'}`}>
                          <LayoutTemplate size={14} className="sm:w-5 sm:h-5 lg:w-4 lg:h-4" />
                        </div>
                        <div className='flex flex-col min-w-0'>
                          <div className={`font-bold text-[10px] sm:text-sm lg:text-xs flex items-center gap-1 sm:gap-2 lg:gap-1 truncate ${active ? 'text-tc-red' : 'text-foreground'}`}>
                            {item.label}
                            {active && <Check size={10} className="text-tc-red sm:w-3.5 sm:h-3.5 lg:w-3 lg:h-3 flex-shrink-0" />}
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
                        onClick={() => setBgType('default')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'default' ? 'border-tc-red bg-tc-red/5 text-tc-red' : 'border-gray-200 bg-white'
                        }`}
                      >
                        Padrão
                      </button>

                      <button
                        onClick={() => setBgType('second')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'second' ? 'border-tc-red bg-tc-red/5 text-tc-red' : 'border-gray-200 bg-white'
                        }`}
                      >
                        Mapa Azul
                      </button>

                      <button
                        onClick={() => setBgType('third')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold ${
                          bgType === 'third' ? 'border-tc-red bg-tc-red/5 text-tc-red' : 'border-gray-200 bg-white'
                        }`}
                      >
                        Perigo
                      </button>
                      
                      <button
                        onClick={() => setBgType('color')}
                        className={`p-2.5 rounded-xl border-2 transition-all text-[10px] font-bold flex items-center justify-between ${
                          bgType === 'color' ? 'border-tc-red bg-tc-red/5 text-tc-red' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <span>Cor</span>
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
                      <span className="text-[10px]">Suavizar Imagem</span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${enableImageEffect ? 'bg-tc-red' : 'bg-gray-200'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${enableImageEffect ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {(layout === 'urgent') && (
                <div className="pt-2 sm:pt-2 border-t border-gray-100 sm:border-none">
                  <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 sm:mb-3">
                    Cor do Card
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3 px-1">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setPrimaryColor(color.value)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          primaryColor === color.value ? 'border-black scale-110 shadow-md' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      />
                    ))}
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(layout === 'urgent') && (
                <div className="pt-2 sm:pt-2 border-t border-gray-100 sm:border-none space-y-4">
                  <div>
                    <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 sm:mb-3">
                      Estilo da Imagem
                    </h3>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { value: 'background', label: 'Imagem de Fundo' },
                        { value: 'boxed', label: 'Imagem Abaixo do Título' },
                        { value: 'none', label: 'Fundo Transparente' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setImageMode(opt.value)}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl border-2 transition-all text-left ${
                            imageMode === opt.value 
                              ? 'border-tc-red bg-tc-red/5 text-tc-red font-bold' 
                              : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          <span className="text-[10px] sm:text-xs">{opt.label}</span>
                          {imageMode === opt.value && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] xl:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 sm:mb-3">
                      Outros Ajustes
                    </h3>
                    <button
                      onClick={() => setShowQRCode(!showQRCode)}
                      className={`w-full flex items-center justify-between p-2 sm:p-3 rounded-xl border-2 transition-all ${
                        showQRCode 
                          ? 'border-tc-red bg-tc-red/5 text-tc-red font-bold' 
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <QrCode size={16} />
                        <span className="text-[10px] sm:text-xs">Incluir QR Code</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${showQRCode ? 'bg-tc-red' : 'bg-gray-200'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showQRCode ? 'right-0.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Área de Preview */}
            <div className="flex flex-col gap-3 sm:gap-4 lg:gap-2 h-full min-w-0">
              <div className="bg-muted/30 rounded-2xl p-2 sm:p-4 lg:p-2 flex items-center justify-center border border-dashed border-muted-foreground/20 overflow-hidden h-[360px] xs:h-[400px] sm:h-[480px] lg:h-[350px] xl:h-[480px] flex-shrink-0 relative group">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/80 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <Instagram size={12} className="text-pink-500" />
                  Visualização 1080x1920
                </div>

                {/* Viewport de Tamanho Controlado (CSS Layout Size) */}
                <div className="w-[172px] h-[307px] sm:w-[216px] sm:h-[384px] md:w-[237px] md:h-[422px] lg:w-[162px] lg:h-[288px] xl:w-[216px] xl:h-[384px] relative flex-shrink-0 shadow-[0_40px_100px_rgba(0,0,0,0.4)] transition-all">
                  <div 
                    className="absolute top-0 left-0 w-[1080px] h-[1920px] origin-top-left !scale-[0.159] sm:!scale-[0.20] md:!scale-[0.22] lg:!scale-[0.15] xl:!scale-[0.20]"
                    style={{
                      transform: 'scale(0.159)', // Proporção exata para o viewport (172/1080)
                    }}
                    // Escalas exatas para cada breakpoint para preencher o viewport definido acima
             
                  >
                    <div className="w-full h-full relative overflow-hidden bg-black">
                      <StoryRenderer
                        layout={layout}
                        report={report}
                        qrCodeUrl={qrCodeUrl}
                        coverPhotoUrl={coverPhotoUrl}
                        showQRCode={showQRCode}
                        primaryColor={primaryColor}
                        imageMode={imageMode}
                        bgStyle={currentBgStyle}
                        enableImageEffect={enableImageEffect}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-6 lg:p-4 border-t bg-white flex flex-row items-center justify-between gap-3 flex-shrink-0">
          <Button variant="ghost" onClick={onClose} className="h-10 sm:h-12 lg:h-10 px-4 sm:px-8 lg:px-4 font-bold">
            Cancelar
          </Button>
          <Button 
            onClick={handleDownload} 
            disabled={downloading}
            className="bg-tc-red hover:bg-tc-red/90 text-white gap-2 h-10 sm:h-12 lg:h-10 px-6 sm:px-8 lg:px-6 font-bold shadow-lg shadow-tc-red/20 flex-1 sm:flex-none"
          >
            {downloading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Download size={18} />
            )}
            {downloading ? 'Gerando...' : 'Baixar para Instagram'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Hidden export div */}
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
          layout={layout}
          report={report}
          qrCodeUrl={qrCodeUrl}
          coverPhotoUrl={coverPhotoUrl}
          showQRCode={showQRCode}
          primaryColor={primaryColor}
          imageMode={imageMode}
          bgStyle={currentBgStyle}
          enableImageEffect={enableImageEffect}
          // secondaryColor={secondaryColor}
        />
      </div>
    </Dialog>
  );
};

export default ReportStoryModal;