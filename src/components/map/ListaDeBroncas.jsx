import { Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Loader2, MapPin, Pencil, ThumbsUp } from 'lucide-react';

import { Button } from '@/components/ui/button';

// O mapa de broncas lido como LISTA.
//
// POR QUE ELA MORA AQUI, E NÃO NUMA TELA PRÓPRIA
//
// Existiam duas telas de broncas no desktop — o mapa em `/mapa` e o feed
// completo em `/broncas` — com o mesmo conteúdo, os mesmos filtros e dois
// layouts diferentes. Duas telas para a mesma pergunta significam duas
// manutenções, dois lugares onde um filtro novo pode faltar, e a dúvida de qual
// das duas é a "de verdade".
//
// Mapa e lista são duas LEITURAS do mesmo recorte, e é assim que o mapa de
// pavimentação e o de obras já funcionavam. O mapa responde "onde"; a lista
// responde "quais são" — e é ela que serve para conferir, ordenar e varrer.
//
// POR QUE A PAGINAÇÃO É DO SERVIDOR
//
// O mapa carrega CLUSTERS por área visível: um pino pode valer doze broncas e
// não carrega o título de nenhuma. Reaproveitar isso na lista mostraria só as
// que já estão desagrupadas na tela — uma lista que muda de tamanho conforme o
// zoom anterior. A lista faz a própria consulta, com os mesmos filtros, e pagina
// no banco.

const STATUS_VISUAL = {
  pending: { rotulo: 'Pendente', classe: 'border-status-pendingBorder bg-status-pendingBg text-status-pendingFg' },
  'in-progress': { rotulo: 'Em andamento', classe: 'border-status-progressBorder bg-status-progressBg text-status-progressFg' },
  resolved: { rotulo: 'Resolvida', classe: 'border-status-resolvedBorder bg-status-resolvedBg text-status-resolvedFg' },
  duplicate: { rotulo: 'Duplicada', classe: 'border-edge-subtle bg-surface-subtle text-content-tertiary' },
};

const dataCurta = (valor) => {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toLocaleDateString('pt-BR');
};

export default function ListaDeBroncas({
  broncas,
  carregando,
  total,
  pagina,
  porPagina,
  onPagina,
  podeEditar = false,
  onEditar,
}) {
  const paginas = Math.max(1, Math.ceil((total || 0) / porPagina));
  const inicio = (pagina - 1) * porPagina;

  if (carregando) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-edge-subtle bg-surface-raised py-16 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!broncas || broncas.length === 0) {
    return (
      <div className="rounded-2xl border border-edge-subtle bg-surface-raised px-6 py-16 text-center text-sm text-content-tertiary shadow-sm">
        Nenhuma bronca com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
      <ul className="divide-y divide-edge-subtle">
        {broncas.map((bronca) => {
          const visual = STATUS_VISUAL[bronca.status] || STATUS_VISUAL.pending;
          const quando = dataCurta(bronca.created_at);
          return (
            <li key={bronca.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to={`/bronca/${bronca.id}`}
                    className="truncate text-sm font-bold text-content-primary hover:text-brand hover:underline"
                  >
                    {bronca.title}
                  </Link>
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${visual.classe}`}>
                    {visual.rotulo}
                  </span>
                  {bronca.categories?.name && (
                    <span className="inline-flex items-center rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-content-secondary">
                      {bronca.categories.name}
                    </span>
                  )}
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-content-tertiary">
                  {bronca.address && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{bronca.address}</span>
                    </span>
                  )}
                  {quando && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 shrink-0" /> {quando}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <ThumbsUp className="h-3 w-3 shrink-0" /> {bronca.upvotes?.[0]?.count || 0}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {podeEditar && onEditar && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Editar ${bronca.title}`}
                    title="Editar"
                    onClick={() => onEditar(bronca)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link to={`/bronca/${bronca.id}`}>Detalhes</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* O rodapé fica fora da lista: paginação que rola junto some justamente
          quando a pessoa chega ao fim e precisa dela. */}
      <div className="flex items-center justify-between gap-2 border-t border-edge-subtle px-3 py-2 sm:px-4">
        <span className="text-[11px] text-content-tertiary tabular-nums">
          {inicio + 1}–{inicio + broncas.length} de {total}
        </span>
        {paginas > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Página anterior"
              disabled={pagina <= 1}
              onClick={() => onPagina(Math.max(1, pagina - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[11px] font-bold text-content-secondary tabular-nums">
              {pagina} / {paginas}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Próxima página"
              disabled={pagina >= paginas}
              onClick={() => onPagina(Math.min(paginas, pagina + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
