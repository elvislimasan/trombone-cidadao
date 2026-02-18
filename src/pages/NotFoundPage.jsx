import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Home, AlertTriangle } from 'lucide-react';

const NotFoundPage = () => {
  const [term, setTerm] = useState('');
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    const q = term?.trim();
    if (q) navigate(`/broncas?q=${encodeURIComponent(q)}`);
    else navigate('/broncas');
  };

  return (
    <>
      <Helmet>
        <title>404 – Trombone Cidadão</title>
      </Helmet>
      <div className="w-full bg-[#F9FAFB]">
        <div className="relative container mx-auto flex flex-col items-center px-4 py-16 md:py-20 text-center">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#c0392b] opacity-10 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 -bottom-24 h-64 w-64 rounded-full bg-[#e8a317] opacity-10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center w-full max-w-3xl">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#c0392b] px-4 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-white">
              <AlertTriangle className="h-4 w-4" />
              Erro 404
            </span>

            <div className="relative mb-4">
              <div
                className="select-none text-[clamp(6rem,18vw,14rem)] font-extrabold leading-none tracking-tight text-transparent"
                style={{ WebkitTextStroke: '3px #c0392b' }}
              >
                404
              </div>
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(3.5rem,9vw,7rem)]">
                �
              </span>
            </div>

            <h1 className="mb-2 text-2xl md:text-3xl font-bold text-[#1a0a08]">
              Página não encontrada
            </h1>
            <p className="mb-6 max-w-xl text-[0.98rem] leading-relaxed text-[#8a7a76]">
              Ops! O endereço que você buscou saiu pra dar uma volta pela cidade e não voltou.
              Tente pesquisar ou use os atalhos abaixo para se orientar.
            </p>

            <form
              onSubmit={onSubmit}
              className="mb-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7a76]" />
                <Input
                  type="text"
                  placeholder="Buscar obras, serviços, petições..."
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="h-11 border-2 border-[#d9cfc9] bg-white pl-9 text-[0.95rem] placeholder:text-[#b1a39e] focus-visible:border-[#c0392b] focus-visible:ring-0"
                />
              </div>
              <Button
                type="submit"
                className="h-11 whitespace-nowrap rounded-xl bg-[#c0392b] px-6 text-[0.95rem] font-semibold text-white hover:bg-[#e74c3c]"
              >
                Buscar
              </Button>
            </form>

            <p className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[#8a7a76]">
              Atalhos rápidos
            </p>
            <div className="mb-8 flex max-w-2xl flex-wrap justify-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-lg border border-[#d9cfc9] bg-white px-4 py-2 text-sm font-medium text-[#1a0a08] transition hover:border-[#c0392b] hover:bg-[#fff5f5] shadow-sm"
              >
                <span className="text-base">🏠</span>
                <span>Início</span>
              </Link>
              <Link
                to="/obras-publicas"
                className="inline-flex items-center gap-2 rounded-lg border border-[#d9cfc9] bg-white px-4 py-2 text-sm font-medium text-[#1a0a08] transition hover:border-[#c0392b] hover:bg-[#fff5f5] shadow-sm"
              >
                <span className="text-base">🏗️</span>
                <span>Obras Públicas</span>
              </Link>
              <Link
                to="/mapa-pavimentacao"
                className="inline-flex items-center gap-2 rounded-lg border border-[#d9cfc9] bg-white px-4 py-2 text-sm font-medium text-[#1a0a08] transition hover:border-[#c0392b] hover:bg-[#fff5f5] shadow-sm"
              >
                <span className="text-base">🛣️</span>
                <span>Pavimentação</span>
              </Link>
              <Link
                to="/abaixo-assinados"
                className="inline-flex items-center gap-2 rounded-lg border border-[#d9cfc9] bg-white px-4 py-2 text-sm font-medium text-[#1a0a08] transition hover:border-[#c0392b] hover:bg-[#fff5f5] shadow-sm"
              >
                <span className="text-base">📋</span>
                <span>Petições</span>
              </Link>
              <Link
                to="/estatisticas"
                className="inline-flex items-center gap-2 rounded-lg border border-[#d9cfc9] bg-white px-4 py-2 text-sm font-medium text-[#1a0a08] transition hover:border-[#c0392b] hover:bg-[#fff5f5] shadow-sm"
              >
                <span className="text-base">📊</span>
                <span>Estatísticas</span>
              </Link>
              <Link
                to="/noticias"
                className="inline-flex items-center gap-2 rounded-lg border border-[#d9cfc9] bg-white px-4 py-2 text-sm font-medium text-[#1a0a08] transition hover:border-[#c0392b] hover:bg-[#fff5f5] shadow-sm"
              >
                <span className="text-base">📰</span>
                <span>Notícias</span>
              </Link>
            </div>

            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-[0.95rem] font-semibold text-[#c0392b] transition hover:gap-3"
            >
              <Home className="h-4 w-4" />
              Voltar para a página inicial
            </Link>

            </div>
        </div>
      </div>
    </>
  );
};

export default NotFoundPage;
