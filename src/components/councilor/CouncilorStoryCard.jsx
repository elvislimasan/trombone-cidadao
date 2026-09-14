import { forwardRef } from 'react';
import { STORY_HEIGHT, STORY_WIDTH } from '@/hooks/useStoryExport';

const RED = '#ef2b36';
const GOLD = '#fbbf24';

const Stat = ({ value, label, accent = RED }) => (
  <div style={{ flex: 1, minHeight: 180, display: 'flex', alignItems: 'center', borderRadius: 34, padding: '28px 34px', background: 'rgba(5,8,17,.78)', border: `2px solid ${accent}88`, boxShadow: `0 20px 55px ${accent}18` }}>
    <strong style={{ minWidth: 122, color: GOLD, fontSize: 88, lineHeight: 1, fontWeight: 950, letterSpacing: '-.055em' }}>{value}</strong>
    <span style={{ alignSelf: 'stretch', width: 2, margin: '0 29px 0 18px', background: `${accent}88` }} />
    <span style={{ color: 'rgba(255,255,255,.9)', fontSize: 29, lineHeight: 1.12, fontWeight: 850 }}>{label}</span>
  </div>
);

const CouncilorStoryCard = forwardRef(function CouncilorStoryCard({ councilor, cityName, streetCount, reportCount, streetNames = [], shareUrl, photoUrl, logoUrl, backgroundUrl }, ref) {
  const initials = String(councilor?.name || 'V').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const officeStatus = councilor?.is_in_office === true ? 'EM EXERCÍCIO' : councilor?.is_in_office === false ? 'FORA DO EXERCÍCIO' : '';
  const councilorFirstName = String(councilor?.name || '').trim().split(/\s+/)[0];
  const councilorDisplayName = councilor?.nickname || councilorFirstName || 'este vereador';
  const nameLength = String(councilor?.name || '').length;
  const nameFontSize = nameLength > 36 ? 58 : nameLength > 24 ? 66 : 72;
  const profileUrl = String(shareUrl || 'https://trombonecidadao.com.br')
    .replace(/^https?:\/\//, '')
    .replace('/share/vereador/', '/vereadores/')
    .replace(/\/$/, '');

  return (
    <div ref={ref} style={{ width: STORY_WIDTH, height: STORY_HEIGHT, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '72px 62px 64px', color: '#fff', background: 'radial-gradient(82% 39% at 86% 0%,rgba(255,193,7,.82) 0%,rgba(142,98,0,.28) 34%,transparent 72%),radial-gradient(68% 38% at 100% 100%,rgba(147,107,0,.3) 0%,transparent 70%),linear-gradient(145deg,#111620 0%,#050812 54%,#090d16 100%)', fontFamily: "'Inter','Segoe UI',Arial,sans-serif" }}>
      {backgroundUrl && <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: STORY_WIDTH, height: STORY_HEIGHT, objectFit: 'cover' }} />}
      {!backgroundUrl && photoUrl && <img src={photoUrl} alt="" style={{ position: 'absolute', inset: '-40px', width: 1160, height: 2000, objectFit: 'cover', opacity: .08, filter: 'blur(30px) grayscale(.5) saturate(.55)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: backgroundUrl ? 'linear-gradient(180deg,rgba(5,8,18,.03),rgba(5,8,18,.08) 45%,rgba(5,8,18,.24) 100%)' : 'linear-gradient(180deg,rgba(5,8,18,.04),rgba(5,8,18,.48) 43%,rgba(5,8,18,.76) 100%)' }} />
      {!backgroundUrl && <div style={{ position: 'absolute', top: 74, right: 50, width: 220, height: 140, opacity: .46, backgroundImage: 'radial-gradient(#fff 3px,transparent 3px)', backgroundSize: '25px 25px' }} />}
      {!backgroundUrl && <div style={{ position: 'absolute', left: -90, top: 380, width: 300, height: 300, borderRadius: 999, border: '44px solid rgba(251,191,36,.26)' }} />}
      {!backgroundUrl && <div style={{ position: 'absolute', right: -210, bottom: -205, width: 460, height: 460, borderRadius: 999, border: '54px solid rgba(251,191,36,.1)' }} />}

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 17 }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ width: 78, height: 78, objectFit: 'contain' }} />}
          <div style={{ display: 'flex', flexDirection: 'column' }}><strong style={{ fontSize: 32, lineHeight: 1, fontWeight: 950 }}>TROMBONE</strong><strong style={{ marginTop: 4, color: GOLD, fontSize: 32, lineHeight: 1, fontWeight: 950 }}>CIDADÃO</strong></div>
        </div>

        <div style={{ marginTop: 70, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 430, height: 430, padding: 13, boxSizing: 'border-box', borderRadius: 96, background: 'linear-gradient(145deg,#ff5c67,#d7192d)', boxShadow: '0 34px 80px rgba(0,0,0,.48)' }}>
            {photoUrl
              ? <img src={photoUrl} alt="" style={{ width: 404, height: 404, objectFit: 'cover', objectPosition: 'center top', borderRadius: 78, border: '4px solid rgba(255,255,255,.88)', boxSizing: 'border-box' }} />
              : <div style={{ width: 404, height: 404, borderRadius: 78, background: '#b91c2a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid rgba(255,255,255,.88)', boxSizing: 'border-box', fontSize: 126, fontWeight: 950 }}>{initials}</div>}
          </div>
        </div>

        <div style={{ marginTop: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ padding: '10px 28px', borderRadius: 999, color: GOLD, background: 'rgba(239,43,54,.12)', border: '2px solid rgba(239,43,54,.8)', fontSize: 22, fontWeight: 900, letterSpacing: '.2em' }}>PERFIL LEGISLATIVO</div>
          <div style={{ marginTop: 20, maxWidth: 740, fontSize: nameFontSize, lineHeight: .98, fontWeight: 950, letterSpacing: '-.045em', textWrap: 'balance' }}>{councilor?.name}</div>
          <div style={{ marginTop: 18, color: 'rgba(255,255,255,.72)', fontSize: 29, fontWeight: 700 }}>{cityName}{councilor?.party ? `  ·  ${councilor.party}` : ''}</div>
          {officeStatus && <div style={{ marginTop: 18, padding: '11px 25px', borderRadius: 999, color: councilor.is_in_office ? '#bbf7d0' : '#e5e7eb', background: councilor.is_in_office ? 'rgba(34,197,94,.18)' : 'rgba(148,163,184,.18)', border: `2px solid ${councilor.is_in_office ? 'rgba(74,222,128,.45)' : 'rgba(203,213,225,.3)'}`, fontSize: 20, fontWeight: 900, letterSpacing: '.11em' }}>{officeStatus}</div>}
        </div>

        <div style={{ marginTop: 46, display: 'flex', gap: 22 }}>
          <Stat value={streetCount} label={streetCount === 1 ? 'rua registrada no acervo' : 'ruas registradas no acervo'} accent={RED} />
          {reportCount > 0 && <Stat value={reportCount} label={reportCount === 1 ? 'bronca publicada no Trombone' : 'broncas publicadas no Trombone'} accent={GOLD} />}
        </div>

        {streetNames.length > 0 && (
          <div style={{ marginTop: 28, padding: '30px 34px 27px', borderRadius: 30, background: 'rgba(15,21,34,.78)', border: '2px solid rgba(255,255,255,.12)', boxShadow: '0 20px 50px rgba(0,0,0,.18)' }}>
            <div style={{ color: GOLD, fontSize: 20, lineHeight: 1.35, fontWeight: 900, letterSpacing: '.11em', textTransform: 'uppercase' }}>Algumas ruas nomeadas por {councilorDisplayName}</div>
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
              {streetNames.slice(0, 2).map((streetName) => (
                <div key={streetName} style={{ display: 'flex', alignItems: 'center', gap: 17, minWidth: 0 }}>
                  <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 999, background: RED, boxShadow: '0 0 0 8px rgba(239,43,54,.13)' }} />
                  <span style={{ overflow: 'hidden', color: 'rgba(255,255,255,.88)', fontSize: 27, lineHeight: 1.25, fontWeight: 750, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{streetName}</span>
                </div>
              ))}
            </div>
            {streetCount > 2 && <div style={{ marginTop: 24, paddingTop: 21, borderTop: '2px solid rgba(255,255,255,.13)', color: 'rgba(255,255,255,.58)', fontSize: 21, fontWeight: 750 }}>Confira todas na plataforma →</div>}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 34 }} />
        <div style={{ borderTop: '2px solid rgba(255,255,255,.14)', paddingTop: 34 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}><strong style={{ fontSize: 39, lineHeight: 1.15 }}>Conheça a atuação.</strong><span style={{ marginTop: 9, color: GOLD, fontSize: 27, fontWeight: 750 }}>Fiscalize. Participe. Faça sua voz chegar.</span></div>
          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 17, borderRadius: 22, padding: '19px 24px', background: 'rgba(255,255,255,.07)', border: '2px solid rgba(255,255,255,.12)' }}>
            <span style={{ color: RED, fontSize: 29, fontWeight: 950 }}>↗</span>
            <span style={{ minWidth: 0, overflow: 'hidden', color: 'rgba(255,255,255,.78)', fontSize: 22, fontWeight: 750, letterSpacing: '.01em', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileUrl}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CouncilorStoryCard;
