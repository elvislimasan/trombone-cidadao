// Grade de medalhas.
//
// Saiu da central de missões e veio para o perfil, e a razão não é só de
// espaço: medalha e missão são coisas de tempos diferentes.
//
// Missão é o que há para fazer AGORA — ela renova a meta e some da lista quando
// acaba. Medalha é o que já foi feito, para sempre. Misturadas, a central
// ficava metade convite e metade vitrine, e a vitrine é maior: são doze
// troféus contra as poucas missões abertas de cada nível.
//
// O perfil é onde se olha para trás. É o lugar delas.

export default function AchievementGrid({ conquistas }) {
  if (!conquistas?.length) return null;

  const desbloqueadas = conquistas.filter((c) => c.desbloqueada).length;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-base font-extrabold text-content-primary tracking-tight">
          Conquistas
        </h2>
        <span className="text-xs text-content-tertiary tabular-nums">
          {desbloqueadas}/{conquistas.length}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {conquistas.map((c) => (
          <div
            key={c.id}
            className={`rounded-2xl border px-3 py-3 ${
              c.desbloqueada
                ? 'border-edge-subtle bg-brand-subtleBg'
                : 'border-edge-subtle bg-surface-subtle'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-xl leading-none ${
                  c.desbloqueada ? '' : 'grayscale opacity-45'
                }`}
                aria-hidden="true"
              >
                {c.emoji}
              </span>
              <p className="text-xs font-bold text-content-primary leading-tight min-w-0">
                {c.nome}
              </p>
            </div>

            <p className="text-[11px] text-content-tertiary mt-1 leading-snug">
              {c.descricao}
            </p>

            {/* A barra só aparece no que falta. Numa medalha conquistada ela
                seria uma barra cheia que nunca mais mexe — ruído. */}
            {!c.desbloqueada && (
              <>
                <div className="mt-2 h-1 rounded-full bg-surface-sunken overflow-hidden">
                  <div
                    className="h-full rounded-full bg-status-progressFg opacity-70"
                    style={{ width: `${c.progresso * 100}%` }}
                  />
                </div>
                <p className="text-[10px] font-semibold text-content-tertiary mt-1 tabular-nums">
                  {c.rotulo}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
