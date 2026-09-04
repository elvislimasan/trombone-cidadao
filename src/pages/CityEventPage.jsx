import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Clock, ExternalLink, Info, Loader2, MapPin, Repeat2, Share2, Youtube } from 'lucide-react';

import { Button } from '@/components/ui/button';
import BackButton from '@/components/BackButton';
import CityEventTimeline from '@/components/agora/CityEventTimeline';
import CityEventForm from '@/components/agora/CityEventForm';
import CityEventManageBar from '@/components/agora/CityEventManageBar';
import CommunityConfirmation from '@/components/agora/CommunityConfirmation';
import FollowAreaButton from '@/components/agora/FollowAreaButton';
import { IconeDoAcontecimento, SeloDeStatus } from '@/components/agora/CityEventVisuals';
import { useCanManageCityEvents, useCityEvent, useCityEventActions } from '@/hooks/useCityEvents';
import {
  estadoDaPrevisao,
  legendaDoAndamento,
  nomesDasAreas,
  previsaoLegivel,
  progressoDaPrevisao,
  rotuloDasAreas,
  tipoDe,
} from '@/lib/cityEvents';
import { compartilharLink } from '@/lib/shareLink';
import { getCityEventShareUrl } from '@/lib/shareUtils';
import { linkEhDoYoutube, normalizarLinkExterno, textoDoBotaoExterno } from '@/lib/externalLinks';

// A tela de um acontecimento — /agora/438, o destino do push.
//
// AS ABAS SÃO TRÊS PERGUNTAS, NÃO TRÊS GAVETAS
//
// Resumo: o que aconteceu e quem informou.
// Atualizações: como isso evoluiu.
// Áreas afetadas: se pega em mim.
//
// A terceira parece a menos importante e é a mais consultada por quem chegou
// pelo push: a pessoa recebeu um aviso de "Morada Nobre e mais 2 bairros" e
// quer saber quais são os outros dois.
//
// O CARTÃO DE PREVISÃO FICA ACIMA DAS ABAS
//
// "Até quando" é a única informação que todo mundo veio buscar, independente da
// aba. Colocá-lo dentro de "Resumo" faria quem abre em "Atualizações" perder o
// dado principal da tela.

const ABAS = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'atualizacoes', rotulo: 'Atualizações' },
  { id: 'areas', rotulo: 'Áreas afetadas' },
];

const Cartao = ({ children, className = '' }) => (
  <section className={`overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1 sm:p-5 ${className}`}>
    {children}
  </section>
);

