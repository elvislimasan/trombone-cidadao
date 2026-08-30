import { useState } from 'react';
import { Check, ChevronDown, Download, FileText, Link2 as LinkIcon, Loader2, Map as MapIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TIPOS_DE_RELATORIO } from '@/lib/pavementReport';

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
}) {
  const [seletorAberto, setSeletorAberto] = useState(false);
  const temReferencias = linksDaCidade.pavement_street_map_url || linksDaCidade.pavement_cep_list_url;
  const relatorioSelecionado = TIPOS_VISIVEIS.find((tipo) => tipo.id === tipoRelatorio) || TIPOS_VISIVEIS[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
      <section className="p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
            Referências da prefeitura
          </p>
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

      <section className="border-t border-edge-subtle p-3.5">
        <p id={`${selectId}-label`} className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
          Relatório
        </p>

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

        <p className="mt-1.5 text-[10px] leading-snug text-content-secondary">
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
    </div>
  );
}
