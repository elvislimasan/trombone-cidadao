import { useState } from 'react';
import { AlertCircle, Check, CheckCircle, Clock, Loader2, Share2, Route, Timer, Flame, Star } from 'lucide-react';
import { categoryEmoji } from '@/design-system/icons';
import Confetti from './Confetti';
import { PatrolTravelModeIcon } from './PatrolTravelModePicker';
import { PONTOS, avaliarPatrulha } from '@/lib/patrolGame';
import { minimoDoNivel } from '@/lib/scoring';
import { getPatrolTravelMode } from '@/lib/patrolTravelMode';

// Fim da patrulha: o que você percorreu, o que confirmou e o que ficou pendente.
//
// É aqui que a maior parte das confirmações deve acontecer — o usuário está
// parado, sem pressa, e pode responder as três opções sem risco. O card durante
// o trajeto é o atalho para quem quis responder na hora.
//
// Os números ficam no topo porque são a recompensa: a tela precisa parecer o
// fechamento de uma atividade, não uma lista de pendências.

const OPCOES = [
  { tipo: 'still_here',  Icon: AlertCircle, rotulo: 'Ainda está', classe: 'border-danger/40 text-danger' },
  { tipo: 'being_solved', Icon: Clock,      rotulo: 'Em obras',   classe: 'border-status-progressBorder text-status-progressFg' },
  { tipo: 'solved',       Icon: CheckCircle, rotulo: 'Resolvido', classe: 'border-success-border text-success-fg' },
];

