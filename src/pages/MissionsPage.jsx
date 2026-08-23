import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, ChevronRight, Loader2, ClipboardCheck } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import MissionList from '@/components/missions/MissionList';
import { useMissions } from '@/hooks/useMissions';
import { CATEGORIAS_SINAL } from '@/lib/reportCategories';
import { NAV_ALERTA, ehNoite } from '@/lib/navGeo';

// Hub das missões: onde a patrulha começa.
//
// POR QUE EXISTE
//
// A patrulha morava atrás de um botão dentro do mapa de consulta — a tela que
// as pessoas abrem para OLHAR, não para agir. Quem não soubesse que o modo
// existia não tinha como descobrir.
//
// Aqui ela ganha o lugar certo, e uma coisa que antes não tinha onde ser dita:
// que patrulha tem tipo. Sair para caçar buraco e sair para conferir poste são
// atividades diferentes, com hora diferente e olhar diferente.
//
// A HORA DA ILUMINAÇÃO
//
// Poste apagado só pode ser julgado no escuro — é a regra dos alertas, e sem
// este aviso a pessoa sairia às duas da tarde, andaria um quilômetro e não
// receberia nada. Pareceria defeito.
//
// A hora vem do `ehNoite`, que calcula a posição do sol para AQUELE lugar: em
// junho, às 17h50 de Brasília, Floresta já está escura e Porto Alegre não. Um
// corte por horário fixo erraria dos dois lados do país.

/** Posição grosseira, só para saber se já escureceu aqui. */
function usePosicaoAproximada() {
  const [posicao, setPosicao] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let vivo = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (vivo) setPosicao({ lat: coords.latitude, lng: coords.longitude });
      },
      // Falhar aqui não é problema: sem posição, a patrulha da iluminação
      // continua disponível com o aviso de que só alerta à noite. Bloquear por
      // falta de informação seria pior que deixar entrar.
      () => {},
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
    );
    return () => { vivo = false; };
  }, []);

  return posicao;
}

