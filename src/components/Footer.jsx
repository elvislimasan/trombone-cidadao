import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { defaultFooterSettings } from '@/config/menuConfig';

const Footer = () => {
  const [footerSettings, setFooterSettings] = useState(defaultFooterSettings);
  const [siteName, setSiteName] = useState('Trombone Cidadão');
  const [logoUrl, setLogoUrl] = useState('/logo.png');

  const fetchFooterSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_config')
      .select('footer_settings, site_name, logo_url')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching footer settings:", error);
    } else if (data) {
      setFooterSettings(data.footer_settings || defaultFooterSettings);
      setSiteName(data.site_name || 'Trombone Cidadão');
      setLogoUrl(data.logo_url || '/logo.png');
    }
  }, []);

  useEffect(() => {
    fetchFooterSettings();
    window.addEventListener('site-settings-updated', fetchFooterSettings);
    return () => {
      window.removeEventListener('site-settings-updated', fetchFooterSettings);
    };
  }, [fetchFooterSettings]);

  const footerStyle = {
    backgroundColor: footerSettings.colors.background,
    color: footerSettings.colors.text,
  };

  const linkStyle = {
    color: footerSettings.colors.link,
  };

  const renderSocialIcon = (platform, url) => {
    const Icon = LucideIcons[platform] || LucideIcons.Link;
    return (
      <a
        key={platform}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        className="hover:opacity-75 transition-opacity"
        aria-label={`Link para ${platform}`}
      >
        <Icon className="w-6 h-6" />
      </a>
    );
  };

  return (
    <footer style={footerStyle} className="py-12 hidden lg:block">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1 space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <img src={logoUrl} alt={siteName} className="h-10 w-auto" />
              <span className="font-bold text-xl">{siteName}</span>
            </Link>
            <p className="text-sm" style={{ color: footerSettings.colors.text }}>
              {footerSettings.description}
            </p>
            <div className="flex items-center space-x-4 pt-2">
              {footerSettings.socialMedia.map(social => social.isVisible && renderSocialIcon(social.platform, social.url))}
            </div>
          </div>

          {footerSettings.linkColumns.map((column, index) => (
            column.isVisible && (
              <div key={index}>
                <p className="font-semibold mb-4" style={{ color: footerSettings.colors.heading }}>{column.title}</p>
                <ul className="space-y-2">
                  {column.links.map((link, linkIndex) => (
                    link.isVisible && (
                      <li key={linkIndex}>
                        <Link to={link.path} style={linkStyle} className="hover:underline">{link.name}</Link>
                      </li>
                    )
                  ))}
                </ul>
              </div>
            )
          ))}

          {footerSettings.contact.isVisible && (
            <div>
              <p className="font-semibold mb-4" style={{ color: footerSettings.colors.heading }}>{footerSettings.contact.title}</p>
              <ul className="space-y-2 text-sm">
                {footerSettings.contact.email && (
                  <li className="flex items-center gap-2">
                    <LucideIcons.Mail className="w-4 h-4" />
                    <a href={`mailto:${footerSettings.contact.email}`} style={linkStyle} className="hover:underline">{footerSettings.contact.email}</a>
                  </li>
                )}
                {footerSettings.contact.phone && (
                  <li className="flex items-center gap-2">
                    <LucideIcons.Phone className="w-4 h-4" />
                    <span>{footerSettings.contact.phone}</span>
                  </li>
                )}
                {footerSettings.contact.address && (
                  <li className="flex items-start gap-2">
                    <LucideIcons.MapPin className="w-4 h-4 mt-1 flex-shrink-0" />
                    <span>{footerSettings.contact.address}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-12 pt-8 border-t" style={{ borderColor: footerSettings.colors.separator }}>
          <p className="text-center text-sm" style={{ color: footerSettings.colors.text }}>
            {footerSettings.copyrightText.replace('{year}', new Date().getFullYear()).replace('{siteName}', siteName)}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;