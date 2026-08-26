import { User, Pencil, Volume2, MapPin, ShieldAlert } from 'lucide-react';

import PatrolAvatar from './PatrolAvatar';
import { PatrolTravelModeIcon } from './PatrolTravelModePicker';
import { getPatrolPickStep } from '@/lib/patrolPickFlow';
import { getPatrolAvatarSexo } from '@/lib/patrolAvatarConfig';

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
  onEscolherBoneco,
  onEditarFoco,
  onEditarRitmo,
}) {
  const passo = getPatrolPickStep('pronto');
  const dirigindo = modo.id === 'driving';

  return (
    <section aria-labelledby="patrol-ready-title">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand to-brand-hover text-content-onBrand shadow-elevation-2">
        {/* A MESMA CIDADE DO PASSO ANTERIOR, PARADA
            Aqui a patrulha ainda não começou: o boneco espera e o mapa espera
            junto. Rolar as ruas com o GPS desligado prometeria um deslocamento
            que não está acontecendo. */}
        <div className="patrol-mode-map patrol-mode-map--parado" aria-hidden="true">
          <div className="patrol-mode-map__grade" />
          <div className="patrol-mode-map__rota" />
          <div className="patrol-mode-map__luz" />
        </div>

        <div className="relative px-5 pt-5 pb-7">
          <h2 id="patrol-ready-title" className="font-display text-2xl font-extrabold leading-tight tracking-tight">
            {passo.titulo}
          </h2>
          <p className="mt-1.5 max-w-[80%] text-sm leading-relaxed text-content-onBrand/85">
            {passo.descricao}
          </p>

          {/* Parado, esperando a partida — é o mesmo boneco do mapa, no estado
              de repouso que ele terá enquanto o GPS não vir deslocamento. */}
          <div className="relative mt-4 h-[150px]" aria-hidden="true">
            <div className="patrol-mode-journey patrol-mode-journey--palco">
              <PatrolAvatar
                modo={modo.id}
                avatar={avatar}
                camera="frente"
                emMovimento={false}
                sobreMarca
                tamanho={96}
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
        {/* O boneco entra na conferência, mas sua escolha continua opcional. */}
        {onEscolherBoneco && (
          <LinhaEscolha
            etiqueta="Seu boneco"
            valor={`${getPatrolAvatarSexo(avatar?.sexo).label} · Urbano`}
            icone={<User size={20} strokeWidth={2.4} />}
            onEditar={onEscolherBoneco}
            editarRotulo="Trocar o boneco da patrulha"
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
