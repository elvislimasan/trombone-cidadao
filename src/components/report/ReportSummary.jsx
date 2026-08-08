import { Calendar } from "lucide-react";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Titulo, status, data de cadastro, protocolo e o "story" de idade da bronca.
const ReportSummary = ({
  title,
  status,
  createdAt,
  protocol,
  reportAgeStory,
  getStatusInfo,
  formatDateTime,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-[#191c1e] leading-tight">
          {title}
        </h1>
        <span
          className={`hidden lg:inline-flex items-center px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
            getStatusInfo(status).colorClasses
          }`}
        >
          {getStatusInfo(status).text}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[#6b7280]">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>{formatDateTime(createdAt).replace(",", " às")}</span>
        </div>
        {protocol && (
          <span className="bg-[#e0e3e6] px-3 py-1 rounded-full font-mono text-[10px] font-semibold text-[#191c1e] tabular-nums">
            #{protocol}
          </span>
        )}
      </div>

      {reportAgeStory && (
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg bg-muted/70 text-foreground border border-border/60">
            {reportAgeStory}
          </span>
        </div>
      )}
    </div>
  );
};

export default ReportSummary;
