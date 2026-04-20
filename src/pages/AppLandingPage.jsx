import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Check } from "lucide-react";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.trombonecidadao.app";

const getBaseUrl = () => {
  if (import.meta.env.VITE_APP_URL) return import.meta.env.VITE_APP_URL;
  if (typeof window !== "undefined" && window.location?.origin)
    return window.location.origin;
  return "https://trombonecidadao.com.br";
};

const getPlatform = () => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isDesktop = !isAndroid && !isIOS;
  return { isAndroid, isIOS, isDesktop };
};

const AppLandingPage = () => {
  const [copied, setCopied] = useState(false);

  const baseUrl = useMemo(() => getBaseUrl(), []);
  const shareUrl = useMemo(() => `${baseUrl.replace(/\/$/, "")}/app`, [baseUrl]);

  const { isAndroid, isIOS, isDesktop } = useMemo(() => getPlatform(), []);

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(
      shareUrl
    )}`;
  }, [shareUrl]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (isAndroid) window.location.replace(PLAY_STORE_URL);
  }, [isAndroid]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copie o link:", shareUrl);
    }
  };

  const Banner = (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#c0392b] to-[#e74c3c] text-white shadow-lg">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-[#e8a317]/25 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-10">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Trombone Cidadão"
            className="h-12 w-12 shrink-0 rounded-xl bg-white/10 object-contain p-2"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              Baixe o Trombone Cidadão
            </h1>
            <p className="mt-1 text-sm text-white/90 md:text-base">
              Acesse mais rápido, receba notificações e acompanhe suas broncas.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild className="bg-white text-[#c0392b] hover:bg-white/90">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              Abrir Play Store <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopyLink}
            className="bg-white/10 text-white hover:bg-white/15"
          >
            {copied ? (
              <>
                Copiado <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Copiar link <Copy className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  if (!Capacitor.isNativePlatform() && isAndroid) {
    return (
      <>
        <Helmet>
          <title>Redirecionando… – Trombone Cidadão</title>
        </Helmet>
        <div className="w-full bg-[#F9FAFB]">
          <div className="container mx-auto px-4 py-10 md:py-14">
            {Banner}
            <div className="mt-8 rounded-2xl border border-[#e6ded8] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#1a0a08]">
                Redirecionando para a Play Store…
              </h2>
              <p className="mt-2 text-sm text-[#8a7a76]">
                Se não abrir automaticamente, use o botão abaixo.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild className="bg-[#c0392b] hover:bg-[#e74c3c]">
                  <a
                    href={PLAY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir Play Store
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Voltar ao site</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Baixar o app – Trombone Cidadão</title>
      </Helmet>
      <div className="w-full bg-[#F9FAFB]">
        <div className="container mx-auto px-4 py-10 md:py-14">
          {Banner}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e6ded8] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#1a0a08]">
                {isIOS ? "iOS (iPhone)" : "Android"}
              </h2>
              {isIOS ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-[#8a7a76]">
                    O app para iOS ainda não está disponível. Logo estará
                    disponível na App Store.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="outline" asChild>
                      <Link to="/">Abrir o site</Link>
                    </Button>
                    <Button asChild className="bg-[#c0392b] hover:bg-[#e74c3c]">
                      <a
                        href={PLAY_STORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver versão Android
                      </a>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-[#8a7a76]">
                    O app Android já está disponível na Play Store.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button asChild className="bg-[#c0392b] hover:bg-[#e74c3c]">
                      <a
                        href={PLAY_STORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir Play Store
                      </a>
                    </Button>
                    <Button variant="outline" onClick={handleCopyLink}>
                      {copied ? "Link copiado" : "Copiar link /app"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#e6ded8] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#1a0a08]">
                {isDesktop ? "QR Code" : "Abrir no celular"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#8a7a76]">
                Aponte a câmera do seu celular para este QR Code. Ele abre{" "}
                <span className="font-semibold">{shareUrl}</span> e direciona
                automaticamente conforme o dispositivo.
              </p>
              <div className="mt-5 flex flex-col items-center gap-4">
                <img
                  src={qrCodeUrl}
                  alt="QR Code para baixar o app"
                  className="h-[260px] w-[260px] rounded-xl border border-[#e6ded8] bg-white p-3"
                  loading="lazy"
                />
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="outline" onClick={handleCopyLink}>
                    {copied ? "Copiado" : "Copiar link"}
                  </Button>
                  <Button asChild className="bg-[#c0392b] hover:bg-[#e74c3c]">
                    <a
                      href={PLAY_STORE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir Play Store
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AppLandingPage;
