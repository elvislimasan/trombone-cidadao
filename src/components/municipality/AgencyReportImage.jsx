import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { agencyReportImages } from '@/lib/agencyPanel';

export default function AgencyReportImage({ report, compact = false }) {
  const [failedUrls, setFailedUrls] = useState([]);
  const src = agencyReportImages(report).find((url) => !failedUrls.includes(url));
  const size = compact ? 'h-20 w-[5.5rem] rounded-xl border' : 'h-56 w-full md:h-full md:min-h-56';

  if (!src) return <div className={`flex items-center justify-center bg-surface-subtle ${size}`} aria-label="Foto indisponível">
    <Building2 className={compact ? 'h-5 w-5 text-content-tertiary' : 'h-10 w-10 text-content-tertiary/50'} />
  </div>;

  return <img key={src} src={src} alt={compact ? '' : `Foto da bronca: ${report?.title || 'Local da ocorrência'}`} loading={compact ? 'lazy' : 'eager'} decoding="async" className={`block object-cover ${size}`} onError={() => setFailedUrls((urls) => urls.includes(src) ? urls : [...urls, src])} />;
}
