import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, HardHat, Image as ImageIcon, Megaphone, Route } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';

// O resumo local de Minha Rua.
//
// POR QUE OS NÚMEROS SÃO CLICÁVEIS SÓ QUANDO LEVAM A ALGUM LUGAR
//
// "13 broncas" que não abre nada é um número decorativo — e um número
// decorativo numa página de serviço público é pior que nenhum, porque promete
// uma lista que não existe. As broncas levam ao mapa recortado pela cidade; as
// fotos rolam para a galeria da própria página; pavimentação e obras são
// estado, não lista, e ficam sem link de propósito.
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

const ROTULO_PAVIMENTO = {
  paved: 'Pavimentada',
  partially_paved: 'Parcialmente pavimentada',
  unpaved: 'Sem pavimentação',
};

const StreetSummary = ({ streetId, cityId, aoVerFotos }) => {
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

  const pavimento = ROTULO_PAVIMENTO[resumo.status];

  return (
    <div className="flex flex-wrap gap-2">
      <Numero
        Icone={Megaphone}
        valor={resumo.broncas}
        rotulo={resumo.broncas === 1 ? 'bronca' : 'broncas'}
        para={cityId ? `/mapa?cidade=${cityId}` : '/mapa'}
      />
      <Numero Icone={CheckCircle2} valor={resumo.resolvidas} rotulo="resolvidas" destaque />
      <Numero Icone={HardHat} valor={resumo.obras} rotulo={resumo.obras === 1 ? 'obra' : 'obras'} para="/obras-publicas" />

      {pavimento && (
        <span className="flex items-center gap-1.5 rounded-full border border-edge-subtle bg-surface-raised px-3 py-1.5">
          <Route className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-xs font-bold text-content-primary">{pavimento}</span>
        </span>
      )}

      {resumo.fotos > 0 && (
        <button
          type="button"
          onClick={aoVerFotos}
          className="flex items-center gap-1.5 rounded-full border border-edge-subtle bg-surface-raised px-3 py-1.5 transition-colors hover:bg-surface-subtle"
        >
          <ImageIcon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-sm font-extrabold text-content-primary tabular-nums">{resumo.fotos}</span>
          <span className="text-xs text-content-tertiary">{resumo.fotos === 1 ? 'foto' : 'fotos'}</span>
        </button>
      )}

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
