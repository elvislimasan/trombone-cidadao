import { Link } from 'react-router-dom';
import { ChevronRight, Zap } from 'lucide-react';

import PatrolAvatar from '@/components/patrol/PatrolAvatar';
import { usePatrolAvatar } from '@/hooks/usePatrolAvatar';

// "Continue daqui": as missões mais perto de fechar.
//
// POR QUE ELAS SAEM DA LISTA E VÊM PARA CIMA
//
// A lista completa é ordenada por trilha, que é a ordem certa para explorar o
// catálogo — e a errada para voltar ao app. Quem abre a central pela terceira
// vez não quer escolher entre doze; quer terminar o que começou.
//
// O CRITÉRIO É "QUANTO FALTA", NÃO "QUANTO JÁ FIZ"
//
// Ordenar por progresso relativo colocaria em primeiro uma missão em 90% de uma
// etapa de 50 — noventa por cento de muito ainda é muito. O que decide é o
// número absoluto que falta: uma missão a um passo do fim vence uma a quinze,
// mesmo que a segunda esteja mais "avançada" em porcentagem.

// O CARTÃO DE CIMA É OUTRO OBJETO, NÃO O MESMO MAIOR
//
// A missão mais perto de fechar é a única coisa que esta seção existe para
// resolver. Enquanto ela era mais um cartão branco numa fileira, competia em
// igualdade com as outras e com tudo abaixo — e a pessoa voltava a escolher,
// que é exatamente o trabalho que a seção deveria ter poupado.
//
// Como herói ela para de competir: fundo de marca, o número do que falta e o
// boneco da pessoa em pé ao lado. As outras quase-fechadas não aparecem aqui —
// elas são linhas do catálogo logo abaixo, e repeti-las devolveria a escolha
// que esta seção existe para poupar.
//
// O BONECO NÃO É ENFEITE
//
// É o MESMO desenho da patrulha, com a mesma configuração — inclusive o sexo
// que veio do perfil. Ele liga a central de missões ao que acontece na rua: o
// "Patrulhar" de cada linha abaixo abre com esta pessoa. Um avatar genérico
// aqui quebraria essa promessa.
const CartaoHeroi = ({ missao, avatar }) => (
  <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand to-brand-hover text-content-onBrand shadow-elevation-2">
    <div className="patrol-mode-grid absolute inset-0 opacity-30" aria-hidden="true" />

    <div className="relative flex items-stretch gap-3 px-4 py-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl ring-1 ring-white/25"
          >
            {missao.icone}
          </span>

          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-md bg-white/15 px-2 py-1 text-[10px] font-extrabold uppercase leading-none tracking-wider ring-1 ring-white/20">
              Continue de onde parou
            </span>
            <p className="mt-1.5 font-display text-xl font-extrabold leading-tight tracking-tight">
              {missao.titulo}
            </p>
            <p className="mt-1 text-xs leading-snug text-content-onBrand/85">
              {missao.descricao}
            </p>
          </div>
        </div>

        {/* A barra e a porcentagem juntas: a barra é a sensação, o número é a
            medida. Quem olha de relance lê uma, quem quer saber lê a outra. */}
        <div className="mt-3.5 flex items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold tabular-nums">
            <Zap size={13} aria-hidden="true" />
            +{missao.xpAteAEtapa} XP
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/25">
            <span
              className="block h-full rounded-full bg-white transition-[width] duration-500"
              style={{ width: `${missao.progresso * 100}%` }}
            />
          </span>
          <span className="shrink-0 text-xs font-bold tabular-nums text-content-onBrand/85">
            {Math.round(missao.progresso * 100)}%
          </span>
        </div>

        {missao.acao && (
          <Link
            to={missao.acao.para}
            className="mt-3.5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-raised text-sm font-extrabold text-brand transition-transform active:scale-[0.98]"
          >
            Continuar missão
            <ChevronRight size={15} />
          </Link>
        )}
      </div>

      {/* A coluna do boneco estica com a altura do cartão, e `--palco` desce os
          pés para 72% dela — é o que faz ele PISAR no cartão em vez de flutuar
          no meio da coluna. */}
      <div className="relative w-[104px] shrink-0 self-stretch" aria-hidden="true">
        <span className="absolute right-0 top-0 rounded-lg bg-black/25 px-2.5 py-1 text-xs font-extrabold tabular-nums">
          {missao.rotulo}
        </span>
        <div className="patrol-mode-journey patrol-mode-journey--palco">
          <PatrolAvatar
            modo="walking"
            avatar={avatar}
            camera="frente"
            emMovimento={false}
            sobreMarca
            tamanho={104}
            className="patrol-avatar-planted"
          />
        </div>
      </div>
    </div>
  </div>
);

export default function MissionResume({ missoes }) {
  const avatar = usePatrolAvatar();

  if (!missoes || missoes.length === 0) return null;

  const [primeira] = missoes;

  return (
    <section>
      {/* O TÍTULO DA SEÇÃO ENTROU NO CARTÃO
          "Continue de onde parou" acima de um cartão que dizia a mesma coisa
          gastava duas linhas para uma informação. Como etiqueta dentro do
          herói, ela nomeia o cartão sem competir com o nome da missão. */}
      {/* UMA, E NÃO QUATRO.
          Havia aqui um segundo deslize com as outras três quase-fechadas — que
          são as mesmas linhas do catálogo logo abaixo, numa terceira forma. A
          seção existe para resolver UMA coisa: terminar o que está mais perto
          do fim. Oferecer quatro devolve a escolha que ela deveria poupar. */}
      <CartaoHeroi missao={primeira} avatar={avatar} />
    </section>
  );
}
