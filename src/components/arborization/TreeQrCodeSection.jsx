import React, { useEffect, useState } from 'react';
import { Download, Loader2, QrCode, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { treeQrCodeUrl } from '@/lib/treeQrCodeUrl';

export default function TreeQrCodeSection({ tree, cityName, downloading, onDownload }) {
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const url = treeQrCodeUrl(tree);
  useEffect(() => {
    let active = true;
    setImage(''); setFailed(false);
    import('qrcode').then(module => (module.default || module).toDataURL(url, { width: 384, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#123b2c', light: '#ffffff' } }))
      .then(value => { if (active) setImage(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [url, revision]);
  return <section className="tree-profile-qr-section" id="tree-qr-section" tabIndex={-1} aria-labelledby="tree-qr-title" data-testid="tree-profile-qr-section">
    <div className="tree-profile-qr-preview"><figure className="tree-profile-qr-plate">
      <div className="tree-profile-qr-plate-heading"><Trees size={18} /><span>ÁRVORE DA CIDADE</span></div>
      <div className="tree-profile-qr-image">{image ? <img src={image} alt={`QR Code de acesso à ficha de ${tree.common_name}`} width="192" height="192" data-url={url} /> : failed ? <div role="alert"><QrCode size={32} /><p>Não foi possível carregar a prévia.</p><Button type="button" variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div> : <Loader2 className="animate-spin" aria-label="Carregando QR Code" />}</div>
      <figcaption><strong>{tree.common_name || 'Árvore não identificada'}</strong>{tree.public_code && <span>{tree.public_code}</span>}<small>{[cityName, tree.neighborhood].filter(Boolean).join(' · ')}</small></figcaption>
    </figure></div>
    <div className="tree-profile-qr-content"><span className="tree-profile-qr-eyebrow"><QrCode size={17} />Identificação e acesso</span><h2 id="tree-qr-title">QR Code desta árvore</h2>
      <p>Identifique esta árvore no local e facilite o acesso às informações do inventário. Quem escanear o código poderá consultar esta ficha, a localização e os cuidados registrados.</p>
      <div className="tree-profile-qr-print-info"><span>PDF A5</span><span>Pronto para impressão</span></div>
      <Button type="button" disabled={downloading} onClick={onDownload} aria-label="Baixar QR Code da árvore em PDF">{downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}{downloading ? 'Gerando PDF…' : 'Baixar PDF para impressão'}</Button>
      <small>A prévia e o PDF levam à mesma ficha pública da árvore.</small>
    </div>
  </section>;
}
