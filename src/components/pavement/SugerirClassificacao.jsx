import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useUserLocation } from "@/hooks/useUserLocation";
import { haversine } from "@/lib/navGeo";
import {
  PERGUNTA,
  RECUSAS,
  RESPOSTAS_DE_PAVIMENTO,
  RAIO_DE_OBSERVACAO_M,
  envioDaSugestao,
} from "@/lib/sugestaoPavimento";
import { estadoDeCobertura } from "@/lib/cobertura";
import { rotuloDoStatus } from "@/lib/pavementReport";
import { showAppError, showAppNotice } from "@/lib/appError";

// Pavimentação cidadã, do lado de quem está na rua.
//
// A PERGUNTA VEM ANTES DO DADO, SEMPRE
//
// O cadastro atual da rua está logo acima nesta página — e é exatamente por
// isso que o bloco repete a pergunta em vez de mostrar "confirme se está
// certo". Perguntar "continua pavimentada?" colhe concordância; perguntar "qual
// pavimento você observa?" colhe observação (§36.5). A diferença aparece
// justamente nas ruas em que o cadastro está errado, que são as únicas em que
// a pergunta valeria a pena.
//
// Depois da resposta, o bloco mostra o que estava registrado — aí já não
// enviesa, e é o contexto que a pessoa merece ter.
//
// A DISTÂNCIA DAQUI É SÓ PARA NÃO OFERECER O QUE SERÁ RECUSADO
//
// O cálculo honesto é contra o traçado (MULTILINESTRING), e quem sabe fazê-lo é
// o PostGIS — o gatilho `checar_local_da_sugestao` da 213 mede de novo e é ele
// que decide. Aqui a conta é contra o ponto central da rua, que é uma
// aproximação grosseira e serve para uma coisa só: avisar antes que a pessoa
// escreva. Nunca troque uma pela outra.

