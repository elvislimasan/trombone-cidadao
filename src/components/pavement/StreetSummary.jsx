import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, HardHat, Megaphone } from 'lucide-react';

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

  useEffect(() => {
    if (!streetId) return;
    let cancelado = false;
    supabase.rpc('get_street_summary', { p_street_id: streetId }).then(({ data, error }) => {
      // Silencioso: a faixa é um extra sobre uma página que funciona sem ela.
      if (!cancelado && !error) setResumo(data);
    });
    return () => { cancelado = true; };
  }, [streetId]);

  if (!resumo) return null;

  return (
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
  );
};

export default StreetSummary;
