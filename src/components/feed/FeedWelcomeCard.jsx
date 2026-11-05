import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import FeedQuickActions from '@/components/feed/FeedQuickActions';

export default function FeedWelcomeCard({ cityName, cityImage, onCreateReport }) {
  const [failedImage, setFailedImage] = useState(null);
  const hasImage = Boolean(cityImage && cityImage !== failedImage);
  return (
    <section className={`feed-welcome ${hasImage ? 'feed-welcome-photo' : ''}`} aria-labelledby="feed-welcome-title" data-testid="feed-welcome">
      <div className="feed-welcome-cover">
        {hasImage && <><img key={cityImage} src={cityImage} alt="" className="feed-city-photo" decoding="async" onError={() => setFailedImage(cityImage)} data-testid="feed-city-photo" /><div className="feed-city-shade" aria-hidden="true" /></>}
        <div className="feed-city-toolbar">
        <h1 id="feed-welcome-title" className="feed-welcome-title">{cityName || 'Todas as cidades'}</h1>
        <nav className="feed-header-actions" aria-label="Participação e acompanhamento">
          <Link to="/seguindo" className="feed-following-link" aria-label="Acompanhando" title="Acompanhando">
            <Bookmark className="h-5 w-5 shrink-0" aria-hidden="true" />
          </Link>
        </nav>
        </div>
      </div>
      <FeedQuickActions onCreateReport={onCreateReport} />
    </section>
  );
}
