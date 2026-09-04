import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, HardHat, Megaphone } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';

// O resumo local de Minha Rua.
//
// POR QUE OS NÚMEROS SÃO CLICÁVEIS SÓ QUANDO LEVAM A ALGUM LUGAR
//
// "13 broncas" que não abre nada é um número decorativo — e um número
// decorativo numa página de serviço público é pior que nenhum, porque promete
// uma lista que não existe.
//
// O DESTINO É A PRÓPRIA RUA, E NÃO A CIDADE
//
// Estes links já levaram a `/mapa?cidade=N` e a `/obras-publicas` sem recorte:
// o número era da rua, o destino era a cidade inteira. Um mapa com quinhentos
// pinos não é a resposta de "quais são as minhas sete" — e como o link não dá
// erro, a leitura de quem clicou é que o app perdeu o filtro no caminho.
//
// `?rua=<id>` faz a tela de destino usar a MESMA geometria que contou aqui
// (migração 228 sobre a regra da 208), então a lista que abre sempre bate com o
// número que foi tocado.
//
// O QUE SAIU DAQUI, E POR QUÊ
//
// A situação de pavimentação já é um dos chips do cabeçalho da página, a uma
// rolada de distância — dito duas vezes, o segundo não acrescentava nada e
// ainda fazia a pessoa conferir se os dois concordavam.
//
// A contagem de fotos saiu porque a galeria está logo ali, com as fotos à
// vista: contar o que já se vê é gastar uma linha para não dizer nada. Quem
// quer todas continua tendo o "Ver todas" do próprio cartão de imagens.
//
// O ZERO APARECE
//
// "0 broncas" é a informação mais valiosa desta faixa: é uma rua sobre a qual
// ninguém reclamou. Esconder os zeros deixaria a faixa parecendo incompleta e
// tiraria justamente o dado que dá orgulho de bairro.

const Numero = ({ Icone, valor, rotulo, para, destaque = false }) => {
  const conteudo = (
    <>
      <Icone
        className={`h-4 w-4 shrink-0 ${destaque ? 'text-status-resolvedFg' : 'text-brand'}`}
        aria-hidden="true"
      />
      <span className="text-sm font-extrabold text-content-primary tabular-nums">{valor}</span>
      <span className="text-xs text-content-tertiary">{rotulo}</span>
    </>
  );

  const classe = 'flex items-center gap-1.5 rounded-full border border-edge-subtle bg-surface-raised px-3 py-1.5';

  if (!para) return <span className={classe}>{conteudo}</span>;
  return (
    <Link to={para} className={`${classe} transition-colors hover:bg-surface-subtle`}>
      {conteudo}
    </Link>
  );
};

