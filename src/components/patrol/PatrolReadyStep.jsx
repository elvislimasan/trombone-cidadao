import { Palette, Pencil, Volume2, MapPin, ShieldAlert } from 'lucide-react';

import PatrolAvatar from './PatrolAvatar';
import { PatrolTravelModeIcon } from './PatrolTravelModePicker';
import { getPatrolPickStep } from '@/lib/patrolPickFlow';
import { getPatrolAvatarColor, getPatrolAvatarStyle } from '@/lib/patrolAvatarConfig';

// Terceiro passo: conferir e sair.
//
// POR QUE UMA TELA SÓ PARA CONFIRMAR
//
// O passo seguinte a este liga o GPS, prende a tela e começa a falar em voz
// alta. Voltar dali custa caro — é preciso encerrar a patrulha. Uma tela curta
// antes disso deixa as duas escolhas à vista e a menos de um toque de correção,
// o que a rolagem única não dava: lá a lista de focos ficava embaixo do cartão
// do ritmo, e conferir uma escondia a outra.
//
// Cada linha é um botão que volta ao passo dela. O do foco pode não existir:
// quem chegou pelo atalho de uma missão nunca passou por aquele passo, e mandar
// a pessoa para uma tela que ela não viu — para desfazer o que a missão pediu —
// seria oferecer um caminho errado.

const LinhaEscolha = ({ etiqueta, valor, icone, onEditar, editarRotulo }) => {
  const conteudo = (
    <>
      <span className="shrink-0 w-11 h-11 rounded-xl bg-brand-subtleBg text-brand flex items-center justify-center text-xl">
        {icone}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-content-tertiary">
          {etiqueta}
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-extrabold text-content-primary">
          {valor}
        </span>
      </span>
      {onEditar && (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-surface-subtle px-2.5 py-1.5 text-[11px] font-bold text-content-secondary">
          <Pencil size={12} strokeWidth={2.6} />
          Trocar
        </span>
      )}
    </>
  );

  const classes =
    'w-full flex items-center gap-3 rounded-2xl bg-surface-raised px-3.5 py-3 shadow-elevation-1 ring-1 ring-edge-subtle/70';

  if (!onEditar) {
    return <div className={classes}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={onEditar}
      aria-label={editarRotulo}
      className={`${classes} transition-[background-color,transform] duration-200 hover:bg-surface-subtle active:scale-[0.99]`}
    >
      {conteudo}
    </button>
  );
};

export default function PatrolReadyStep({
  categoria,
  modo,
  avatar,
  onPersonalizar,
  onEditarFoco,
  onEditarRitmo,
}) {
  const passo = getPatrolPickStep('pronto');
  const dirigindo = modo.id === 'driving';

  return (
    <section aria-labelledby="patrol-ready-title">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand to-brand-hover px-5 pt-5 pb-7 text-content-onBrand shadow-elevation-2">
        <div className="patrol-mode-grid absolute inset-0 opacity-30" aria-hidden="true" />

        <div className="relative">
          <h2 id="patrol-ready-title" className="font-display text-2xl font-extrabold leading-tight tracking-tight">
            {passo.titulo}
          </h2>
          <p className="mt-1.5 max-w-[80%] text-sm leading-relaxed text-content-onBrand/85">
            {passo.descricao}
          </p>

          {/* Parado, esperando a partida — é o mesmo boneco do mapa, no estado
              de repouso que ele terá enquanto o GPS não vir deslocamento. */}
          <div className="relative mt-6 h-16" aria-hidden="true">
            <div className="absolute inset-x-1 top-1/2 border-t-2 border-dashed border-white/30" />
            <span className="absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white/65" />
            <span className="absolute right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white/65" />
            <div className="patrol-mode-journey patrol-mode-journey--parada">
              <PatrolAvatar
                modo={modo.id}
                avatar={avatar}
                emMovimento={false}
                sobreMarca
                tamanho={52}
                className="patrol-avatar-planted"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <LinhaEscolha
          etiqueta="O que vamos observar"
          valor={categoria.name}
          icone={<span aria-hidden="true">{categoria.icon}</span>}
          onEditar={onEditarFoco}
          editarRotulo="Trocar o foco da patrulha"
        />
        <LinhaEscolha
          etiqueta="Seu ritmo"
          valor={modo.label}
          icone={<PatrolTravelModeIcon mode={modo.id} size={21} strokeWidth={2.4} />}
          onEditar={onEditarRitmo}
          editarRotulo="Trocar a forma de deslocamento"
        />
        {/* A aparência entra na mesma lista das outras escolhas, mas não é um
            passo: ela abre uma folha e volta para cá. */}
        {onPersonalizar && (
          <LinhaEscolha
            etiqueta="Seu boneco"
            valor={`${getPatrolAvatarStyle(avatar?.estilo).label} · ${getPatrolAvatarColor(avatar?.cor).label}`}
            icone={<Palette size={20} strokeWidth={2.4} />}
            onEditar={onPersonalizar}
            editarRotulo="Personalizar o avatar da patrulha"
          />
        )}
      </div>

      {/* O que a patrulha faz — e o que ela não faz. O aviso completo de
          segurança ainda aparece ao entrar; aqui é só o suficiente para ninguém
          ligar o GPS esperando um navegador de rotas. */}
      <ul className="mt-5 space-y-2.5">
        <Nota Icon={MapPin}>
          Avisa quando você chega perto de uma bronca de {categoria.name.toLowerCase()}. Não calcula rotas.
        </Nota>
        <Nota Icon={Volume2}>
          Os alertas são falados — dá para manter os olhos no caminho.
        </Nota>
        <Nota Icon={ShieldAlert}>
          {dirigindo
            ? 'Dirigindo, responda aos alertas só com o carro parado.'
            : 'A pé, pare em um lugar seguro antes de fotografar.'}
        </Nota>
      </ul>
    </section>
  );
}

const Nota = ({ Icon, children }) => (
  <li className="flex items-start gap-2.5">
    <Icon size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
    <span className="text-[13px] leading-relaxed text-content-secondary">{children}</span>
  </li>
);
