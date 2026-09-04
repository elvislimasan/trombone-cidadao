import { Link } from 'react-router-dom';
import { ChevronRight, Radar, ShieldCheck } from 'lucide-react';

import { situacaoDaRua, statusDe } from '@/lib/cityEvents';
import { IconeDoAcontecimento } from '@/components/agora/CityEventVisuals';

// A faixa de situação no topo de Minha Rua.
//
// NÃO EXISTE CÓPIA DO ACONTECIMENTO AQUI
//
// A regra 3 do plano em uma linha: o evento é regional, e esta faixa é uma
// CONSULTA — `get_street_city_events` pergunta ao banco quais acontecimentos
// pegam nesta rua, pelo bairro dela ou pela cidade. Nenhuma linha por rua é
// criada, e por isso a faixa some sozinha quando o evento é resolvido.
//
// POR QUE O ESTADO NORMAL TAMBÉM APARECE
//
// Uma faixa que só existe quando há problema não é informação: é ausência de
// informação. Quem abre a página da rua num dia comum não sabe se está tudo
// bem ou se o app não checou. O verde é barato e responde a pergunta.
//
// A FAIXA DIZ DE ONDE VEM
//
// "Falta d'água na sua região" sozinho não explica quem apurou aquilo nem para
// onde o toque leva. O rótulo nomeia a seção do app que responde por esses
// avisos — a mesma do menu e da página `/agora` — e é o que transforma um
// aviso solto num item de um lugar que a pessoa pode visitar depois.

const Rotulo = ({ tom }) => (
  <p className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] ${tom}`}>
    <Radar className="h-3.5 w-3.5" aria-hidden="true" /> Radar da cidade
  </p>
);

const StreetEventBanner = ({ eventos, carregando }) => {
  // Enquanto carrega, nada — um "tudo normal" que vira alerta meio segundo
  // depois é pior que meio segundo de silêncio.
  if (carregando) return null;

  const situacao = situacaoDaRua(eventos);

  if (situacao.normal) {
    return (
      <div className="rounded-2xl border border-status-resolvedBorder bg-status-resolvedBg px-4 py-3">
        <Rotulo tom="text-status-resolvedFg/70" />
        <div className="mt-1 flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0 text-status-resolvedFg" aria-hidden="true" />
          <p className="text-sm font-bold text-status-resolvedFg">Tudo normal na sua região</p>
        </div>
      </div>
    );
  }

  const { evento, previsao, outros } = situacao;

  return (
    <Link
      to={`/agora/${evento.id}`}
      className="block overflow-hidden rounded-2xl border border-status-pendingBorder bg-status-pendingBg transition-opacity hover:opacity-90"
    >
      <div className="px-4 pt-3">
        <Rotulo tom="text-status-pendingFg/70" />
      </div>

      <div className="flex items-center gap-3 px-4 pb-3 pt-1">
        <IconeDoAcontecimento type={evento.type} severity={evento.severity} tamanho="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-status-pendingFg">{situacao.texto}</p>
          <p className="truncate text-xs text-status-pendingFg/80">
            {evento.title}
            {' · '}
            {statusDe(evento.status).rotulo}
          </p>
          {previsao?.tem && (
            <p className="text-xs font-semibold text-status-pendingFg/80">
              {previsao.vencida ? 'Previsão vencida — em verificação' : `Previsão: ${previsao.texto}`}
            </p>
          )}
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-status-pendingFg" aria-hidden="true" />
      </div>

      {outros > 0 && (
        <p className="border-t border-status-pendingBorder/50 px-4 py-2 text-xs font-semibold text-status-pendingFg/80">
          +{outros} {outros === 1 ? 'outro acontecimento' : 'outros acontecimentos'} na região
        </p>
      )}
    </Link>
  );
};

export default StreetEventBanner;