const formatarDuracao = (segundos) => {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

const formatarDistancia = (metros) => {
  const m = Math.max(0, Math.round(metros));
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
};

const Estatistica = ({ Icon, valor, rotulo, destaque }) => (
  <div className="flex-1 min-w-0 text-center">
    <div className="flex items-center justify-center gap-1.5 mb-1">
      {Icon && <Icon size={14} className="text-content-tertiary shrink-0" />}
      <span className={`text-2xl font-extrabold tabular-nums leading-none ${
        destaque ? 'text-brand' : 'text-content-primary'
      }`}>
        {valor}
      </span>
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-content-tertiary truncate">
      {rotulo}
    </p>
  </div>
);

// OS LIMITES DA FAIXA SAEM DE `scoring.js`, E NÃO DE UMA CÓPIA
//
// Havia aqui um `[0, 20, 100, 300]` escrito à mão, porque a RPC devolve pontos
// e nível mas não os limites. Ele sobreviveu enquanto o nível 4 era o teto; no
// instante em que a escada passou a continuar, essa cópia começaria a mentir —
// um nível 5 veria barra cheia aqui e progresso de verdade na central.
//
// `minimoDoNivel` conhece a escada inteira, inclusive os degraus que saem de
// fórmula acima do último nome.
const progressoDoNivel = (nivel) => {
  if (!nivel) return null;
  const atual = Number(nivel.level) || 1;
  const pontos = Number(nivel.points) || 0;
  const base = minimoDoNivel(atual);
  const topo = minimoDoNivel(atual + 1);
  return {
    pontos,
    base,
    topo,
    fracao: Math.min(1, Math.max(0, (pontos - base) / (topo - base))),
    faltam: Math.max(0, topo - pontos),
  };
};

export default function PatrolSummary({
  fila,
  contagens,
  duracaoS,
  distanciaM,
  salvando,

  onResponder,
  onCompartilhar,
  onFechar,
  bloqueadosDe,
  nivel,
  sequencia = 0,
  conquistas = [],
  ranking = [],
  minhaPosicao = null,
  titulos = [],
  feitosNaSessao = { sinais: 0, missoes: 0, broncas: 0 },
  modoDeslocamento = 'driving',
}) {
  // Guardar ou descartar. A regra é pura e testada — ver avaliarPatrulha.
  const veredito = avaliarPatrulha({
    duracaoS,
    distanciaM,
    contagens,
    feitos: feitosNaSessao,
  });

  // Pesos de scoring.js, aplicados ao que ESTA saída produziu.
  const pontosDaSaida =
    (feitosNaSessao.broncas || 0) * PONTOS.bronca +
    (feitosNaSessao.missoes || 0) * PONTOS.missao +
    (feitosNaSessao.sinais || 0) * PONTOS.sinal +
    (contagens.confirmadas || 0) * PONTOS.atualizacao;

  const nivelProgresso = progressoDoNivel(nivel);
  const modo = getPatrolTravelMode(modoDeslocamento);
  // Só as que faltam pouco: uma grade com as oito medalhas transformaria a tela
  // de comemoração em lista de pendências.
  const proximas = conquistas
    .filter((c) => !c.desbloqueada && c.progresso > 0)
    .sort((a, b) => b.progresso - a.progresso)
    .slice(0, 2);
  const desbloqueadas = conquistas.filter((c) => c.desbloqueada);
  // Guarda o que já foi respondido nesta sessão para dar retorno imediato: o
  // item some da lista só depois que o envio confirma, mas o toque precisa de
  // resposta visual antes disso.
  const [enviando, setEnviando] = useState({});

  const responder = async (bronca, tipo) => {
    setEnviando((e) => ({ ...e, [bronca.id]: tipo }));
    const ok = await onResponder(bronca, tipo);
    if (!ok) setEnviando((e) => ({ ...e, [bronca.id]: null }));
  };

  return (
    <div className="fixed inset-0 z-[1004] flex flex-col justify-end bg-black/50">
      <div
        className="bg-surface-base rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200"
        style={{
          maxHeight: 'calc(92vh - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
        }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-edge-default" />
        </div>

        {/* Placar */}
        <div className="relative px-5 pt-2 pb-4 shrink-0">
          {/* A COMEMORAÇÃO SÓ EXISTE SE HOUVE O QUE COMEMORAR.

              Confete numa saída de quarenta segundos sem nenhuma ação seria o
              app se enganando junto com a pessoa — e, pior, festejando
              exatamente o que ele acabou de dizer que não conta. Aqui a mesma
              regra que decide se a patrulha vale (avaliarPatrulha) decide se a
              tela festeja. */}
          <Confetti ativo={!veredito.descartavel} />

          <div className="relative flex flex-col items-center mb-4">
            {!veredito.descartavel && (
              <span className="w-16 h-16 rounded-full bg-brand flex items-center justify-center shadow-lg mb-3">
                <Check size={32} className="text-content-onBrand" strokeWidth={3} />
              </span>
            )}
            <h2 className="text-2xl font-extrabold text-content-primary text-center leading-tight">
              {veredito.descartavel ? 'Saída encerrada' : 'Patrulha concluída!'}
            </h2>
            {!veredito.descartavel && (
              <p className="text-sm text-content-secondary mt-1">
                Você fez a diferença hoje
              </p>
            )}
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand">
              <PatrolTravelModeIcon mode={modo.id} size={15} strokeWidth={2.5} />
              {modo.activeLabel}
            </span>
          </div>

          {/* Aqui o aviso é constatação, não pergunta: a decisão já foi tomada
              na folha de saída, e a patrulha já está gravada. Ele fica para a
              pessoa não estranhar depois que os números não subiram. */}
          {veredito.descartavel && (
            <div className="mb-4 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3.5 py-3">
              <p className="text-xs text-content-secondary leading-snug">
                Sem nenhuma ação, esta saída ficou guardada no seu histórico mas
                não contou como patrulha.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Estatistica Icon={Timer} valor={formatarDuracao(duracaoS)} rotulo="Tempo" />
            <div className="w-px self-stretch bg-edge-subtle" />
            <Estatistica Icon={Route} valor={formatarDistancia(distanciaM)} rotulo="Percorrido" />
            <div className="w-px self-stretch bg-edge-subtle" />
            <Estatistica valor={contagens.passadas} rotulo="Passou por" />
            <div className="w-px self-stretch bg-edge-subtle" />
            <Estatistica valor={contagens.confirmadas} rotulo="Confirmou" destaque />
          </div>

          {/* Sinais e missões ficam FORA da linha principal de propósito: são
              ações sobre o mundo, não medidas do trajeto, e diluí-las entre
              tempo e distância faria seis números competindo por um olhar. */}
          {(feitosNaSessao.sinais > 0 ||
            feitosNaSessao.missoes > 0 ||
            feitosNaSessao.broncas > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-edge-subtle">
              {feitosNaSessao.broncas > 0 && (
                <span className="text-sm font-semibold text-brand">
                  📣 {feitosNaSessao.broncas}{' '}
                  {feitosNaSessao.broncas === 1 ? 'bronca registrada' : 'broncas registradas'}
                </span>
              )}
              {feitosNaSessao.missoes > 0 && (
                <span className="text-sm font-semibold text-brand">
                  🎯 {feitosNaSessao.missoes}{' '}
                  {feitosNaSessao.missoes === 1 ? 'missão cumprida' : 'missões cumpridas'}
                </span>
              )}
              {feitosNaSessao.sinais > 0 && (
                <span className="text-sm font-semibold text-content-secondary">
                  🚩 {feitosNaSessao.sinais}{' '}
                  {feitosNaSessao.sinais === 1 ? 'sinalizado' : 'sinalizados'}
                </span>
              )}
            </div>
          )}
          {/* O QUE A SAÍDA RENDEU, EM UMA LINHA.

              O resumo mostrava tempo, distância e contagens — medidas do que
              aconteceu — e o nível logo abaixo, que é o acumulado de meses. No
              meio faltava a resposta da pergunta que a pessoa faz ao encerrar:
              "e daí, quanto isso valeu?".

              É a soma das ações DESTA saída, pelos mesmos pesos de scoring.js.
              O bônus de etapa de missão fica de fora: ele depende de contadores
              do servidor que esta tela não tem, e chutar aqui faria o número
              divergir do que o perfil mostra minutos depois. */}
          {pontosDaSaida > 0 && (
            <div className="flex items-center justify-center gap-2.5 mt-4 rounded-2xl bg-brand-subtleBg border border-brand/20 px-4 py-3">
              <Star size={20} className="text-brand shrink-0 fill-current" />
              <div className="min-w-0">
                <p className="text-base font-extrabold text-brand leading-none tabular-nums">
                  +{pontosDaSaida} pontos
                </p>
                <p className="text-xs text-content-secondary mt-0.5">
                  para o seu bairro
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1">

          {/* Nível e sequência */}
          {(nivelProgresso || sequencia > 0) && (
            <div className="px-5 pb-4 flex flex-col gap-3 border-b border-edge-subtle">
              {nivelProgresso && (
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-bold text-content-primary">
                      Nível {nivel.level} · {nivel.label}
                    </span>
                    <span className="text-xs font-semibold text-content-tertiary tabular-nums">
                      {nivelProgresso.topo == null
                        ? `${nivelProgresso.pontos} pts`
                        : `faltam ${nivelProgresso.faltam} pts`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                      style={{ width: `${nivelProgresso.fracao * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {sequencia > 0 && (
                <div className="flex items-center gap-2.5 rounded-xl bg-status-pendingBg border border-status-pendingBorder px-3 py-2.5">
                  <Flame size={20} className="text-status-pendingFg shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-status-pendingFg leading-tight">
                      {sequencia} {sequencia === 1 ? 'dia' : 'dias'} seguidos
                    </p>
                    <p className="text-[11px] text-content-secondary">
                      {sequencia === 1
                        ? 'Volte amanhã para começar uma sequência.'
                        : 'Patrulhe amanhã para não perder a sequência.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Títulos de bairro. Vêm antes das medalhas porque são o que muda
              de mão: a medalha, uma vez conquistada, é sua para sempre; o
              título é da janela de 90 dias e alguém pode tomá-lo na semana que
              vem. É essa diferença que faz voltar. */}
          {titulos.length > 0 && (
            <div className="px-5 py-4 border-b border-edge-subtle">
              <h3 className="text-sm font-bold text-content-primary mb-2.5">
                Seus títulos
              </h3>
              <div className="flex flex-wrap gap-2">
                {titulos.slice(0, 4).map((t) => (
                  <span
                    key={t.bairro}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtleBg border border-brand/25 px-3 py-1.5 text-sm font-bold text-brand-subtleFg"
                  >
                    <span aria-hidden="true">{t.emoji}</span>
                    {t.titulo}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-content-tertiary mt-2">
                Contam os últimos 90 dias de ações no bairro.
              </p>
            </div>
          )}

          {/* Medalhas: as conquistadas e as duas mais perto de cair */}
          {conquistas.length > 0 && (
            <div className="px-5 py-4 border-b border-edge-subtle">
              <p className="text-xs font-bold uppercase tracking-wider text-content-tertiary mb-3">
                Medalhas · {desbloqueadas.length}/{conquistas.length}
              </p>

              {desbloqueadas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {desbloqueadas.map((c) => (
                    <span
                      key={c.id}
                      title={`${c.nome} — ${c.descricao}`}
                      className="w-9 h-9 rounded-full bg-brand-subtleBg border border-brand/25 flex items-center justify-center text-lg"
                    >
                      {c.emoji}
                    </span>
                  ))}
                </div>
              )}

              {proximas.map((c) => (
                <div key={c.id} className="mb-2.5 last:mb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base opacity-45 grayscale">{c.emoji}</span>
                    <span className="text-xs font-semibold text-content-secondary flex-1 min-w-0 truncate">
                      {c.nome}
                    </span>
                    <span className="text-[11px] text-content-tertiary tabular-nums shrink-0">
                      {c.rotulo}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand/50"
                      style={{ width: `${c.progresso * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ranking do mês. Só entra quem compartilhou — a RPC filtra por
              is_public, então aparecer aqui é escolha de quem patrulha. */}
          {ranking.length > 0 && (
            <div className="px-5 py-4 border-b border-edge-subtle">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-content-tertiary">
                  Ranking do mês
                </p>
                {minhaPosicao && (
                  <span className="text-[11px] font-bold text-brand">
                    Você: {minhaPosicao}º
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {ranking.slice(0, 5).map((r, i) => (
                  <div key={r.user_id} className="flex items-center gap-2.5">
                    <span className={`w-6 text-center text-sm font-extrabold tabular-nums shrink-0 ${
                      i === 0 ? 'text-brand' : 'text-content-tertiary'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-content-primary">
                      {r.name || 'Cidadão'}
                    </span>
                    <span className="text-xs font-bold text-content-secondary tabular-nums shrink-0">
                      {r.confirmed_sum}
                    </span>
                  </div>
                ))}
              </div>
              {!minhaPosicao && (
                <p className="text-[11px] text-content-tertiary mt-3">
                  Compartilhe uma patrulha para entrar no ranking.
                </p>
              )}
            </div>
          )}

          {fila.length > 0 && (
            <div className="px-5 pt-4 pb-2">
              <p className="text-sm font-bold text-content-primary">
                Faltam {fila.length} {fila.length === 1 ? 'confirmação' : 'confirmações'}
              </p>
              <p className="text-xs text-content-secondary mt-0.5">
                Cada uma vale {PONTOS.atualizacao} pontos e ajuda a cidade a priorizar o conserto.
              </p>
            </div>
          )}

          <div className="divide-y divide-edge-subtle">
          {fila.map((bronca) => {
            const emCurso = enviando[bronca.id];
            const bloqueados = bloqueadosDe?.(bronca.id) || {};
            return (
              <div key={bronca.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl leading-none shrink-0" aria-hidden="true">
                    {categoryEmoji(bronca.category)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-content-primary leading-snug line-clamp-2">
                      {bronca.title}
                    </p>
                    <p className="text-xs text-content-tertiary mt-0.5">
                      {bronca.categoryName}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {OPCOES.map(({ tipo, Icon, rotulo, classe }) => (
                    <button
                      key={tipo}
                      type="button"
                      disabled={Boolean(emCurso) || Boolean(bloqueados[tipo])}
                      onClick={() => responder(bronca, tipo)}
                      className={`h-16 rounded-xl border-2 bg-surface-raised flex flex-col items-center justify-center gap-1 text-[11px] font-bold disabled:opacity-35 active:scale-[0.97] transition-transform ${classe}`}
                    >
                      {emCurso === tipo ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Icon size={18} />
                      )}
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Só ver e compartilhar.

            As decisões saíram daqui para a folha de saída (PatrolExitSheet):
            quando este resumo aparece, a patrulha JÁ foi salva. Misturar a
            comemoração com "salvar ou descartar?" fazia a pessoa atravessar
            nível, sequência, títulos e medalhas para achar como voltar — e as
            opções competiam com os números pela atenção. */}
        <div className="px-4 py-3 shrink-0 border-t border-edge-subtle flex flex-col gap-2">
          <button
            type="button"
            disabled={salvando}
            onClick={onCompartilhar}
            className="w-full py-3.5 rounded-xl bg-brand text-content-onBrand font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:bg-brand-hover transition-colors"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            Compartilhar patrulha
          </button>

          <button
            type="button"
            disabled={salvando}
            onClick={onFechar}
            className="w-full py-3 rounded-xl bg-surface-subtle text-content-primary font-bold text-sm disabled:opacity-50 active:bg-surface-subtleHover transition-colors"
          >
            Fechar
          </button>        </div>
      </div>
    </div>
  );
}