export default function CityEventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [aba, setAba] = useState('resumo');
  const [editando, setEditando] = useState(false);

  const { evento, carregando, naoAchou, recarregar } = useCityEvent(eventId);
  const { podeGerir, papel, bairrosDesignados, restritoABairros } = useCanManageCityEvents(evento?.city_id);

  const acoes = useCityEventActions({
    aoConcluir: async () => {
      setEditando(false);
      await recarregar();
    },
  });

  const agora = new Date();

  if (carregando) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    );
  }

  if (naoAchou || !evento) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-content-primary">Acontecimento não encontrado</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Ele pode ter sido removido, ou o link está incompleto.
        </p>
        <Button asChild variant="outline" className="mt-5"><Link to="/agora">Ver o que está acontecendo</Link></Button>
      </div>
    );
  }

  const tipo = tipoDe(evento.type);
  const previsao = estadoDaPrevisao(evento, agora);
  const areas = nomesDasAreas(evento.areas);
  const podeEditar = podeGerir || evento.can_manage;
  const linkExterno = normalizarLinkExterno(evento.source_url);
  const linkDoYoutube = linkEhDoYoutube(linkExterno);

  if (editando) {
    return (
      <div className="min-h-screen bg-surface-base pb-16">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <CityEventForm
            cityId={evento.city_id}
            cityName={evento.city_name}
            papel={papel}
            bairrosDesignados={bairrosDesignados}
            restritoABairros={restritoABairros}
            evento={evento}
            salvando={acoes.salvando}
            aoSalvar={(dados) => acoes.editar(evento.id, dados)}
            aoCancelar={() => setEditando(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base pb-16">
      <Helmet>
        <title>{`${tipo.rotulo} — ${evento.title} | Trombone Cidadão`}</title>
        <meta name="description" content={evento.description || `${tipo.rotulo} em ${rotuloDasAreas(evento.areas, { maximo: 3 })}.`} />
      </Helmet>

      {/* ESTA TELA ERA UMA COLUNA DE CELULAR CENTRALIZADA NUM MONITOR
          `max-w-2xl` (42rem) é largura de leitura, e faz sentido para o texto —
          mas ela estava valendo para a TELA inteira. Num monitor de 1920 sobrava
          um terço de branco de cada lado enquanto a linha do tempo, a enquete da
          comunidade e o botão de acompanhar disputavam a mesma faixa estreita,
          empilhados a três rolagens de distância do dado que a pessoa veio ver.

          A saída é a mesma da página da bronca: duas colunas a partir de `lg`.
          O relato fica na coluna larga com a largura de leitura preservada, e o
          que é AÇÃO — confirmar se normalizou, acompanhar a região — sobe para a
          lateral, onde fica à vista sem competir com a leitura.

          O limite de 100rem acompanha as páginas principais do desktop. Em um
          monitor largo, `max-w-6xl` ainda deixava quase 400px vazios em cada
          lado e fazia a tela parecer uma versão de tablet centralizada.

          Abaixo de `lg` nada disso existe: a ordem empilhada é exatamente a de
          antes, e é a certa no celular. */}
      <div className="mx-auto w-full max-w-[100rem] px-3 py-4 sm:px-5 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          <BackButton paraOnde="/agora" className="-ml-3" />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            aria-label="Compartilhar"
            onClick={() => compartilharLink({
              title: `${tipo.rotulo} — ${evento.title}`,
              text: evento.description || tipo.rotulo,
              url: getCityEventShareUrl(evento.id),
            })}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
          <div className="min-w-0">

        {/* A FOTO VEM ANTES DO TÍTULO, E ABAIXO DO BOTÃO DE VOLTAR
            Ela é contexto, não conteúdo: quem chegou pelo push já sabe o que
            aconteceu — a imagem confirma. Empurrá-la para depois da previsão
            faria a pessoa rolar por cima do dado principal para vê-la; colocá-la
            acima do botão de voltar tiraria a saída da tela do alcance do
            polegar em telefone alto. */}
        {evento.image_url && (
          <div className="mt-3 overflow-hidden rounded-3xl bg-surface-sunken">
            <img
              src={evento.image_url}
              alt=""
              className="block max-h-56 w-full object-cover"
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
            />
          </div>
        )}

        {/* Cabeçalho */}
        <header className="mt-4 flex items-start gap-3">
          <IconeDoAcontecimento type={evento.type} severity={evento.severity} tamanho="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold leading-tight text-content-primary sm:text-3xl">
                {tipo.rotulo}
              </h1>
              <SeloDeStatus status={evento.status} />
            </div>
            <p className="mt-1 text-base text-content-secondary">{evento.title}</p>
          </div>
        </header>

        <p className="mt-3 flex items-start gap-2 text-sm text-content-secondary">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span>{rotuloDasAreas(evento.areas, { maximo: 3 }) || evento.city_name}</span>
        </p>

        {/* PREVISÃO — o dado que todo mundo veio buscar.
            A BARRA É O QUE FAZ ELE RESPONDER "FALTA MUITO?"
            "Previsão: hoje, 18h" às 14h e às 17h50 são a mesma frase e
            situações opostas. A barra responde sem a pessoa fazer a conta, e é
            o que faz valer a pena reabrir a tela durante o dia.
            Ela some quando não há janela (sem previsão, ou já resolvido):
            desenhar uma proporção sem denominador seria inventar um número. */}
        {evento.type === 'event' ? (
          <div className="mt-4 rounded-3xl border border-status-progressBorder bg-status-progressBg p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-status-progressFg">
              <CalendarDays className="h-3.5 w-3.5" /> Data e horário
            </p>
            <p className="mt-1.5 text-2xl font-extrabold leading-tight text-content-primary">
              {previsaoLegivel(evento.started_at, agora)}
            </p>
            {evento.estimated_end_at && (
              <p className="mt-1 text-sm text-content-secondary">Término previsto: {previsaoLegivel(evento.estimated_end_at, agora)}</p>
            )}
            {evento.recurrence === 'weekly' && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-status-progressFg">
                <Repeat2 className="h-4 w-4" /> Repete semanalmente
              </p>
            )}
          </div>
        ) : (() => {
          const resolvido = evento.status === 'resolved';
          const progresso = resolvido ? null : progressoDaPrevisao(evento, agora);
          const andamento = legendaDoAndamento(evento);

          const tom = previsao.vencida && !resolvido
            ? { fundo: 'bg-danger-subtleBg', borda: 'border-danger/25', texto: 'text-danger-subtleFg', barra: 'bg-danger' }
            : resolvido
              ? { fundo: 'bg-status-resolvedBg', borda: 'border-status-resolvedBorder', texto: 'text-status-resolvedFg', barra: 'bg-status-resolvedFg' }
              : { fundo: 'bg-status-progressBg', borda: 'border-status-progressBorder', texto: 'text-status-progressFg', barra: 'bg-brand' };

          return (
            <div className={`mt-4 rounded-3xl border p-4 sm:p-5 ${tom.fundo} ${tom.borda}`}>
              <p className={`flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] ${tom.texto}`}>
                {resolvido ? <Info className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                {resolvido ? 'Normalizado' : 'Previsão de normalização'}
              </p>

              <p className="mt-1.5 text-[28px] font-extrabold leading-none tracking-tight text-content-primary">
                {resolvido
                  ? previsaoLegivel(evento.resolved_at, agora)
                  : previsao.tem ? previsao.texto : 'Sem previsão informada'}
              </p>

              {progresso !== null && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-content-primary/10">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${tom.barra}`}
                      // Corta em 100%: a barra mostra que a janela acabou, e o
                      // "quanto passou" quem diz é o texto abaixo.
                      style={{ width: `${Math.min(100, Math.round(progresso * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="mt-2 text-xs text-content-tertiary">
                {previsao.vencida && !resolvido
                  ? 'A previsão terminou e aguarda confirmação do responsável.'
                  : andamento
                    ? `${andamento.rotulo} às ${andamento.hora}`
                    : ''}
              </p>
            </div>
          );
        })()}

        {podeEditar && (
          <div className="mt-4">
            <CityEventManageBar
              evento={evento}
              acoes={acoes}
              aoEditar={() => setEditando(true)}
              /* `replace`: o acontecimento não existe mais, e o botão de voltar
                 do navegador não pode trazer a pessoa de volta para ele. */
              aoRemover={() => navigate('/agora', { replace: true })}
            />
          </div>
        )}

        {/* Abas */}
        <div className="mt-5 flex border-b border-edge-subtle">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={`flex-1 border-b-2 px-2 pb-2.5 text-sm font-bold transition-colors ${
                aba === a.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary'
              }`}
            >
              {a.rotulo}
              {a.id === 'atualizacoes' && evento.updates?.length > 0 && (
                <span className="ml-1 text-xs font-semibold text-content-tertiary">{evento.updates.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {aba === 'resumo' && (
            <>
              <Cartao>
                <h2 className="text-base font-bold text-content-primary">O que aconteceu?</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-content-secondary">
                  {evento.description || 'Nenhuma descrição foi informada.'}
                </p>

                {(evento.source_name || linkExterno) && (
                  <div className="mt-4 border-t border-edge-subtle pt-4">
                    {evento.source_name && (
                      <p className="text-sm text-content-tertiary">
                        Fonte: <span className="font-bold text-content-secondary">{evento.source_name}</span>
                      </p>
                    )}

                    {linkExterno && (
                      <Button asChild variant="outline" className="mt-3 w-full gap-2 sm:w-auto">
                        <a href={linkExterno} target="_blank" rel="noopener noreferrer">
                          {linkDoYoutube ? <Youtube className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                          {textoDoBotaoExterno(evento.source_button_label, linkExterno)}
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </Cartao>

              <Cartao>
                <h2 className="text-base font-bold text-content-primary">Linha do tempo</h2>
                <div className="mt-4"><CityEventTimeline evento={evento} agora={agora} /></div>
              </Cartao>
            </>
          )}

          {aba === 'atualizacoes' && (
            <Cartao>
              <h2 className="text-base font-bold text-content-primary">Atualizações</h2>
              <div className="mt-4"><CityEventTimeline evento={evento} agora={agora} /></div>
            </Cartao>
          )}

          {aba === 'areas' && (
            <Cartao>
              <h2 className="text-base font-bold text-content-primary">Áreas afetadas</h2>
              <p className="mt-1 text-sm text-content-tertiary">
                {/* A frase da regra 3 do plano, dita para quem lê: o alerta é
                    um só, e a rua entra nele pelo bairro. */}
                O acontecimento é único e vale para toda a região listada.
              </p>
              <ul className="mt-3 space-y-1.5">
                {areas.length === 0 && (
                  <li className="text-sm text-content-tertiary">Nenhuma área registrada.</li>
                )}
                {areas.map((nome) => (
                  <li key={nome} className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2">
                    <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                    <span className="text-sm font-semibold text-content-primary">{nome}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
            </div>
          </div>

          {/* A LATERAL É O QUE SE FAZ, NÃO O QUE SE LÊ
              `sticky`: a enquete "voltou na sua rua?" é a única coisa desta
              tela que só a pessoa pode responder, e ela ficava no fim de uma
              página que quase ninguém rola até o fim. */}
          <aside className="grid gap-4 lg:sticky lg:top-4">
            {evento.type !== 'event' && (
              <CommunityConfirmation
                evento={evento}
                salvando={acoes.salvando}
                aoResponder={(status) => acoes.confirmar(evento.id, status)}
              />
            )}

          {/* Acompanhar a região vem no fim, e não no topo: quem chegou pelo
              push já é acompanhante. Quem chegou pelo link compartilhado leu a
              tela inteira antes de decidir. */}
          {evento.city_id && (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-edge-default px-4 py-5 text-center">
              <p className="text-sm font-bold text-content-primary">Quer saber quando isso acontecer de novo?</p>
              {/* A frase antiga dizia "as próximas ocorrências da região" — e a
                  assinatura de cidade não alcança isso. Ver ALCANCE em
                  FollowAreaButton: quem quer saber de um bairro acompanha o
                  bairro. */}
              <p className="text-xs text-content-tertiary">
                Você recebe os avisos que valerem para {evento.city_name || 'a cidade'} inteira.
                Para este bairro, acompanhe sua rua em Minha Rua.
              </p>
              <FollowAreaButton
                areaType="city"
                cityId={evento.city_id}
                nome={evento.city_name}
                tamanho="sm"
                className="mt-1"
              />
            </div>
          )}
          </aside>
        </div>
      </div>
    </div>
  );
}
