import { ArrowRight } from "lucide-react";
import { antesEDepois } from "@/lib/reportTimeline";

// Antes e Depois (fase 1 do roadmap revisado, §36.6).
//
// POR QUE ESTE BLOCO EXISTE
//
// É o retorno mais barato e mais convincente que este app pode dar. A foto do
// registro já está guardada; a foto da confirmação também. Faltava só
// colocá-las lado a lado — e o efeito de ver a rua antes e depois é de outra
// ordem que qualquer contador de pontos.
//
// AS DUAS PONTAS, OU NENHUMA
//
// `antesEDepois` devolve null quando falta uma das fotos, e é o que impede o
// caso ruim: uma foto antiga sozinha ao lado de um espaço vazio faz parecer que
// o depois existe e não carregou. Meia comparação é pior que comparação
// nenhuma.
//
// OBRA EM ANDAMENTO NÃO É O DEPOIS
//
// Só `solved` vira depois. Uma foto de `being_solved` mostraria máquina na rua
// como se fosse desfecho — e faria o par mentir na direção mais perigosa, que é
// a de dizer "acabou" antes de acabar.

const Lado = ({ lado, rotulo, quem = null, onAbrir, formatDateTime }) => (
  <div className="flex-1 min-w-0">
    <button
      type="button"
      onClick={onAbrir}
      className="block w-full hover:opacity-90 transition-opacity"
    >
      <img
        src={lado.url}
        alt={rotulo}
        className="w-full aspect-square rounded-xl object-cover"
        loading="lazy"
      />
    </button>
    <p className="text-2xs font-bold text-content-primary mt-1.5">{rotulo}</p>
    <p className="text-2xs text-content-tertiary leading-tight">
      {lado.em ? formatDateTime(lado.em).split(",")[0] : "sem data"}
      {quem ? ` · ${quem}` : ""}
    </p>
  </div>
);

const ReportBeforeAfter = ({ report, atualizacoes = [], formatDateTime, onAbrir }) => {
  const par = antesEDepois({ report, atualizacoes });
  if (!par) return null;

  const midias = [
    { url: par.antes.url, type: "image" },
    { url: par.depois.url, type: "image" },
  ];

  return (
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      <h2 className="text-xs font-bold text-content-primary mb-3">Antes e depois</h2>

      <div className="flex items-stretch gap-2">
        <Lado
          lado={par.antes}
          rotulo="Antes"
          onAbrir={() => onAbrir?.(midias, 0)}
          formatDateTime={formatDateTime}
        />

        <div className="flex items-center flex-shrink-0">
          <ArrowRight className="w-4 h-4 text-content-tertiary" />
        </div>

        {/* Quem tirou a foto do depois entra porque é a proveniência da
            afirmação mais forte da tela. Sem nome, "depois" é só uma imagem que
            alguém escolheu. */}
        <Lado
          lado={par.depois}
          rotulo="Depois"
          quem={par.depois.autorNome}
          onAbrir={() => onAbrir?.(midias, 1)}
          formatDateTime={formatDateTime}
        />
      </div>
    </div>
  );
};

export default ReportBeforeAfter;