const SugerirClassificacao = ({ rua, onEnviada }) => {
  const { user } = useAuth();
  // `request` saiu junto com o botão de ativar GPS: pedir permissão a partir
  // de uma página de história seria pedir por uma tarefa que a pessoa
  // provavelmente não pode fazer agora. Quem já tem o GPS ligado (vindo da
  // Rota do Dia, do mapa ou da patrulha) vê o bloco; os demais, não.
  const { coords, status } = useUserLocation();
  const [sugestoes, setSugestoes] = useState([]);
  // A pergunta só aparece se o banco souber recebê-la. Sem isto, num ambiente
  // com a 213 ainda não aplicada o bloco convidaria a responder e o envio
  // falharia — que é o pior desfecho possível para quem está de pé na rua.
  const [disponivel, setDisponivel] = useState(true);
  const [escolhida, setEscolhida] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondeu, setRespondeu] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!rua?.id) return () => {};

    (async () => {
      const { data, error } = await supabase
        .from("pavement_suggestions")
        .select("user_id, street_id, resposta, status, local_confere, created_at")
        .eq("street_id", rua.id)
        .neq("status", "recusada")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!vivo) return;
      setDisponivel(!error);
      setSugestoes(data || []);
    })();

    return () => {
      vivo = false;
    };
  }, [rua?.id]);

  const cobertura = useMemo(
    () => estadoDeCobertura({ rua, sugestoes }),
    [rua, sugestoes]
  );

  // Aproximação: ponto central contra ponto da pessoa. O servidor mede contra o
  // traçado e tem a palavra final.
  const distancia = useMemo(() => {
    const centro = rua?.location;
    if (!coords || !centro?.lat || !centro?.lng) return null;
    return haversine(coords, { lat: centro.lat, lng: centro.lng });
  }, [coords, rua?.location]);

  // SÓ APARECE PARA QUEM ESTÁ NA RUA — e a razão é o print que motivou isto.
  //
  // Antes o bloco abria sempre, no topo de uma página que é sobre a HISTÓRIA da
  // rua: quem chega ali costuma estar em casa, curioso pelo nome da avenida.
  // Pior, ele avisava "você precisa estar na rua para responder" e logo abaixo
  // deixava escolher e enviar — dizia que não dava e oferecia mesmo assim.
  //
  // Perguntar sobre pavimento é tarefa de campo, e tarefa de campo só faz
  // sentido no campo. Fora do raio o bloco simplesmente não existe, e a página
  // volta a ser o que é.
  //
  // O custo é de descoberta: quem nunca passou pela rua não fica sabendo que
  // pode responder. É o custo certo — a alternativa era um convite permanente
  // que a maioria não pode aceitar, e convite que não se pode aceitar ensina a
  // ignorar convites.
  const naRua =
    status === 'granted' && distancia != null && distancia <= RAIO_DE_OBSERVACAO_M;

  if (!user || !rua?.id || !disponivel || !naRua) return null;

  const enviar = async () => {
    const envio = envioDaSugestao({
      respostaId: escolhida,
      rua,
      distanciaM: distancia,
      observacao,
    });

    if (envio.motivo) {
      // "Não sei" não é erro: é a resposta honesta, e o aviso reconhece isso.
      showAppNotice({
        title: envio.motivo === "nao_sei" ? "Tudo bem" : "Não deu para registrar",
        description: RECUSAS[envio.motivo] || "Tente de novo.",
      });
      if (envio.motivo === "nao_sei") setEscolhida("");
      return;
    }

    setEnviando(true);
    try {
      if (envio.auditoria) {
        // Correção de cadastro não entra por aqui: vai para a MESMA fila de
        // auditoria das broncas (`report_audit_requests`, aberta para ruas na
        // 213). Duas filas seriam dois lugares para a moderação esquecer de
        // olhar.
        const { error } = await supabase.from("report_audit_requests").insert({
          street_id: envio.auditoria.street_id,
          user_id: user.id,
          motivo: envio.auditoria.motivo,
          observacao: envio.auditoria.observacao,
        });
        // 23505 é o índice de "um pedido aberto por pessoa por motivo": avisar
        // já foi feito, e repetir não é erro que a pessoa precise resolver.
        if (error && error.code !== "23505") throw error;

        showAppNotice({
          title: "Isso vai para a moderação",
          description:
            "Corrigir nome, traçado ou CEP exige quem responde pela cidade. Seu aviso está na fila.",
        });
        setEscolhida("");
        setObservacao("");
        return;
      }

      const { error } = await supabase.from("pavement_suggestions").insert({
        ...envio.sugestao,
        user_id: user.id,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      if (error) throw error;

      setRespondeu(true);
      setEscolhida("");
      setObservacao("");
      showAppNotice({
        title: "Obrigado por olhar a rua",
        description:
          "Sua resposta entra na cobertura. Quando outra pessoa disser o mesmo, a moderação avalia a mudança no cadastro.",
      });
      onEnviada?.();
    } catch (error) {
      showAppError({
        title: "Não foi possível enviar",
        description:
          error?.code === "23505"
            ? "Você já respondeu sobre esta rua nesta semana."
            : error?.message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-edge-subtle bg-surface-raised px-4 py-4">
      <p className="text-[13px] font-bold text-content-primary flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-brand" />
        {PERGUNTA.texto}
      </p>
      <p className="text-xs text-content-secondary mt-1 leading-relaxed">
        {PERGUNTA.ajuda}
      </p>

      {/* Sem aviso de "você está longe" e sem botão de ativar GPS: o bloco só
          chega aqui quando a pessoa já está na rua com a localização ligada. */}
      <>
          <div className="flex flex-col gap-1.5 mt-3">
            {RESPOSTAS_DE_PAVIMENTO.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={enviando}
                onClick={() => setEscolhida(escolhida === r.id ? "" : r.id)}
                className={`text-left text-xs font-semibold px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
                  escolhida === r.id
                    ? "bg-brand text-content-onBrand border-brand"
                    : "bg-surface-subtle text-content-secondary border-edge-subtle"
                }`}
              >
                {r.rotulo}
                <span
                  className={`block text-2xs font-normal mt-0.5 ${
                    escolhida === r.id ? "opacity-80" : "text-content-tertiary"
                  }`}
                >
                  {r.detalhe}
                </span>
              </button>
            ))}

            {/* A válvula: quem viu erro de cadastro tem canal sem que a
                pergunta precise crescer. */}
            <button
              type="button"
              disabled={enviando}
              onClick={() =>
                setEscolhida(escolhida === "fora_do_escopo" ? "" : "fora_do_escopo")
              }
              className={`text-left text-xs font-semibold px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
                escolhida === "fora_do_escopo"
                  ? "bg-brand text-content-onBrand border-brand"
                  : "bg-surface-subtle text-content-tertiary border-edge-subtle"
              }`}
            >
              O nome, o traçado ou o CEP estão errados
            </button>
          </div>

          {escolhida && (
            <>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Quer detalhar? (opcional)"
                className="w-full mt-2.5 text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary resize-none"
              />
              <button
                type="button"
                disabled={enviando}
                onClick={enviar}
                className="mt-2 text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Enviar resposta"}
              </button>
            </>
          )}
      </>

      {/* O que já se sabe só aparece DEPOIS de responder — ou para quem não vai
          responder agora, que é o caso de quem já respondeu esta semana. */}
      {respondeu && (
        <p className="mt-3 text-2xs text-content-secondary leading-relaxed">
          No cadastro, esta rua está como <strong>{rotuloDoStatus(rua.status)}</strong>.{" "}
          {cobertura.rotulo}.
        </p>
      )}
    </div>
  );
};

export default SugerirClassificacao;
