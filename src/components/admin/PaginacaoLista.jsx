import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Rodapé de lista do painel admin.
 *
 * Celular rola, desktop pagina — e a regra vale para todas as telas, então
 * mora num lugar só. Antes cada tela tinha (ou não tinha) o seu próprio par de
 * botões, com rótulos e tamanhos diferentes; no celular vinham empilhados, três
 * blocos de largura inteira ocupando meia tela para avançar 8 itens.
 *
 * A sentinela é um `<div>` vazio no fim da lista: quando ele entra na tela, a
 * página seguinte é pedida. O botão "Carregar mais" fica junto de propósito —
 * o app roda dentro de uma WebView, e onde o IntersectionObserver não dispara
 * a lista não pode virar um beco sem saída.
 */
export default function PaginacaoLista({
  isMobile,
  pagina,
  totalPaginas,
  temMais,
  carregarMais,
  irParaPagina,
  sentinelaRef,
  carregando = false,
  mostrarBotoes = true,
  className = '',
}) {
  if (isMobile) {
    if (!temMais && !carregando) return null;
    return (
      <div ref={sentinelaRef} className={`flex justify-center mt-6 ${className}`}>
        {carregando ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </span>
        ) : (
          <Button variant="outline" size="sm" className="rounded-xl h-10" onClick={carregarMais}>
            Carregar mais
          </Button>
        )}
      </div>
    );
  }

  if (!mostrarBotoes || totalPaginas <= 1) return null;

  return (
    <div className={`mt-6 flex items-center justify-between gap-3 ${className}`}>
      <p className="text-xs text-muted-foreground">
        Página {pagina} de {totalPaginas}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={carregando || pagina === 1}
          onClick={() => irParaPagina(pagina - 1)}
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={carregando || pagina === totalPaginas}
          onClick={() => irParaPagina(pagina + 1)}
        >
          Próxima <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
