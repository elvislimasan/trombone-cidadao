import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Edit, HelpCircle, LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SITUACOES, extensaoDaRua, formatarKm } from '@/lib/pavementLength';
import { cepsDaRua } from '@/lib/pavementReport';
import { streetPath } from '@/lib/shareUtils';

// O mapa de pavimentação lido como LISTA.
//
// POR QUE UMA LISTA, SE JÁ HÁ UM MAPA
//
// O mapa responde "onde", e é a leitura certa para quem está na cidade. Ele não
// responde "quais são" — e essa é a pergunta de quem está montando um ofício,
// conferindo o cadastro contra a planilha da prefeitura ou procurando a rua que
// ainda falta. Nessas horas, caçar um traçado entre trezentos é trabalho que a
// lista faz de graça.
//
// Os dois modos leem o MESMO recorte: os filtros e a busca já rodaram antes de
// a lista chegar aqui. Trocar de modo não muda o conjunto, só a forma de olhar
// para ele — se mudasse, o número do painel passaria a mentir num dos dois.
//
// POR QUE PAGINAR EM 30
//
// Uma cidade de porte médio passa de trezentas ruas. Trezentas linhas de uma
// vez são trezentos nós no DOM e uma barra de rolagem inútil: ninguém rola até
// a 280ª procurando alguma coisa — filtra ou busca. Trinta é cerca de uma tela
// e meia de celular, que é o quanto de fato se lê antes de refinar o filtro.

const PAGINA = 30;

const ROTULO_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.id, s.rotulo]));

const CLASSE_SITUACAO = {
  paved: 'border-success-border bg-success-bg text-success-fg',
  partially_paved: 'border-status-pendingBorder bg-status-pendingBg text-status-pendingFg',
  unpaved: 'border-brand/30 bg-brand-subtleBg text-brand-subtleFg',
};

export default function PavementStreetList({ streets, canManage = false, onEditStreet, onIrParaOMapa }) {
  const [pagina, setPagina] = useState(1);

  // A ordem é alfabética, e não a do banco: numa lista de conferência, "onde
  // está a Rua X" só tem resposta rápida se a lista estiver ordenada por nome.
  const ordenadas = useMemo(
    () => [...streets].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')),
    [streets],
  );

  const paginas = Math.max(1, Math.ceil(ordenadas.length / PAGINA));

  // Mudou o recorte, volta para a primeira página. Sem isto, filtrar estando na
  // página 7 daria uma lista vazia que parece "nenhuma rua encontrada".
  useEffect(() => { setPagina(1); }, [ordenadas]);

  const atual = Math.min(pagina, paginas);
  const inicio = (atual - 1) * PAGINA;
  const visiveis = ordenadas.slice(inicio, inicio + PAGINA);

  if (ordenadas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-content-tertiary">
        Nenhuma rua com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="min-h-0 flex-1 divide-y divide-edge-subtle overflow-y-auto">
        {visiveis.map((rua) => {
          const ceps = cepsDaRua(rua);
          const metros = extensaoDaRua(rua);
          return (
            <li key={rua.id} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    to={streetPath(rua)}
                    className="truncate text-sm font-bold text-content-primary hover:text-brand hover:underline"
                  >
                    {rua.name}
                  </Link>
                  {rua.is_unnamed && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-status-pendingBorder bg-status-pendingBg px-1.5 py-0.5 text-[10px] font-semibold text-status-pendingFg">
                      <HelpCircle className="h-3 w-3" /> Sem nome oficial
                    </span>
                  )}
                  {ROTULO_SITUACAO[rua.status] && (
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                        CLASSE_SITUACAO[rua.status] || 'border-edge-subtle bg-surface-subtle text-content-secondary'
                      }`}
                    >
                      {ROTULO_SITUACAO[rua.status]}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-content-tertiary">
                  {[
                    rua.bairro?.name,
                    ceps.length > 0 ? `CEP ${ceps.map((c) => c.cep).join(', ')}` : null,
                    metros > 0 ? formatarKm(metros) : 'sem traçado',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {/* "Ver no mapa" só existe quando há para onde ir: sem ponto
                    cadastrado, o botão levaria a lugar nenhum. */}
                {rua.location && onIrParaOMapa && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Ver ${rua.name} no mapa`}
                    title="Ver no mapa"
                    onClick={() => onIrParaOMapa(rua.location)}
                  >
                    <LocateFixed className="h-4 w-4" />
                  </Button>
                )}
                {canManage && onEditStreet && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Editar ${rua.name}`}
                    title="Editar rua"
                    onClick={() => onEditStreet(rua)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* O rodapé fica fora da área rolável: paginação que rola junto some
          justamente quando a pessoa chega ao fim e precisa dela. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-edge-subtle px-3 py-2 sm:px-4">
        <span className="text-[11px] text-content-tertiary tabular-nums">
          {inicio + 1}–{inicio + visiveis.length} de {ordenadas.length}
        </span>
        {paginas > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Página anterior"
              disabled={atual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[11px] font-bold text-content-secondary tabular-nums">
              {atual} / {paginas}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              aria-label="Próxima página"
              disabled={atual >= paginas}
              onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
