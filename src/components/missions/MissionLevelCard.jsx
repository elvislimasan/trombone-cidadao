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
// PESO DA COR: ONDE ELA FICA E ONDE ELA SAI
//
// Três papéis, três cores, e nenhuma delas se repete fora do seu papel:
//
//   • VERMELHO (brand)      — identidade e o que se toca: botão, XP, link.
//   • AZUL (statusProgress) — TODA barra de progresso, aqui e na lista.
//   • neutro (edge/surface) — moldura e fundo.
//
// A barra era vermelha também. Com dez delas na mesma rolagem, mais os botões e
// os números, a marca deixava de destacar coisa alguma — tudo era destaque. O
// azul já era o "em andamento" do app (status-progress), então a barra passou a
// dizer a mesma coisa que o resto do produto já diz.
//
// Molduras e fundos usam `edge-subtle` e `surface-subtle`, que têm valor
// próprio em cada tema.
//
// O motivo é concreto: `border-brand/30` calcula a cor sobre o FUNDO, e o fundo
// inverte entre claro e escuro. 30% de vermelho sobre branco vira rosa pálido;
// os mesmos 30% sobre quase-preto viram um vinho denso que puxa a atenção. Um
// valor só, dois pesos — e foi o que deixou o modo escuro pesado.
//
// "FALTAM APENAS 11 XP" É O CORAÇÃO DISTO
//
// Um total absoluto ("289 pontos") é placar; a distância até o próximo degrau é
// convite. A frase só aparece quando o número é pequeno o bastante para ser um
// convite de verdade — dizer "faltam 187 XP" não move ninguém, e gasta a força
// da frase para quando ela importa.

const PERTO = 40;

const Estatistica = ({ Icone, cor, texto }) => (
  <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2.5">
    <Icone size={13} className={`shrink-0 ${cor}`} />
    <span className="text-[11px] text-content-secondary truncate">{texto}</span>
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
          <p className="text-[15px] font-extrabold text-brand leading-tight">
            {label}
          </p>
          <p className="text-xs font-bold text-content-secondary mt-0.5">
            Nível {level}
          </p>
        </div>

        {/* O total fica num selo próprio: é o número que a pessoa procura
            primeiro, e no meio do texto ele se perdia. */}
        <div className="shrink-0 rounded-xl bg-brand-subtleBg px-3 py-2 text-center">
          <p className="text-2xl font-extrabold text-brand leading-none tabular-nums">
            {points}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-brand mt-1 opacity-80">
            XP total
          </p>
        </div>
      </div>

      <div className="px-4 pb-3.5">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <span className="text-xs font-bold text-brand tabular-nums">
            {proxima ? `${points} / ${proxima.minimo} XP` : `${points} XP`}
          </span>
          <span className="text-[11px] text-content-tertiary">
            {!proxima
              ? 'Nível máximo alcançado'
              : quaseLa
              ? (
                <span className="font-bold text-brand">
                  Faltam apenas {proxima.faltam} XP
                </span>
              )
              : `Faltam ${proxima.faltam} XP para ${proxima.rotulo}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-sunken overflow-hidden">
          <div
            className="h-full rounded-full bg-status-progressFg transition-[width] duration-700"
            style={{ width: `${Math.round(fracao * 100)}%` }}
          />
        </div>
      </div>

      {/* A faixa de baixo só existe quando há o que dizer. Três zeros lado a
          lado numa conta nova seriam a primeira coisa que a pessoa vê. */}
      {(sequencia > 0 || concluidas > 0 || melhorMedalha) && (
        <div className="flex items-center divide-x divide-edge-subtle border-t border-edge-subtle bg-surface-subtle">
          {sequencia > 0 && (
            <Estatistica
              Icone={Flame}
              cor="text-status-pendingFg"
              texto={`Sequência: ${sequencia} ${sequencia === 1 ? 'dia' : 'dias'}`}
            />
          )}
          {concluidas > 0 && (
            <Estatistica
              Icone={Trophy}
              cor="text-brand"
              texto={`${concluidas} ${concluidas === 1 ? 'missão concluída' : 'missões concluídas'}`}
            />
          )}
          {melhorMedalha && (
            <Estatistica
              Icone={Eye}
              cor="text-success-fg"
              texto={melhorMedalha.nome}
            />
          )}
        </div>
      )}
    </div>
  );
}
