import React, { forwardRef } from 'react';
import { getWorkDelayMetric } from '@/lib/workDelayMetric';

export const DELAY_STORY_MODELS = [
  { id: 'impacto', name: 'Cartaz', accent: '#ffd20c' },
  { id: 'editorial', name: 'Relógio', accent: '#dc2626' },
  { id: 'alerta', name: 'Contagem', accent: '#ffd20c' },
];
export const DELAY_STORY_THEMES = {
  light: { background: '#f7f7f8', ink: '#18181b', muted: '#52525b', panel: '#fffffff2', red: '#c21e26' },
  dark: { background: '#151316', ink: '#ffffff', muted: '#d4d4d8', panel: '#151316eb', red: '#ef3025' },
};
const YELLOW = '#ffd20c';
const display = { fontFamily: "'TromboneStory', Impact, 'Arial Narrow', sans-serif", fontWeight: 400, textTransform: 'uppercase' };
const clamp = lines => ({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden', overflowWrap: 'anywhere' });

function Brush({ color, children, style }) {
  return <div style={{ position: 'relative', padding: '9px 26px 14px', isolation: 'isolate', ...style }}>
    <svg width="100%" height="100%" viewBox="0 0 500 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -1 }}>
      <path d="M8 8L88 4l-9 4L478 1l-8 7 27-1-10 8 13 3-12 10 8 5-8 8 10 5-12 12 10 7-15 8 6 5-30 6 19 3L16 98l12-8-27 2 12-11-10-8 9-12-9-6 11-13-8-7 11-10-13-4 14-7z" fill={color} />
    </svg>{children}
  </div>;
}

function Stopwatch({ color = YELLOW, size = 440, full = false }) {
  return <svg width={size} height={size * 1.12} viewBox="0 0 440 493" fill="none" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M200 35h45M222 37v28M350 98l22-25" stroke={color} strokeWidth="19" strokeLinecap="round" />
    <circle cx="220" cy="276" r="192" stroke={color} strokeWidth="17" />
    {Array.from({ length: 12 }, (_, i) => <path key={i} d="M220 107v22" stroke={color} strokeWidth="9" strokeLinecap="round" transform={`rotate(${i * 30} 220 276)`} />)}
    {full && <path d="M220 165v111l70 41" stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.2" />}
    <path d="M45 37L20 13M77 24L67 0M17 76L0 70" stroke={color} strokeWidth="10" strokeLinecap="round" />
  </svg>;
}

// Fundo próprio de obras: foto pública da obra ou desenho de estrutura em código.
// Nenhum fundo de bronca ou patrulha é utilizado. Imagens chegam em data URI.
function WorkBackground({ photoUrl, dark }) {
  return <>
    {photoUrl ? <img data-story-photo src={photoUrl} alt="Foto da obra" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg data-story-fallback width="1080" height="1920" viewBox="0 0 1080 1920" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <rect width="1080" height="1920" fill={dark ? '#292327' : '#d9d6d1'} />
      <g stroke={dark ? '#8e7770' : '#9c9289'} fill="none" strokeWidth="7" opacity="0.65">
        <path d="M600 1700V600h85v1100M950 1700V350h85v1350M120 1750V960h70v790M0 1040l1080-360M0 1260l1080-260M0 1480l1080-160M80 920l1000-400M620 595v-125M640 590v-135M665 580v-140M966 350V220M990 350V200M1015 350V210M180 960l465-300M190 1270l465-260M650 1000l340-200M650 1310l340-130M190 1500l465-180" />
        <path d="M815 1550V850M750 900h160M750 1100h160M750 1300h160M750 1500h160" stroke="#cf8b4a" strokeWidth="4" />
      </g>
    </svg>}
    <div style={{ position: 'absolute', inset: 0, background: dark ? 'linear-gradient(180deg,#080a0deb 0%,#080a0dc7 31%,#080a0d3d 55%,#080a0d77 77%,#080a0dcc 100%)' : 'linear-gradient(180deg,#f7f7f8f5 0%,#f7f7f8df 32%,#f7f7f84d 56%,#f7f7f8a8 78%,#f7f7f8ed 100%)' }} />
  </>;
}

const ObraDelayStoryCard = forwardRef(function ObraDelayStoryCard({
  model = 'impacto', appearance = 'dark', computed, timeUnit = 'days', title, phaseName, qrCode, logoUrl, photoUrl,
}, ref) {
  const colors = DELAY_STORY_THEMES[appearance] || DELAY_STORY_THEMES.dark;
  const dark = appearance === 'dark';
  const { number, label: metricLabel } = getWorkDelayMetric(computed, timeUnit);
  const singleDigit = /^\d$/.test(number);
  const numberSize = number.length > 6 ? 160 : number.length > 4 ? 250 : 430;
  const clockColor = dark ? YELLOW : '#c21e26';
  const phaseTitle = String(phaseName || '').trim();
  const displayPhaseName = /^(?:fase|etapa)(?:\s+atual)?$/iu.test(phaseTitle) ? '' : phaseTitle;

  return <div ref={ref} data-story-model={model} data-story-appearance={appearance} style={{ width: 1080, height: 1920, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', background: colors.background, color: colors.ink, fontFamily: "'InterVar', 'Segoe UI', system-ui, sans-serif" }}>
    <WorkBackground photoUrl={photoUrl} dark={dark} />
    <div style={{ position: 'absolute', top: 154, left: 64, right: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {logoUrl && <img data-story-logo src={logoUrl} alt="Logo Trombone Cidadão" width="130" height="130" style={{ objectFit: 'contain' }} />}
        <div style={{ fontSize: 43, fontWeight: 900, letterSpacing: -1, lineHeight: 1.04 }}><div style={{ color: dark ? '#ff3027' : '#c21e26' }}>TROMBONE</div><div style={{ color: dark ? YELLOW : '#18181b' }}>CIDADÃO</div></div>
      </div>
      <div style={{ width: 2, height: 82, background: dark ? '#ffffff88' : '#18181b66' }} />
      <Brush color={YELLOW} style={{ color: '#111111', ...display, fontSize: 43, whiteSpace: 'nowrap', transform: 'rotate(-2deg)' }}>OBRAS PÚBLICAS</Brush>
    </div>
    <div style={{ position: 'absolute', top: 352, left: 64, right: 54 }}>
      <div data-story-title style={{ fontSize: title?.length > 110 ? 54 : 64, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1.4, color: colors.ink, ...clamp(3) }}>{title || 'Obra pública'}</div>
    </div>
    <div style={{ position: 'absolute', top: 700, left: 54, right: 54, height: 490, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {model === 'impacto' ? <div data-story-timer-group style={{ position: 'relative', display: singleDigit ? 'block' : 'flex', width: singleDigit ? 480 : undefined, height: singleDigit ? 480 * 1.12 : undefined, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: singleDigit ? 480 : 415, flexShrink: 0 }}><Stopwatch size={singleDigit ? 480 : 415} color={clockColor} /></div>
        <div data-story-metric style={{ ...display, position: singleDigit ? 'absolute' : 'relative', left: singleDigit ? '50%' : undefined, top: singleDigit ? 480 * 276 / 440 : undefined, transform: singleDigit ? 'translate(-50%, -50%)' : undefined, marginLeft: singleDigit ? 0 : -150, fontSize: singleDigit ? 330 : numberSize, lineHeight: 1.05, letterSpacing: singleDigit ? 0 : -12, color: colors.ink, textShadow: dark ? '0 10px 30px #00000088' : '0 6px 20px #ffffff88' }}>{number}</div>
        <Brush color="#d91f26" style={{ position: 'absolute', top: singleDigit ? -74 : -18, right: singleDigit ? undefined : 0, left: singleDigit ? '50%' : undefined, color: '#ffffff', ...display, fontSize: singleDigit ? 48 : 60, whiteSpace: 'nowrap', transform: singleDigit ? 'translateX(-50%) rotate(-5deg)' : 'rotate(-9deg)', zIndex: 2 }}>ATRASÔMETRO</Brush>
      </div> : <>
      <div data-story-timer-group style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: model === 'editorial' ? -35 : -15, opacity: model === 'alerta' ? 0.24 : 1 }}><Stopwatch size={model === 'editorial' ? 510 : 415} color={clockColor} full={model === 'editorial'} /></div>
      <Brush color="#d91f26" style={{ position: 'absolute', top: -18, right: 70, color: '#ffffff', ...display, fontSize: 60, transform: 'rotate(-9deg)', zIndex: 2 }}>ATRASÔMETRO</Brush>
      {model === 'alerta' ? <div data-story-metric style={{ position: 'absolute', left: 28, right: 28, top: 105, display: 'flex', justifyContent: 'center', gap: 12 }}>
        {number.split('').map((digit, index) => <div key={index} style={{ ...display, minWidth: 0, flex: 1, maxWidth: 230, textAlign: 'center', padding: '0 0 18px', borderRadius: 20, background: dark ? '#171316ed' : '#fffffff0', boxShadow: '0 12px 25px #00000044', color: colors.ink, fontSize: number.length > 5 ? 140 : 270, lineHeight: 1.1, border: `1px solid ${dark ? '#ffffff44' : '#18181b44'}` }}>{digit}</div>)}
      </div> : <div data-story-metric style={{ ...display, position: 'absolute', left: 0, right: 0, top: 38, textAlign: 'center', fontSize: numberSize, lineHeight: 1.05, letterSpacing: -12, color: colors.ink, textShadow: dark ? '0 10px 30px #00000088' : '0 6px 20px #ffffff88' }}>{number}</div>}
      </>}
    </div>
    <div style={{ position: 'absolute', top: 1220, left: 80, right: 80, display: 'flex', justifyContent: 'center' }}>
      <Brush color={YELLOW} style={{ ...display, color: '#111111', textAlign: 'center', fontSize: 77, lineHeight: 1.05, width: '100%' }}>{metricLabel}</Brush>
    </div>
    <div style={{ position: 'absolute', top: 1500, left: 80, right: 80, minHeight: 94, padding: '25px 30px', boxSizing: 'border-box', borderRadius: 24, background: colors.panel, border: `1px solid ${dark ? '#ffffff33' : '#18181b22'}`, boxShadow: '0 12px 30px #00000022', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, fontSize: 29, color: colors.muted }}>
      <span style={{ flexShrink: 0 }}>Previsão: <strong style={{ color: colors.ink }}>{computed.expectedDateText}</strong></span>
      {displayPhaseName && <><span style={{ color: dark ? YELLOW : '#c21e26' }}>•</span><span style={{ minWidth: 0, ...clamp(1) }}>Etapa: <strong style={{ color: colors.ink }}>{displayPhaseName}</strong></span></>}
    </div>
    <div style={{ position: 'absolute', top: 1680, left: 0, right: 0, height: 240, background: YELLOW, color: '#111111', padding: '26px 64px', boxSizing: 'border-box', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <Brush color="#d91f26" style={{ ...display, color: '#ffffff', fontSize: 60, lineHeight: 1.1 }}>ACOMPANHE ESSA OBRA</Brush>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 13 }}>trombonecidadao.com.br</div>
      </div>
      {qrCode && <img data-story-qr src={qrCode} alt="QR Code da obra" width="154" height="154" style={{ flexShrink: 0, borderRadius: 10, marginTop: 2 }} />}
    </div>
  </div>;
});

export default ObraDelayStoryCard;
