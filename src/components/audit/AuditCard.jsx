import { Camera, Ban, Loader2 } from 'lucide-react';
import { PONTOS } from '@/lib/patrolGame';
import { categoriaPorId } from '@/lib/reportCategories';

// A pergunta da auditoria.
//
// POR QUE ELA É UMA PERGUNTA, E NÃO UM ANÚNCIO
//
// O card antigo dizia "Iluminação · Sinalizado por Fulano" e oferecia dois
// botões. Lia como notificação: uma coisa que aconteceu, com ações ao lado.
//
// Mas quem chega aqui não veio ser informado — veio VERIFICAR. Alguém passou
// de carro, marcou um ponto sem foto e seguiu; a única coisa que ainda não se
// sabe é se o problema está mesmo ali. "Tem um problema de iluminação aqui?"
// é literalmente o que a pessoa precisa responder, e formular assim faz as
// duas respostas parecerem o que são: igualmente válidas.
//
// AS DUAS RESPOSTAS PAGAM
//
// Registrar paga mais porque produz uma bronca com prova. Mas "não há nada
// aqui" também é resposta, também exigiu a ida, e também limpa o mapa — o
// sinal sai. Se só uma pagasse, a outra viraria prejuízo, e o incentivo
// apontaria para inventar bronca onde não há.

const PERGUNTAS = {
  buracos: 'Tem um buraco aqui?',
  iluminacao: 'Tem um problema de iluminação aqui?',
};

/** A pergunta da categoria, com um genérico que serve para as que faltarem. */
const perguntaDe = (categoryId, categoryName) =>
  PERGUNTAS[categoryId] ||
  `Tem um problema de ${(categoryName || 'via').toLowerCase()} aqui?`;

const formatarDistancia = (m) => {
  const v = Math.max(0, Math.round(m || 0));
  return v < 1000 ? `${v} m` : `${(v / 1000).toFixed(1).replace('.', ',')} km`;
};

export default function AuditCard({
  sinal,
  distancia,
  enviando,
  onRegistrar,
  onVazio,
  onAdiar,
}) {
  if (!sinal) return null;

  const categoria = categoriaPorId(sinal.category);

  return (
    <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[1002] px-3">
      <div className="rounded-2xl bg-surface-overlay border border-brand/40 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 bg-brand/10 px-4 py-2">
          <span className="text-base leading-none" aria-hidden="true">
            {categoria?.icon || '📍'}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-brand">
            {distancia != null ? `A ${formatarDistancia(distancia)}` : 'Aqui'}
            {sinal.minha
              ? ' · você marcou'
              : sinal.autorNome
              ? ` · marcado por ${sinal.autorNome}`
              : ''}
          </span>
        </div>

        <div className="px-4 pt-3.5 pb-4">
          <p className="text-lg font-extrabold text-content-primary leading-tight">
            {perguntaDe(sinal.category, sinal.categoryName)}
          </p>
          <p className="text-sm text-content-secondary mt-1 leading-snug">
            {sinal.minha
              ? 'Você marcou isto de passagem. Agora dá para registrar com foto.'
              : 'Alguém marcou isto de passagem, sem foto. Sua resposta é o que fecha o caso.'}
          </p>

          <div className="flex flex-col gap-2 mt-3.5">
            <button
              type="button"
              disabled={enviando}
              onClick={() => onRegistrar(sinal)}
              className="w-full h-12 inline-flex items-center gap-2.5 rounded-xl bg-brand text-content-onBrand px-4 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {enviando ? (
                <Loader2 size={18} className="shrink-0 animate-spin" />
              ) : (
                <Camera size={18} className="shrink-0" />
              )}
              <span className="flex-1 text-left font-bold">Registrar</span>
              {/* Fechar o PRÓPRIO sinal paga como cadastro direto (10), não
                  como missão (12) — e o sinal correspondente deixa de pagar os
                  3. Total: exatamente o que registrar de uma vez renderia. Ver
                  o cabeçalho da migração 191. */}
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                +{sinal.minha ? PONTOS.bronca : PONTOS.missao}
              </span>
            </button>

            <button
              type="button"
              disabled={enviando}
              onClick={() => onVazio(sinal)}
              className="w-full h-12 inline-flex items-center gap-2.5 rounded-xl border border-edge-default px-4 text-content-secondary active:bg-surface-subtleHover transition-colors disabled:opacity-50"
            >
              <Ban size={17} className="shrink-0" />
              <span className="flex-1 text-left font-bold text-sm text-content-primary">
                {sinal.minha ? 'Remover minha marcação' : 'Não há nada aqui'}
              </span>
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                {sinal.minha ? '' : `+${PONTOS.vistoria}`}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAdiar(sinal)}
            className="w-full mt-2 h-9 text-sm font-semibold text-content-tertiary active:text-content-secondary"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
