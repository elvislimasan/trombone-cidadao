import BackButton from '@/components/BackButton';

// Cabeçalho com voltar.
//
// A regra do voltar — e o plano B para quando não há histórico — mora no
// BackButton, porque telas sem cabeçalho também precisam dela.
//
// O botão do aparelho (Android) continua funcionando sozinho, por ser rota.

export default function PageHeader({ titulo, subtitulo, paraOnde = '/', acao }) {
  return (
    <header className="flex items-start gap-3 mb-5">
      <BackButton paraOnde={paraOnde} className="-ml-2" />

      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-2xl font-extrabold text-content-primary tracking-tight leading-tight">
          {titulo}
        </h1>
        {subtitulo && (
          <p className="text-sm text-content-secondary mt-1 leading-snug">
            {subtitulo}
          </p>
        )}
      </div>

      {acao && <div className="shrink-0 pt-1.5">{acao}</div>}
    </header>
  );
}
