import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  podeConfirmar,
  resumoDasConfirmacoes,
  tempoDesde,
  veredictoDaComunidade,
} from '@/lib/cityEvents';

// "O abastecimento voltou na sua rua?" — a segunda camada de validação.
//
// POR QUE A PERGUNTA É SOBRE A RUA, E NÃO SOBRE O BAIRRO
//
// Quem resolve o problema é a concessionária, e ela informa por região. Mas a
// água volta rua a rua, e é comum a normalização chegar numa ponta do bairro
// horas antes da outra. Perguntar "voltou no Morada Nobre?" convida a pessoa a
// responder pelo vizinho; perguntar "voltou na SUA rua?" pede o único dado que
// ela tem de primeira mão.
//
// É essa diferença que faz a divergência da seção 16 significar alguma coisa:
// quarenta e sete pessoas dizendo "na minha não voltou" é um fato verificável,
// não uma opinião sobre o bairro.

const Botao = ({ ativo, tom, Icone, children, ...props }) => {
  const tons = {
    sim: ativo
      ? 'border-status-resolvedBorder bg-status-resolvedBg text-status-resolvedFg'
      : 'border-status-resolvedBorder/60 text-status-resolvedFg hover:bg-status-resolvedBg',
    nao: ativo
      ? 'border-danger bg-danger-subtleBg text-danger-subtleFg'
      : 'border-danger/40 text-danger hover:bg-danger-subtleBg',
  };

  return (
    <button
      type="button"
      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60 ${tons[tom]}`}
      {...props}
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
};

const CommunityConfirmation = ({ evento, aoResponder, salvando = false }) => {
  const { user } = useAuth();

  if (!podeConfirmar(evento)) return null;

  const resumo = resumoDasConfirmacoes(evento.confirmations);
  const veredicto = veredictoDaComunidade(resumo);
  const minha = evento.my_confirmation;

  const tonsVeredicto = {
    ok: 'bg-status-resolvedBg text-status-resolvedFg',
    alerta: 'bg-danger-subtleBg text-danger-subtleFg',
    neutro: 'bg-surface-subtle text-content-secondary',
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1 sm:p-5">
      <h2 className="text-base font-bold text-content-primary">Confirmar com a comunidade</h2>
      <p className="mt-1 text-sm text-content-secondary">
        {evento.type === 'water_outage'
          ? 'O abastecimento voltou na sua rua?'
          : 'A situação normalizou na sua rua?'}
      </p>

      {user ? (
        <div className="mt-4 flex gap-3">
          <Botao
            tom="sim"
            ativo={minha === 'resolved'}
            Icone={salvando ? Loader2 : CheckCircle2}
            disabled={salvando}
            onClick={() => aoResponder('resolved')}
          >
            Sim, voltou
          </Botao>
          <Botao
            tom="nao"
            ativo={minha === 'not_resolved'}
            Icone={salvando ? Loader2 : XCircle}
            disabled={salvando}
            onClick={() => aoResponder('not_resolved')}
          >
            Ainda não
          </Botao>
        </div>
      ) : (
        // Sem conta não dá para responder — uma enquete anônima sobre a
        // própria rua seria votável em massa por quem não mora nela, e é
        // justamente ela que pode reabrir um alerta da cidade.
        <Link
          to="/login"
          className="mt-4 flex items-center justify-center rounded-2xl border-2 border-edge-default px-4 py-3 text-sm font-bold text-content-secondary transition-colors hover:bg-surface-subtle"
        >
          Entre na sua conta para responder
        </Link>
      )}

      {minha && (
        <p className="mt-3 text-center text-xs font-semibold text-content-tertiary">
          Sua resposta: {minha === 'resolved' ? 'sim, voltou' : 'ainda não'} · toque para trocar
        </p>
      )}

      {resumo.total > 0 && (
        <>
          {/* A barra existe para o número virar proporção sem ninguém fazer a
              conta. Só aparece com resposta suficiente para a proporção
              significar algo — abaixo disso ela desenharia "100% não" com
              uma pessoa. */}
          {resumo.total >= 10 && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-danger/25">
              <div
                className="h-full rounded-full bg-status-resolvedFg transition-all"
                style={{ width: `${resumo.pctSim}%` }}
              />
            </div>
          )}

          {veredicto && (
            <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-semibold ${tonsVeredicto[veredicto.tom]}`}>
              {veredicto.texto}
            </p>
          )}

          <p className="mt-2 text-center text-xs text-content-tertiary">
            {resumo.total} {resumo.total === 1 ? 'resposta' : 'respostas'}
            {resumo.ultima && ` · última ${tempoDesde(resumo.ultima)}`}
          </p>
        </>
      )}
    </section>
  );
};

export default CommunityConfirmation;
