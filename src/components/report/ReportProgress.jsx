// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Linha do tempo de andamento da bronca (report_timeline).
const ReportProgress = ({ timeline, formatDateTime }) => {
  if (!timeline || timeline.length === 0) return null;
  return (
    <div className="bg-[#f2f4f7] rounded-2xl px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#9f3f3b] mb-3">
        <span className="inline-block w-1 h-3.5 rounded bg-[#b61722]" />
        Atualizações
      </div>
      <div className="relative pl-4">
        <div className="absolute left-1 top-1 bottom-1 w-px bg-[#b61722]/20" />
        <div className="space-y-4">
          {timeline.map((item) => (
            <div key={item.id} className="relative flex gap-3">
              <div className="mt-1 w-3 h-3 rounded-full bg-[#b61722] border-2 border-white shadow-sm ring-2 ring-[#b61722]/30" />
              <div>
                <div className="text-[11px] text-[#6b7280]">
                  {formatDateTime(item.date)}
                </div>
                <div className="text-sm font-medium text-[#191c1e] leading-snug">
                  {item.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReportProgress;
