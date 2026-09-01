import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import {
  estadoDaPrevisao,
  horaCurta,
  previsaoLegivel,
  rotuloDasAreas,
  tempoDesde,
  tipoDe,
} from '@/lib/cityEvents';
import { IconeDoAcontecimento, SeloDeStatus } from '@/components/agora/CityEventVisuals';

// O cartão da lista do Agora.
//
// A HIERARQUIA É: O QUE ACONTECEU > ONDE > ATÉ QUANDO
//
// O título grande é o TIPO ("Falta d'água"), não o título que o gestor
// escreveu. É o que a pessoa procura ao correr o olho pela lista — e o título
// escrito varia demais de gestor para gestor para servir de âncora ("Falta
// d'água", "Abastecimento temporariamente interrompido", "Manutenção Compesa"
// são o mesmo acontecimento com três primeiras palavras diferentes).
//
// O título escrito vira a segunda linha, junto do lugar. Nada se perde; muda
// só o que é lido primeiro.

/**
 * O cartão de destaque — o primeiro alerta aberto da lista.
 *
 * POR QUE UM DESTAQUE, E NÃO UMA LISTA UNIFORME
 *
 * Numa cidade média há um alerta que importa e dois que são contexto. Uma
 * lista uniforme obriga a pessoa a ler os três para descobrir qual é qual; o
 * destaque responde antes da leitura. É a mesma hierarquia do mockup: "alerta
 * em destaque" acima, "outros alertas ativos" abaixo.
 *
 * A FOTO É FUNDO, NÃO ILUSTRAÇÃO
 *
 * Ela entra atrás do texto com um degradê por cima, e não como um bloco de
 * imagem separado. A diferença importa: como bloco, uma foto ruim (e a foto de
 * um cano vazando geralmente é) rouba a atenção do dado — previsão e área. Como
 * fundo, ela dá contexto sem competir, e o cartão continua legível quando não
 * há foto nenhuma.
 */
export const CityEventHighlightCard = ({ evento, agora = new Date() }) => {
  const tipo = tipoDe(evento.type);
  const previsao = estadoDaPrevisao(evento, agora);
  const onde = rotuloDasAreas(evento.areas);
  const temFoto = Boolean(evento.image_url);

  return (
    <Link
      to={`/agora/${evento.id}`}
      className="relative block overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1 transition-opacity hover:opacity-95"
    >
      {temFoto && (
        <>
          <img src={evento.image_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
          {/* O degradê termina opaco embaixo: sem ele o texto branco cai sobre
              a parte clara da foto e some. */}
          <div className="absolute inset-0 bg-gradient-to-r from-surface-raised via-surface-raised/92 to-surface-raised/40" />
        </>
      )}

      <div className="relative p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <IconeDoAcontecimento type={evento.type} severity={evento.severity} tamanho="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-extrabold uppercase tracking-wide text-content-primary">
            {tipo.rotulo}
          </span>
          <SeloDeStatus status={evento.status} />
        </div>

        {onde && <p className="mt-2 truncate text-sm font-semibold text-content-secondary">{onde}</p>}

        <p className="mt-1 text-sm text-content-tertiary">
          {previsao.tem ? (
            <span className={previsao.vencida ? 'font-bold text-danger' : ''}>
              {previsao.vencida ? 'Previsão vencida' : `Previsão: ${previsao.texto}`}
            </span>
          ) : (
            'Sem previsão de término'
          )}
        </p>
        {evento.started_at && (
          <p className="text-xs text-content-tertiary">Iniciado às {horaCurta(evento.started_at)}</p>
        )}

        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-surface-subtle px-3 py-1.5 text-xs font-bold text-brand">
          Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
};

const CityEventCard = ({ evento, agora = new Date(), resolvido = false }) => {
  const tipo = tipoDe(evento.type);
  const previsao = estadoDaPrevisao(evento, agora);
  const onde = rotuloDasAreas(evento.areas);

  return (
    <Link
      to={`/agora/${evento.id}`}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-subtle sm:px-5"
    >
      {/* Com foto, ela substitui o quadrado do ícone — o ícone volta pequeno
          por cima, para o tipo continuar reconhecível de relance. */}
      {evento.image_url ? (
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-surface-sunken">
          <img src={evento.image_url} alt="" className="block h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/25" />
          <span className="absolute inset-0 flex items-center justify-center">
            <IconeDoAcontecimento type={evento.type} severity={evento.severity} tamanho="sm" className="!h-6 !w-6 !rounded-lg !bg-white/85 !text-content-primary" />
          </span>
        </span>
      ) : (
        <IconeDoAcontecimento type={evento.type} severity={evento.severity} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-extrabold uppercase tracking-wide text-content-primary">
            {tipo.rotulo}
          </h3>
          <SeloDeStatus status={evento.status} />
        </div>

        {onde && <p className="mt-1 truncate text-sm text-content-secondary">{onde}</p>}

        {/* Uma linha de tempo, e só uma.
            Resolvido responde "quando acabou"; aberto responde "até quando".
            Mostrar as duas em qualquer um dos casos enche o cartão com a
            metade que já não importa mais. */}
        {resolvido ? (
          <p className="mt-0.5 text-xs font-semibold text-status-resolvedFg">
            Normalizado {tempoDesde(evento.resolved_at, agora)}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-content-tertiary">
            {previsao.tem ? (
              <span className={previsao.vencida ? 'font-bold text-danger' : ''}>
                {previsao.vencida ? 'Previsão vencida' : `Previsão: ${previsao.texto}`}
              </span>
            ) : (
              <span>Sem previsão de término</span>
            )}
            {evento.started_at && (
              <span className="text-content-tertiary"> · Iniciado às {horaCurta(evento.started_at)}</span>
            )}
          </p>
        )}
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
    </Link>
  );
};

/**
 * O cartão de um evento programado — a seção "Eventos próximos" do layout.
 *
 * Um evento que ainda não começou não tem "previsão de normalização" nem
 * "iniciado às": tem hora e lugar. Reaproveitar o cartão de alerta aqui
 * mostraria "Sem previsão de término" numa feira livre.
 */
export const CityEventUpcomingCard = ({ evento, agora = new Date() }) => {
  const onde = rotuloDasAreas(evento.areas);

  return (
    <Link
      to={`/agora/${evento.id}`}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-subtle sm:px-5"
    >
      <IconeDoAcontecimento type={evento.type} severity={evento.severity} />

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold text-content-primary">
          {evento.title || tipoDe(evento.type).rotulo}
        </h3>
        <p className="mt-0.5 text-xs font-semibold text-content-secondary">
          {previsaoLegivel(evento.started_at, agora)}
          {evento.estimated_end_at && ` às ${horaCurta(evento.estimated_end_at)}`}
        </p>
        {onde && <p className="truncate text-xs text-content-tertiary">{onde}</p>}
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
    </Link>
  );
};

export default CityEventCard;
