import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Loader2, MapPin, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { showAppError } from '@/lib/appError';

// A fila de auditoria de cadastro.
//
// POR QUE ESTA TELA PRECISOU EXISTIR JUNTO COM A TABELA
//
// `report_audit_requests` nasceu na 212 recebendo pedidos de três lugares:
// pular uma parada por "o ponto está no lugar errado", colaborar escolhendo
// "algo está errado aqui", e o conflito de recência. Uma fila que ninguém lê é
// o mesmo erro de `report_timeline` — uma tabela escrita por várias telas, lida
// por nenhuma, que dá a impressão de que o problema foi tratado.
//
// NÃO É A TELA DE MODERAÇÃO DE CONTEÚDO, E NÃO DEVIA SER
//
// `ModerationPage` decide se algo é publicável. Aqui não se aprova nem se
// rejeita nada: verifica-se se o CADASTRO está certo — ponto, categoria,
// descrição — ou se alguém relatou risco no local. As duas perguntas exigem
// ações diferentes (uma responde ao autor, a outra corrige a bronca), e juntá-las
// numa fila só faria a segunda ser despachada com o hábito da primeira.
//
// "RISCO NO LOCAL" APARECE AQUI E EM LUGAR NENHUM MAIS
//
// A policy da 212 já restringe a leitura a quem responde pela cidade. Publicar
// onde alguém se sentiu inseguro seria anunciar qual rua está sem gente olhando
// (§36.6) — e é o tipo de dado que, uma vez exposto, não se recolhe.

const MOTIVO = {
  ponto_errado: {
    rotulo: 'Ponto no lugar errado',
    ajuda: 'Alguém chegou às coordenadas e não encontrou nada parecido.',
  },
  risco_no_local: {
    rotulo: 'Risco no local',
    ajuda: 'Relato privado. Não deve ser publicado nem virar aviso público.',
  },
  colaboracao: {
    rotulo: 'Cadastro inconsistente',
    ajuda: 'Ponto, categoria ou descrição não batem com o que a pessoa viu.',
  },
  conflito: {
    rotulo: 'Relatos divergentes',
    ajuda: 'Duas observações recentes se contradizem. Mais uma não resolve.',
  },
  outro: { rotulo: 'Outro', ajuda: null },
};

