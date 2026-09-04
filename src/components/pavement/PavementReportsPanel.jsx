import { useMemo, useState } from 'react';
import { Check, ChevronDown, BarChart3, Clock, Download, FileText, Landmark, Link2 as LinkIcon, Loader2, Map as MapIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TIPOS_DE_RELATORIO } from '@/lib/pavementReport';
import { SITUACOES, percentual } from '@/lib/pavementLength';

const TIPOS_VISIVEIS = TIPOS_DE_RELATORIO.filter((tipo) => tipo.id !== 'bairros');

export default function PavementReportsPanel({
  linksDaCidade,
  podeGerenciar,
  cidadeId,
  onEditarLinks,
  tipoRelatorio,
  onTipoRelatorioChange,
  downloading,
  onDownloadCsv,
  onDownloadPdf,
  selectId = 'tipo-relatorio',
  resumo = null,
  atualizadoEm = null,
  detalhado = false,
}) {
  const [seletorAberto, setSeletorAberto] = useState(false);

  // A ordem vem de `SITUACOES`, que é a mesma da legenda do mapa e da faixa de
  // números do topo. Três leituras da mesma cidade em ordens diferentes fariam
  // a pessoa reconferir a cada olhada.
  const fatias = useMemo(
    () => SITUACOES
      .map((s) => ({ id: s.id, token: s.token, rotulo: s.rotulo, valor: resumo?.ruasPorSituacao?.[s.id] || 0 }))
      .filter((f) => f.valor > 0),
    [resumo],
  );
  const temReferencias = linksDaCidade.pavement_street_map_url || linksDaCidade.pavement_cep_list_url;
  const relatorioSelecionado = TIPOS_VISIVEIS.find((tipo) => tipo.id === tipoRelatorio) || TIPOS_VISIVEIS[0];

  // NO DESKTOP OS BLOCOS VIRAM CARTÕES SEPARADOS
  //
  // Compacto, o painel é um cartão só com uma linha divisória: cabe na gaveta e
  // no empilhado do mobile. Na coluna de 1440px+ há espaço para o que a leitura
  // pede — cada assunto com moldura própria, ícone e título de verdade em vez de
  // um rótulo minúsculo em versalete.
  const molduraExterna = detalhado
    ? 'grid gap-3'
    : 'overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm';
  const molduraDaSecao = detalhado
    ? 'rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm'
    : 'p-3.5';

  return (
    <div className={molduraExterna}>
      <section className={molduraDaSecao}>
        <div className="flex items-center justify-between gap-3">
          {detalhado ? (
            <p className="flex min-w-0 items-center gap-2.5 text-sm font-bold text-content-primary">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
                <Landmark className="h-4 w-4" />
              </span>
              Referências da prefeitura
            </p>
          ) : (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
              Referências da prefeitura
            </p>
          )}
          {podeGerenciar && cidadeId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-[11px] text-content-secondary"
              onClick={onEditarLinks}
            >
              <LinkIcon className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </div>

        {temReferencias ? (
          <div className="mt-2 grid gap-1.5">
            {linksDaCidade.pavement_street_map_url && (
              <a
                href={linksDaCidade.pavement_street_map_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-edge-subtle bg-surface-subtle px-2.5 py-2 text-xs font-bold text-brand transition-colors hover:border-brand/30 hover:bg-brand-subtleBg"
              >
                <MapIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">Mapa de ruas oficial</span>
              </a>
            )}
            {linksDaCidade.pavement_cep_list_url && (
              <a
                href={linksDaCidade.pavement_cep_list_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-edge-subtle bg-surface-subtle px-2.5 py-2 text-xs font-bold text-brand transition-colors hover:border-brand/30 hover:bg-brand-subtleBg"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">Lista de ruas com CEP</span>
              </a>
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] leading-relaxed text-content-secondary">
            {podeGerenciar
              ? 'Adicione o mapa de ruas e a lista de CEPs mais recentes da prefeitura.'
              : 'Nenhum documento de referência cadastrado para esta cidade.'}
          </p>
        )}
      </section>

      <section className={detalhado ? molduraDaSecao : 'border-t border-edge-subtle p-3.5'}>
        {detalhado ? (
          <p id={`${selectId}-label`} className="mb-3 flex items-center gap-2.5 text-sm font-bold text-content-primary">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success-fg">
              <BarChart3 className="h-4 w-4" />
            </span>
            Resumo do relatório
          </p>
        ) : (
          <p id={`${selectId}-label`} className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
            Relatório
          </p>
        )}

        <Popover open={seletorAberto} onOpenChange={setSeletorAberto}>
          <PopoverTrigger asChild>
            <button
              id={selectId}
              type="button"
              aria-labelledby={`${selectId}-label ${selectId}-value`}
              aria-haspopup="listbox"
              aria-expanded={seletorAberto}
              className="mt-2 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-edge-default bg-surface-raised px-2.5 text-left text-xs font-semibold text-content-primary outline-none transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span id={`${selectId}-value`} className="min-w-0 truncate">
                {relatorioSelecionado.label}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-content-tertiary transition-transform ${seletorAberto ? 'rotate-180' : ''}`} />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={5}
            collisionPadding={12}
            className="z-[10002] w-[--radix-popover-trigger-width] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border-edge-subtle p-1.5 shadow-elevation-3"
          >
            <div
              role="listbox"
              aria-labelledby={`${selectId}-label`}
              className="max-h-[min(17rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain"
            >
              {TIPOS_VISIVEIS.map((tipo) => {
                const selecionado = tipo.id === relatorioSelecionado.id;

                return (
                  <button
                    key={tipo.id}
                    type="button"
                    role="option"
                    aria-selected={selecionado}
                    onClick={() => {
                      onTipoRelatorioChange(tipo.id);
                      setSeletorAberto(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      selecionado
                        ? 'bg-brand-subtleBg font-bold text-brand'
                        : 'text-content-primary hover:bg-surface-subtle'
                    }`}
                  >
                    <span className="min-w-0 flex-1 leading-snug">{tipo.label}</span>
                    {selecionado && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* O ANEL SÓ EXISTE ONDE HÁ ESPAÇO PARA ELE
            Este painel aparece em três lugares: coluna lateral do desktop
            (≥1440px), bloco empilhado no mobile e gaveta. Um gráfico de 160px
            com legenda de quatro linhas é confortável no primeiro e sufoca os
            outros dois, que já rolam. Por isso `detalhado` é uma decisão de quem
            monta a tela, e não um `hidden lg:block` aqui dentro — a versão
            compacta não paga o custo de renderizar o que não vai mostrar. */}
        {detalhado && resumo && resumo.ruas > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-[104px] w-[104px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fatias}
                    dataKey="valor"
                    innerRadius="62%"
                    outerRadius="100%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {fatias.map((fatia) => (
                      <Cell key={fatia.id} className={`fatia-pav--${fatia.token}`} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="min-w-0 flex-1 space-y-1.5">
              {fatias.map((fatia) => (
                <li key={fatia.id} className="flex items-center gap-2 text-[11px]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ponto-legenda-pav--${fatia.token}`} />
                  <span className="min-w-0 flex-1 truncate text-content-secondary">{fatia.rotulo}</span>
                  <span className="shrink-0 font-bold tabular-nums text-content-primary">
                    {fatia.valor}
                    <span className="ml-1 font-normal text-content-tertiary">{percentual(fatia.valor, resumo.ruas)}%</span>
                  </span>
                </li>
              ))}
              {/* Sem porcentagem: uma rua sem traçado também está em alguma das
                  situações acima, então somar os quatro passaria de 100%. */}
              <li className="flex items-center gap-2 border-t border-edge-subtle pt-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full ponto-legenda-pav--unknown" />
                <span className="min-w-0 flex-1 truncate text-content-secondary">Rua sem traçado</span>
                <span className="shrink-0 font-bold tabular-nums text-content-primary">{resumo.ruasSemTracado}</span>
              </li>
            </ul>
          </div>
        )}

        <p className="mt-2.5 text-[10px] leading-snug text-content-secondary">
          {relatorioSelecionado.descricao}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={onDownloadCsv}
            disabled={downloading}
            variant="outline"
            size="sm"
            className="min-w-0 gap-1.5 px-2 text-[11px]"
            title="Baixar planilha para abrir no Excel"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            Baixar CSV
          </Button>
          <Button
            onClick={onDownloadPdf}
            disabled={downloading}
            size="sm"
            className="min-w-0 gap-1.5 px-2 text-[11px]"
          >
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 shrink-0" />
                Baixar PDF
              </>
            )}
          </Button>
        </div>
      </section>

      {/* NÃO DIZ "FONTE: PREFEITURA"
          O desenho pedia essa linha, e ela seria falsa: a base é mapeamento
          colaborativo conferido contra os documentos da prefeitura, não um
          extrato dela. Onde há referência cadastrada, o texto diz isso — onde
          não há, diz o que de fato existe. */}
      {detalhado && atualizadoEm && (
        <section className={`${molduraDaSecao} bg-surface-subtle`}>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
            <Clock className="h-3 w-3" /> Dados atualizados
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-content-secondary">
            Última alteração em {atualizadoEm}.
            <span className="mt-0.5 block text-content-tertiary">
              {temReferencias
                ? 'Mapeamento colaborativo, conferido com as referências da prefeitura acima.'
                : 'Mapeamento colaborativo de moradores e da equipe da cidade.'}
            </span>
          </p>
        </section>
      )}
    </div>
  );
}
