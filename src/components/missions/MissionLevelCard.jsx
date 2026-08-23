import { Shield, Flame, Trophy, Eye } from 'lucide-react';

// Nível, XP e os três números que dizem "você está indo".
//
// POR QUE O TOPO DA TELA MUDOU
//
// A central abria direto nas missões. Isso responde "o que fazer", e não
// responde "por que continuar" — que é a pergunta de quem já fez algumas e está
// decidindo se abre o app de novo amanhã.
//
// O que responde isso é progresso VISÍVEL: a barra quase cheia, os onze pontos
// que faltam, a sequência que se perde se parar. São informações que já
// existiam espalhadas (nível no perfil, sequência no resumo da patrulha) e que
// ninguém via junto.
//
// "FALTAM APENAS 11 XP" É O CORAÇÃO DISTO
//
// Um total absoluto ("289 pontos") é placar; a distância até o próximo degrau é
// convite. A frase só aparece quando o número é pequeno o bastante para ser um
// convite de verdade — dizer "faltam 187 XP" não move ninguém, e gasta a força
// da frase para quando ela importa.

const PERTO = 40;

const Estatistica = ({ Icone, valor, rotulo }) => (
  <div className="flex items-center gap-1.5 min-w-0">
    <Icone size={13} className="shrink-0 text-content-tertiary" />
    <span className="text-xs text-content-secondary truncate">
      <span className="font-bold text-content-primary tabular-nums">{valor}</span>{' '}
      {rotulo}
    </span>
  </div>
);

export default function MissionLevelCard({
  nivel,
  sequencia = 0,
  concluidas = 0,
  melhorMedalha = null,
}) {
  if (!nivel) return null;

  const { points, level, label, proxima } = nivel;
  const fracao = proxima ? proxima.fracao : 1;
  const quaseLa = proxima && proxima.faltam <= PERTO;

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 overflow-hidden">
      <div className="flex items-start gap-3.5 px-4 pt-4 pb-3.5">
        {/* O escudo com o número: é o que a pessoa reconhece de relance, e o
            que ela quer ver mudar. */}
        <span className="shrink-0 relative w-12 h-12 flex items-center justify-center">
          <Shield size={48} className="absolute inset-0 text-brand fill-current" />
          <span className="relative text-lg font-extrabold text-content-onBrand leading-none">
            {level}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-content-primary leading-tight">
            {label}
          </p>
          <p className="text-xs text-content-secondary mt-0.5 tabular-nums">
            {proxima ? `${points} / ${proxima.minimo} XP` : `${points} XP`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold text-brand leading-none tabular-nums">
            {points}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary mt-1">
            XP total
          </p>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="h-2 rounded-full bg-surface-sunken overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-700"
            style={{ width: `${Math.round(fracao * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-content-tertiary mt-1.5">
          {!proxima
            ? 'Nível máximo alcançado'
            : quaseLa
            ? (
              <span className="font-bold text-brand">
                Faltam apenas {proxima.faltam} XP para o nível {proxima.nivel}
              </span>
            )
            : `Faltam ${proxima.faltam} XP para ${proxima.rotulo}`}
        </p>
      </div>

      {/* A faixa de baixo só existe quando há o que dizer. Três zeros lado a
          lado numa conta nova seriam a primeira coisa que a pessoa vê. */}
      {(sequencia > 0 || concluidas > 0 || melhorMedalha) && (
        <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap border-t border-edge-subtle bg-surface-subtle px-4 py-2.5">
          {sequencia > 0 && (
            <Estatistica
              Icone={Flame}
              valor={sequencia}
              rotulo={sequencia === 1 ? 'dia seguido' : 'dias seguidos'}
            />
          )}
          {concluidas > 0 && (
            <Estatistica
              Icone={Trophy}
              valor={concluidas}
              rotulo={concluidas === 1 ? 'etapa concluída' : 'etapas concluídas'}
            />
          )}
          {melhorMedalha && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Eye size={13} className="shrink-0 text-content-tertiary" />
              <span className="text-xs text-content-secondary truncate">
                {melhorMedalha.emoji} {melhorMedalha.nome}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