const AuditRequestsPage = () => {
  const { user } = useAuth();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [agindoEm, setAgindoEm] = useState(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from('report_audit_requests')
      // Dois alvos possíveis desde a 213: bronca ou rua do mapa de
      // pavimentação. A fila é uma só de propósito — o pedido é o mesmo
      // ("alguém confira este cadastro"), muda só o que se aponta, e duas filas
      // seriam dois lugares para esquecer de olhar.
      //
      // O NOME DA RUA VEM NUMA SEGUNDA CONSULTA, E NÃO NUM EMBED
      //
      // `street_id` e a chave estrangeira para `pavement_streets` só existem
      // depois da 213. Com o embed no select, esta tela — que é da 212 —
      // quebraria inteira num ambiente com a 212 aplicada e a 213 ainda não.
      //
      // Uma fila de moderação que não abre é pior que uma fila sem o nome da
      // rua: o custo do desacoplamento é uma consulta a mais, e ele paga o
      // caso em que as migrações entram separadas.
      //
      // `*` e não a lista de colunas: pedir `street_id` pelo nome falharia
      // antes da 213, e com `*` a coluna simplesmente não vem — que é o que
      // `ehRua` já trata como "é uma bronca".
      .select(
        '*, ' +
          'autor:profiles!report_audit_requests_user_id_fkey(name), ' +
          'report:reports!report_audit_requests_report_id_fkey(id, title, address, category_id, status)'
      )
      .eq('status', 'aberta')
      .order('created_at', { ascending: true });

    if (error) {
      showAppError({
        title: 'Não foi possível carregar a fila',
        description: error.message,
        variant: 'destructive',
      });
      setItens([]);
      setCarregando(false);
      return;
    }

    const linhas = data || [];

    // `street_id` some do retorno quando a coluna ainda não existe — e é
    // exatamente por isso que a leitura é opcional aqui.
    const idsDeRua = [...new Set(linhas.map((l) => l.street_id).filter(Boolean))];
    let ruas = {};
    if (idsDeRua.length > 0) {
      const { data: nomes } = await supabase
        .from('pavement_streets')
        .select('id, name')
        .in('id', idsDeRua);
      ruas = Object.fromEntries((nomes || []).map((r) => [r.id, r]));
    }

    setItens(linhas.map((l) => ({ ...l, rua: l.street_id ? ruas[l.street_id] : null })));
    setCarregando(false);
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  // Resolver e descartar gravam a MESMA coisa com desfecho diferente, e os dois
  // ficam registrados. Sumir com o pedido sem dizer o que se concluiu deixaria
  // a próxima pessoa reabrindo o mesmo caso.
  const fechar = async (item, status, desfecho) => {
    setAgindoEm(`${item.id}-${status}`);
    const { error } = await supabase
      .from('report_audit_requests')
      .update({
        status,
        desfecho,
        resolvido_por: user?.id || null,
        resolvido_em: new Date().toISOString(),
      })
      .eq('id', item.id);

    setAgindoEm(null);
    if (error) {
      showAppError({
        title: 'Não foi possível fechar o pedido',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setItens((atuais) => atuais.filter((i) => i.id !== item.id));
  };

  return (
    <>
      <Helmet>
        <title>Auditoria de cadastro — Trombone Cidadão</title>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 pt-4 pb-24">
        <PageHeader
          titulo="Auditoria de cadastro"
          subtitulo="Pontos errados, categorias trocadas e relatos de risco"
          paraOnde="/admin"
        />

        {carregando ? (
          <div className="flex items-center gap-2 text-xs text-content-tertiary py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando a fila…
          </div>
        ) : itens.length === 0 ? (
          <p className="text-xs text-content-tertiary py-10 text-center">
            Nenhum pedido aberto. Nada aqui é uma boa notícia.
          </p>
        ) : (
          <ul className="space-y-2">
            {itens.map((item) => {
              const motivo = MOTIVO[item.motivo] || MOTIVO.outro;
              const privado = item.motivo === 'risco_no_local';
              const ehRua = !!item.street_id;
              const titulo = ehRua
                ? item.rua?.name || 'Rua sem nome'
                : item.report?.title || 'Bronca sem título';
              const destino = ehRua
                ? `/mapa-pavimentacao/rua/${item.street_id}`
                : `/bronca/${item.report_id}`;

              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-2xs font-bold uppercase tracking-[0.12em] text-content-tertiary flex items-center gap-1">
                        {privado && <AlertTriangle className="w-3 h-3 text-danger" />}
                        {motivo.rotulo}
                      </p>
                      <p className="text-[13px] font-bold text-content-primary mt-1 leading-tight">
                        {titulo}
                      </p>
                      <p className="text-2xs text-content-tertiary mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          {ehRua
                            ? 'Rua do mapa de pavimentação'
                            : item.report?.address || 'Sem endereço registrado'}
                        </span>
                      </p>
                    </div>

                    <Link
                      to={destino}
                      className="flex-shrink-0 text-2xs font-bold text-brand underline underline-offset-2"
                    >
                      Abrir
                    </Link>
                  </div>

                  {item.observacao && (
                    <p className="text-xs text-content-secondary mt-2 leading-relaxed rounded-xl bg-surface-subtle px-3 py-2">
                      {item.observacao}
                    </p>
                  )}

                  {motivo.ajuda && (
                    <p className="text-2xs text-content-tertiary mt-1.5">{motivo.ajuda}</p>
                  )}

                  <p className="text-2xs text-content-tertiary mt-1.5">
                    {item.autor?.name || 'Alguém'} ·{' '}
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </p>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      disabled={!!agindoEm}
                      onClick={() => fechar(item, 'resolvida', 'corrigido')}
                      className="inline-flex items-center gap-1 text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
                    >
                      {agindoEm === `${item.id}-resolvida` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Corrigi
                    </button>
                    <button
                      type="button"
                      disabled={!!agindoEm}
                      onClick={() => fechar(item, 'descartada', 'sem_problema')}
                      className="inline-flex items-center gap-1 text-2xs font-semibold text-content-secondary border border-edge-subtle px-3 py-1.5 rounded-full disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                      Está correto
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
};

export default AuditRequestsPage;