const StreetSummary = ({ streetId }) => {
  const [resumo, setResumo] = useState(null);
  const [previas, setPrevias] = useState({ broncas: [], obras: [] });

  useEffect(() => {
    if (!streetId) return;
    let cancelado = false;

    const carregar = async () => {
      const [{ data: dadosResumo, error }, { data: foco }] = await Promise.all([
        supabase.rpc('get_street_summary', { p_street_id: streetId }),
        supabase.rpc('get_street_focus', { p_street_id: streetId }),
      ]);

      // Silencioso: a faixa é um extra sobre uma página que funciona sem ela.
      if (cancelado || error) return;
      setResumo(dadosResumo);

      const idsBroncas = Array.isArray(foco?.report_ids) ? foco.report_ids : [];
      const idsObras = Array.isArray(foco?.work_ids) ? foco.work_ids : [];
      const [broncas, obras] = await Promise.all([
        idsBroncas.length
          ? supabase
              .from('reports')
              .select('id, title, status, address, created_at')
              .in('id', idsBroncas)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] }),
        idsObras.length
          ? supabase
              .from('public_works')
              .select('id, title, status, execution_percentage, last_update')
              .in('id', idsObras)
              .order('last_update', { ascending: false, nullsFirst: false })
              .limit(3)
          : Promise.resolve({ data: [] }),
      ]);

      if (!cancelado) {
        setPrevias({ broncas: broncas.data || [], obras: obras.data || [] });
      }
    };

    void carregar();
    return () => { cancelado = true; };
  }, [streetId]);

  if (!resumo) return null;

  const rotuloDaBronca = (status) => ({
    pending: 'Pendente',
    'in-progress': 'Em andamento',
    resolved: 'Resolvida',
  })[status] || 'Publicada';

  const rotuloDaObra = (status) => ({
    planned: 'Prevista',
    tendered: 'Licitada',
    'in-progress': 'Em andamento',
    stalled: 'Paralisada',
    unfinished: 'Inacabada',
    completed: 'Concluída',
  })[status] || 'Cadastrada';

  const LinhaPrevia = ({ para, Icone, titulo, detalhe }) => (
    <Link
      to={para}
      className="group flex items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-sunken p-3 transition-colors hover:border-brand hover:bg-surface-subtle"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand-subtleFg">
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-content-primary">{titulo}</span>
        <span className="mt-0.5 block truncate text-xs text-content-tertiary">{detalhe}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5" />
    </Link>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Numero
          Icone={Megaphone}
          valor={resumo.broncas}
          rotulo={resumo.broncas === 1 ? 'bronca' : 'broncas'}
          para={`/mapa?rua=${streetId}`}
        />
        <Numero Icone={CheckCircle2} valor={resumo.resolvidas} rotulo="resolvidas" destaque />
        <Numero
          Icone={HardHat}
          valor={resumo.obras}
          rotulo={resumo.obras === 1 ? 'obra' : 'obras'}
          para={`/obras-publicas?rua=${streetId}`}
        />

        {/* Sem traçado, "perto da rua" vira um círculo de 150 m em volta do ponto
            central — pega a rua vizinha. Dizer isso é mais honesto que exibir um
            número redondo que a pessoa vai conferir e achar errado. */}
        {!resumo.preciso && (resumo.broncas > 0 || resumo.obras > 0) && (
          <span className="flex items-center rounded-full bg-surface-subtle px-3 py-1.5 text-xs text-content-tertiary">
            contagem aproximada
          </span>
        )}
      </div>

      {/* No celular os contadores são suficientes. No desktop, a largura total
          permite comparar as ocorrências e as obras sem alongar a página. */}
      {(previas.broncas.length > 0 || previas.obras.length > 0) && (
        <div className="mt-5 hidden gap-5 border-t border-edge-subtle pt-5 xl:grid xl:grid-cols-2">
          {previas.broncas.length > 0 && (
            <section className={previas.obras.length === 0 ? 'xl:col-span-2' : ''}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-content-primary">Broncas recentes</h3>
                <Link to={`/mapa?rua=${streetId}`} className="text-xs font-bold text-brand hover:underline">Ver todas</Link>
              </div>
              <div className={`grid gap-2 ${previas.obras.length === 0 ? 'xl:grid-cols-3' : ''}`}>
                {previas.broncas.map((bronca) => (
                  <LinhaPrevia
                    key={bronca.id}
                    para={`/bronca/${bronca.id}`}
                    Icone={Megaphone}
                    titulo={bronca.title}
                    detalhe={[rotuloDaBronca(bronca.status), bronca.address].filter(Boolean).join(' · ')}
                  />
                ))}
              </div>
            </section>
          )}

          {previas.obras.length > 0 && (
            <section className={previas.broncas.length === 0 ? 'xl:col-span-2' : ''}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-content-primary">Obras próximas</h3>
                <Link to={`/obras-publicas?rua=${streetId}`} className="text-xs font-bold text-brand hover:underline">Ver todas</Link>
              </div>
              <div className={`grid gap-2 ${previas.broncas.length === 0 ? 'xl:grid-cols-3' : ''}`}>
                {previas.obras.map((obra) => (
                  <LinhaPrevia
                    key={obra.id}
                    para={`/obras-publicas/${obra.id}`}
                    Icone={HardHat}
                    titulo={obra.title}
                    detalhe={`${rotuloDaObra(obra.status)}${obra.execution_percentage != null ? ` · ${obra.execution_percentage}% executada` : ''}`}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default StreetSummary;
