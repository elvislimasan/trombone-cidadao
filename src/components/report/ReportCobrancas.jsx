import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { fraseDeCobranca } from "@/lib/canalDoOrgao";

// Quantas vezes esta bronca já foi para a secretaria.
//
// POR QUE ISTO NÃO É UMA ETAPA DA LINHA DO TEMPO
//
// A primeira entrega vira a etapa "Encaminhada ao órgão" e notifica todo mundo
// que participa — é notícia. A quarta não é: a mesma bronca reaparecendo no
// relatório mensal de novembro não conta nada de novo sobre a prefeitura, e
// gravá-la como etapa significaria um aviso mensal, para todos os participantes
// de todas as broncas abertas, sem nada dentro. Notificação que não traz notícia
// é o que faz a pessoa desligar as notificações — inclusive as que importam.
//
// Então a repetição vira ISTO: uma linha de texto, abaixo da linha do tempo,
// que a pessoa lê quando está olhando a bronca. Informação sem interrupção.
//
// SÓ CONTA ENVIO ENTREGUE
//
// A regra está em `cobrancas_da_bronca` (222) e a frase, em `fraseDeCobranca`.
// "Cobrada 4 vezes" apoiada em e-mails que voltaram seria a mesma falha da
// barra de progresso antiga: número com aparência de fato.

const ReportCobrancas = ({ report }) => {
  const [cobrancas, setCobrancas] = useState(null);

  useEffect(() => {
    if (!report?.id) return;
    let vivo = true;
    supabase
      .rpc("cobrancas_da_bronca", { p_report_id: report.id })
      .then(({ data, error }) => {
        if (!vivo || error) return;
        setCobrancas(data);
      });
    return () => {
      vivo = false;
    };
  }, [report?.id]);

  const frase = fraseDeCobranca(cobrancas);
  if (!frase) return null;

  return (
    <div className="bg-surface-subtle border border-edge-subtle rounded-2xl px-4 py-3">
      <div className="flex items-start gap-2">
        <Send className="w-3.5 h-3.5 text-content-tertiary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-bold text-content-primary leading-tight">
            {frase.titulo}
          </p>
          <p className="text-2xs text-content-secondary mt-0.5">{frase.detalhe}</p>
        </div>
      </div>
    </div>
  );
};

export default ReportCobrancas;