const CartaoPatrulha = ({ icone, titulo, descricao, aviso, desabilitado, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={desabilitado}
    className={`w-full flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-colors ${
      desabilitado
        ? 'border-edge-subtle bg-surface-subtle opacity-60 cursor-not-allowed'
        : 'border-edge-subtle bg-surface-raised shadow-elevation-1 hover:bg-surface-subtle active:scale-[0.99]'
    }`}
  >
    <span className="shrink-0 w-12 h-12 rounded-xl bg-brand-subtleBg ring-1 ring-edge-subtle flex items-center justify-center text-2xl">
      {icone}
    </span>

    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold text-content-primary leading-tight">
        {titulo}
      </span>
      <span className="block text-xs text-content-secondary mt-0.5 leading-snug">
        {descricao}
      </span>
      {aviso && (
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-status-pendingBg px-2 py-1 text-[11px] font-semibold text-status-pendingFg">
          <Moon size={12} />
          {aviso}
        </span>
      )}
    </span>

    {!desabilitado && (
      <ChevronRight size={20} className="shrink-0 text-content-tertiary" />
    )}
  </button>
);

export default function MissionsPage() {
  const navigate = useNavigate();
  const posicao = usePosicaoAproximada();
  const { trilhas, pontuacao, concluidas, disponiveis, carregando } =
    useMissions();

  // null = não sabemos ainda (ou o GPS recusou). Diferente de "é dia".
  const noite = useMemo(
    () => (posicao ? ehNoite(Date.now(), posicao.lat, posicao.lng) : null),
    [posicao]
  );

  const patrulhar = (categoria) => navigate(`/patrulhar/${categoria}`);

  return (
    <div className="container max-w-2xl mx-auto w-full px-4 py-6 pb-24">
      <Helmet>
        <title>Missões | Trombone Cidadão</title>
        <meta
          name="description"
          content="Saia em patrulha pela sua cidade e registre o que encontrar pelo caminho."
        />
      </Helmet>

      <PageHeader
        titulo="Missões"
        subtitulo=""
        paraOnde="/feed"
      />

      {/* Estado pessoal antes das ações: quem abre a central quer saber onde
          está antes de escolher o que fazer. */}
      {!carregando && (
        <div className="rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-4 mb-5 shadow-elevation-1">
          <div className="flex items-center gap-3">
            <span className="shrink-0 w-11 h-11 rounded-xl bg-brand-subtleBg ring-1 ring-edge-subtle flex items-center justify-center text-lg font-extrabold text-brand">
              {pontuacao.level}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-content-primary leading-tight">
                {pontuacao.label}
              </p>
              <p className="text-xs text-content-secondary mt-0.5">
                {concluidas} {concluidas === 1 ? 'etapa vencida' : 'etapas vencidas'}
                {disponiveis > 0 && ` · ${disponiveis} em andamento`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-extrabold text-content-primary leading-none tabular-nums">
                {pontuacao.points}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary mt-1">
                pontos
              </p>
            </div>
          </div>

          {/* O bônus aparece separado de propósito: quem não vê o prêmio da
              etapa não persegue a etapa. */}
          {pontuacao.pontosMissoes > 0 && (
            <p className="text-xs text-brand font-semibold mt-2.5">
              +{pontuacao.pontosMissoes} de bônus por missões
            </p>
          )}

          {pontuacao.proxima && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-content-tertiary">
                  Próximo: {pontuacao.proxima.rotulo}
                </span>
                <span className="text-[11px] font-bold text-content-tertiary tabular-nums">
                  faltam {pontuacao.proxima.faltam}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-700"
                  style={{ width: `${pontuacao.proxima.fracao * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── As missões ──
          Vêm primeiro: a tela se chama Missões, e o que ela promete é dizer o
          que há para fazer. As patrulhas ficam logo abaixo, com âncora, porque
          são o DESTINO de metade das missões. */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-lg font-extrabold text-content-primary tracking-tight">
            Suas missões
          </h2>
          <span className="text-xs text-content-tertiary">
            metas que crescem
          </span>
        </div>

        {carregando ? (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-brand" />
          </div>
        ) : trilhas.length === 0 ? (
          <p className="text-sm text-content-secondary">
            Entre na sua conta para acompanhar suas missões.
          </p>
        ) : (
          <MissionList trilhas={trilhas} />
        )}
      </section>


      {/* CONFERIR PONTOS: a outra atividade de rua, e ela vem primeiro.

          Patrulhar é percorrer sem destino — o app avisa o que aparece. Conferir
          é ir até pontos que já existem e fechá-los. As duas viviam na mesma
          tela de patrulha, uma interrompendo a outra; agora são portas
          separadas, e esta fica no topo porque tem fim: os pontos acabam. */}
      <section className="mt-8">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-content-tertiary mb-2.5">
          Conferir o que marcaram
        </h2>

        <Link
          to="/conferir"
          className="flex items-center gap-3.5 rounded-2xl border border-brand/30 bg-brand-subtleBg px-4 py-4 active:scale-[0.99] transition-transform"
        >
          <span className="shrink-0 w-11 h-11 rounded-xl bg-surface-raised ring-1 ring-brand/20 flex items-center justify-center">
            <ClipboardCheck size={20} className="text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-content-primary leading-tight">
              Conferir problemas marcados
            </p>
            <p className="text-xs text-content-secondary mt-0.5 leading-snug">
              Alguém marcou de passagem, sem foto. Vá até lá e responda se o
              problema está mesmo ali.
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-content-tertiary" />
        </Link>
      </section>

      <section id="patrulhas" className="mt-8 scroll-mt-4">
        {/* Não existe "patrulha completa".

            Uma patrulha de tudo entregava alertas de categorias misturadas, e
            quem sai à noite para conferir postes não quer parar num buraco. Com
            uma categoria por vez, o corredor traz só o que interessa, o card
            sabe o que dizer, e a sinalização já abre no tipo certo — um toque a
            menos e nenhuma escolha errada possível. */}
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-content-tertiary mb-2.5">
          Escolha o que procurar
        </h2>

        <div className="flex flex-col gap-2.5">
          {/* CATEGORIAS_SINAL é a lista sem "outros" — a mesma que a folha de
              sinalização usa, e pela mesma razão: uma patrulha de "outros" não
              conseguiria dizer o que procurar. Quem encontrar algo fora das
              categorias registra pela patrulha completa. */}
          {CATEGORIAS_SINAL.map((categoria) => {
            const soANoite = NAV_ALERTA.categoriasNoturnas.includes(categoria.id);
            // Só desabilita quando SABEMOS que é dia. Sem posição, entra com o
            // aviso — a regra é do alerta, e ele explica de novo lá dentro.
            const bloqueada = soANoite && noite === false;

            return (
              <CartaoPatrulha
                key={categoria.id}
                icone={categoria.icon}
                titulo={`Patrulha de ${categoria.name.toLowerCase()}`}
                descricao={
                  soANoite
                    ? 'Confira se os postes da sua rua estão acesos'
                    : `Só as broncas de ${categoria.name.toLowerCase()}`
                }
                aviso={
                  soANoite
                    ? bloqueada
                      ? 'Disponível quando escurecer por aqui'
                      : 'Só alerta depois que escurece'
                    : null
                }
                desabilitado={bloqueada}
                onClick={() => patrulhar(categoria.id)}
              />
            );
          })}
        </div>
      </section>

      {/* "Suas patrulhas" saiu daqui em ago/2026 e foi para o perfil, junto de
          "Meu Painel" e "Broncas Favoritas".

          Esta tela é sobre o que fazer AGORA — as missões abertas e o botão de
          sair patrulhando. Histórico é sobre o que já foi feito, e essa é a
          pergunta que se leva ao perfil. Ter os dois aqui fazia a tela terminar
          olhando para trás. */}
    </div>
  );
}
