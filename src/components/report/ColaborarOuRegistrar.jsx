import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { enviarAtualizacaoDeBronca } from "@/hooks/useReportUpdate";
import {
  broncaParecida,
  conviteDeColaboracao,
  envioDaColaboracao,
  opcoesPara,
  raioDaCategoria,
} from "@/lib/colaboracao";
import { showAppError, showAppNotice } from "@/lib/appError";

// Colaborar na bronca que já existe, em vez de abrir a segunda.
//
// ONDE ELE APARECE, E POR QUÊ AQUI
//
// No passo de detalhes do cadastro, depois de a categoria e o local já estarem
// escolhidos — que é o primeiro instante em que dá para saber se já existe algo
// parecido. Mais cedo seria adivinhação; mais tarde, depois de a pessoa ter
// tirado foto e escrito a descrição, seria desperdiçar o trabalho dela e ainda
// pedir para desistir.
//
// ELE SUGERE, NUNCA BLOQUEIA
//
// "É outro problema" está sempre na lista, sem atrito. Um app que recusa
// registro por proximidade erra duas vezes: recusa o buraco de verdade a 30 m
// do outro, e ensina que insistir funciona — basta andar meio quarteirão.
//
// COLABORAR NÃO PODE RENDER MENOS QUE DUPLICAR
//
// A observação enviada aqui é uma linha de `report_updates` como qualquer
// outra: passa pela moderação da 108, conta para o quórum da 199 e paga
// Impacto pela 198 quando a bronca fechar. Se colaborar valesse menos, a
// escolha certa seria a mais cara — e ninguém a faria duas vezes.

const ColaborarOuRegistrar = ({ posicao, categoriaId, onColaborou }) => {
  const { user } = useAuth();
  const [candidata, setCandidata] = useState(null);
  const [escolhida, setEscolhida] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCandidata(null);
    setEscolhida("");

    if (!posicao?.lat || !posicao?.lng || !categoriaId) return () => {};

    (async () => {
      // Uma janela generosa na consulta (300 m) e o recorte fino no cliente:
      // o raio que decide é o da categoria (`raioDaCategoria`), e mantê-lo num
      // lugar só evita que a consulta e a regra discordem sobre o que é "perto".
      const { data, error } = await supabase.rpc("rota_do_dia_alvos", {
        p_lat: posicao.lat,
        p_lng: posicao.lng,
        p_raio_m: 300,
        p_limite: 40,
      });
      if (!vivo || error) return;

      setCandidata(
        broncaParecida({
          posicao,
          categoriaId,
          existentes: (data || []).filter((r) => r.tipo === "bronca"),
        })
      );
    })();

    return () => {
      vivo = false;
    };
    // Só as coordenadas: o objeto de posição é recriado a cada mexida no mapa,
    // e depender dele refaria a consulta a cada arrasto do marcador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicao?.lat, posicao?.lng, categoriaId]);

  if (!candidata || dispensado) return null;

  const convite = conviteDeColaboracao(candidata);
  const opcoes = opcoesPara({ report: candidata.report, user });

  const enviar = async () => {
    const envio = envioDaColaboracao({
      formaId: escolhida,
      report: candidata.report,
      mensagem,
    });
    if (!envio) return;

    // "É outro problema": some do caminho e devolve a pessoa ao cadastro que
    // ela já estava fazendo. Nada é gravado na bronca existente.
    if (envio.registraNova) {
      setDispensado(true);
      return;
    }

    setEnviando(true);
    try {
      if (envio.atualizacao) {
        const r = await enviarAtualizacaoDeBronca({
          report: candidata.report,
          updateType: envio.atualizacao.update_type,
          user,
          message: envio.atualizacao.message || "",
        });
        if (!r.ok) throw r.error || new Error("falha ao enviar");
      }

      if (envio.auditoria) {
        await supabase.from("report_audit_requests").insert({
          report_id: envio.auditoria.report_id,
          user_id: user.id,
          motivo: envio.auditoria.motivo,
          observacao: envio.auditoria.observacao,
        });
      }

      showAppNotice({
        title: "Sua observação entrou na bronca",
        description:
          "O apoio continua num caso só, e você recebe crédito quando ele for resolvido.",
      });
      onColaborou?.(candidata.report);
    } catch (error) {
      showAppError({
        title: "Não foi possível colaborar agora",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-brand/30 bg-surface-raised px-4 py-3">
      <p className="text-[13px] font-bold text-content-primary flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-brand" />
        {convite.titulo}
      </p>
      <p className="text-xs text-content-secondary mt-1 leading-relaxed">
        {convite.texto}
      </p>

      <div className="flex flex-col gap-1.5 mt-3">
        {opcoes.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={enviando}
            onClick={() => setEscolhida(escolhida === f.id ? "" : f.id)}
            className={`text-left text-xs font-semibold px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
              escolhida === f.id
                ? "bg-brand text-content-onBrand border-brand"
                : "bg-surface-subtle text-content-secondary border-edge-subtle"
            }`}
          >
            {f.rotulo}
            <span
              className={`block text-2xs font-normal mt-0.5 ${
                escolhida === f.id ? "opacity-80" : "text-content-tertiary"
              }`}
            >
              {f.descricao}
            </span>
          </button>
        ))}
      </div>

      {escolhida && escolhida !== "outro_problema" && (
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Quer contar mais? (opcional)"
          className="w-full mt-2.5 text-xs rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2 text-content-primary placeholder:text-content-tertiary resize-none"
        />
      )}

      {escolhida && (
        <button
          type="button"
          disabled={enviando}
          onClick={enviar}
          className="mt-3 text-2xs font-bold text-content-onBrand bg-brand px-3 py-1.5 rounded-full disabled:opacity-50"
        >
          {enviando
            ? "Enviando…"
            : escolhida === "outro_problema"
            ? "Continuar o cadastro"
            : "Enviar"}
        </button>
      )}

      <p className="mt-2 text-2xs text-content-tertiary">
        A {Math.round(candidata.distancia)} m daqui · raio de{" "}
        {raioDaCategoria(categoriaId)} m para esta categoria
      </p>
    </div>
  );
};

export default ColaborarOuRegistrar;
