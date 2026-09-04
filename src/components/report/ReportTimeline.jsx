import { Building2, CheckCircle2, ShieldCheck, User, Users, XCircle } from "lucide-react";
import Icon from "@/design-system/icons";
import {
  FONTE_CIDADAO,
  FONTE_COMUNIDADE,
  FONTE_MODERACAO,
  FONTE_ORGAO,
  ROTULO_DA_FONTE,
  linhaDoTempoPublica,
} from "@/lib/reportTimeline";

// A linha do tempo com proveniência (fase 1 do roadmap revisado, §36.6).
//
// SUBSTITUI A BARRA DE QUATRO ETAPAS
//
// `ReportProgress` derivava Recebido / Em análise / Em execução / Resolvido de
// `report.status` — e o próprio componente documentava o problema: o banco não
// tem status de análise, então a etapa ficava "concluída por inferência". A
// barra afirmava duas coisas que ninguém tinha dito, e não dizia quem tinha
// dito as outras duas.
//
// Aqui cada linha carrega as cinco respostas que o plano exige: quem informou,
// quando, com que evidência, o que falta e por que algo foi recusado.
//
// NENHUMA PORCENTAGEM
//
// Não existe "72% concluído" nesta tela, de propósito. A execução depende da
// prefeitura, e uma barra cujo denominador é quantidade de etapas transformaria
// uma promessa de terceiro em progresso medido. O que substitui é o bloco de
// aviso: enquanto a etapa mais avançada depender de terceiro, a tela diz isso
// em texto.

const ICONE_DA_FONTE = {
  [FONTE_CIDADAO]: User,
  [FONTE_COMUNIDADE]: Users,
  [FONTE_MODERACAO]: ShieldCheck,
  [FONTE_ORGAO]: Building2,
};

const EventoDaLinha = ({ evento, ultimo, formatDateTime, onAbrirEvidencia }) => {
  const Glifo = evento.recusa ? XCircle : ICONE_DA_FONTE[evento.fonte] || CheckCircle2;
  const recusa = !!evento.recusa;

  return (
    <li className="flex gap-3">
      {/* Trilho: ícone + linha vertical até o próximo fato */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            recusa
              ? "bg-danger-subtleBg text-danger-subtleFg"
              : "bg-brand text-content-onBrand"
          }`}
        >
          <Glifo className="w-4 h-4" strokeWidth={2} />
        </div>
        {!ultimo && <div className="w-px flex-1 min-h-[16px] bg-edge-default mt-1" />}
      </div>

      <div className={`flex-1 min-w-0 ${ultimo ? "" : "pb-4"}`}>
        <p className="text-[13px] font-bold leading-tight text-content-primary">
          {evento.titulo}
        </p>

        {/* Proveniência: quem informou e quando. As duas na mesma linha porque
            uma sem a outra não sustenta a afirmação. */}
        <p className="text-2xs text-content-tertiary mt-0.5">
          {ROTULO_DA_FONTE[evento.fonte]}
          {evento.autorNome ? ` · ${evento.autorNome}` : ""}
          {evento.em
            ? ` · ${formatDateTime(evento.em).replace(",", " às")}`
            : " · sem data registrada"}
        </p>

        {evento.detalhe && (
          <p className="text-xs text-content-secondary mt-1 leading-relaxed">
            {evento.detalhe}
          </p>
        )}

        {/* O motivo de uma recusa nunca fica escondido atrás de "ver mais": é a
            informação que a pessoa foi buscar. */}
        {evento.motivo && (
          <p
            className={`text-xs mt-1.5 leading-relaxed rounded-xl px-3 py-2 ${
              recusa
                ? "bg-danger-subtleBg text-danger-subtleFg"
                : "bg-surface-subtle text-content-secondary"
            }`}
          >
            {evento.motivo}
          </p>
        )}

        {evento.evidencia.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {evento.evidencia.slice(0, 3).map((m, idx) => (
              <button
                key={m.id ?? m.url}
                type="button"
                onClick={() => onAbrirEvidencia?.(evento.evidencia, idx)}
                className="hover:opacity-90 transition-opacity"
              >
                <img
                  src={m.url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
};

const ReportTimeline = ({
  report,
  atualizacoes = [],
  etapasOficiais = [],
  moderadores,
  integracaoComOrgao = false,
  formatDateTime,
  onAbrirEvidencia,
}) => {
  const { eventos } = linhaDoTempoPublica({
    report,
    atualizacoes,
    etapasOficiais,
    moderadores,
    integracaoComOrgao,
  });

  if (eventos.length === 0) return null;

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon name="trombone" size={14} className="text-brand" />
        <h2 className="text-xs font-bold text-content-primary">
          O que já aconteceu
        </h2>
      </div>

      <ul>
        {eventos.map((evento, i) => (
          <EventoDaLinha
            key={evento.id}
            evento={evento}
            ultimo={i === eventos.length - 1}
            formatDateTime={formatDateTime}
            onAbrirEvidencia={onAbrirEvidencia}
          />
        ))}
      </ul>

      {/* Diagnostico de envio, destinatario, entrega e configuracao do canal
          nao aparecem aqui. Esses dados operacionais ficam no painel
          administrativo "Canais do orgao". */}
    </div>
  );
};

export default ReportTimeline;
