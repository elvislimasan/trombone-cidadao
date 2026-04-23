import { useMemo } from "react";

function toUtcDayNumber(date) {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86400000
  );
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDatePtBrUtc(date) {
  if (!date) return "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDateShortPtBrUtc(date) {
  if (!date) return "-";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);

  const day = parts.find((p) => p.type === "day")?.value || "";
  const monthRaw = parts.find((p) => p.type === "month")?.value || "";
  const year = parts.find((p) => p.type === "year")?.value || "";

  const month = String(monthRaw).replace(".", "");
  const monthCap = month ? month[0].toUpperCase() + month.slice(1) : "";

  return [day, monthCap, year].filter(Boolean).join(" ");
}

export function ObraDelayMeter({
  expectedEndDate,
  endDate,
  status,
  executionDays,
}) {
  if (status === "completed") return null;

  const computed = useMemo(() => {
    const expected = parseDate(expectedEndDate);
    if (!expected) return null;

    const parsedEndDate = parseDate(endDate);
    const isCompleted = status === "completed" && Boolean(parsedEndDate);
    const actual = isCompleted ? parsedEndDate : new Date();

    const expectedDay = toUtcDayNumber(expected);
    const actualDay = toUtcDayNumber(actual);
    const diffDays = actualDay - expectedDay;

    const daysRemaining = Math.max(0, -diffDays);
    const overdueDays = Math.max(0, diffDays);

    const horizonDaysRaw = Number(executionDays) || 120;
    const horizonDays = Math.min(180, Math.max(30, horizonDaysRaw));

    const ringValue =
      overdueDays > 0
        ? Math.max(0, Math.min(100, (overdueDays / horizonDays) * 100))
        : Math.max(
            0,
            Math.min(100, ((horizonDays - daysRemaining) / horizonDays) * 100)
          );

    const isOverdue = overdueDays > 0;
    const isDueToday = overdueDays === 0 && daysRemaining === 0;
    const isDueSoon = !isOverdue && !isDueToday && daysRemaining <= 7;

    const tone = isOverdue
      ? "critical"
      : isCompleted
      ? "completed"
      : isDueToday
      ? "today"
      : isDueSoon
      ? "soon"
      : "ok";

    const badge =
      tone === "critical"
        ? "ESTADO CRÍTICO"
        : tone === "today"
        ? "PRAZO HOJE"
        : tone === "soon"
        ? "ALERTA"
        : tone === "completed"
        ? "CONCLUÍDA"
        : "NO PRAZO";

    const metricNumber = isOverdue ? overdueDays : daysRemaining;
    const metricLabel = isOverdue ? "DIAS DE ATRASO" : "DIAS PARA O PRAZO";

    const colors =
      tone === "critical"
        ? {
            badgeClassName: "bg-rose-100 text-rose-700",
            ringClassName: "stroke-rose-600",
            numberClassName: "text-rose-600",
          }
        : tone === "today" || tone === "soon"
        ? {
            badgeClassName: "bg-amber-100 text-amber-700",
            ringClassName: "stroke-amber-500",
            numberClassName: "text-amber-600",
          }
        : tone === "completed"
        ? {
            badgeClassName: "bg-slate-100 text-slate-700",
            ringClassName: "stroke-slate-500",
            numberClassName: "text-slate-700",
          }
        : {
            badgeClassName: "bg-emerald-100 text-emerald-700",
            ringClassName: "stroke-emerald-600",
            numberClassName: "text-emerald-600",
          };

    return {
      badge,
      colors,
      isCompleted,
      metricLabel,
      metricNumber,
      ringValue,
      expectedDateText: formatDateShortPtBrUtc(expected),
      expectedDateLongText: formatDatePtBrUtc(expected),
      completedDateText: isCompleted ? formatDatePtBrUtc(parsedEndDate) : "",
    };
  }, [endDate, expectedEndDate, executionDays, status]);

  if (!computed) return null;

  const size = 190;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    circumference - (Math.max(0, Math.min(100, computed.ringValue)) / 100) * circumference;

  return (
    <section className="mt-2 mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-900">Atrasômetro</h3>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${computed.colors.badgeClassName}`}
          >
            {computed.badge}
          </span>
        </div>
      </header>

      <div className="px-5 py-6 flex items-center justify-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="block"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              strokeWidth={strokeWidth}
              className="stroke-slate-200"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={computed.colors.ringClassName}
              style={{ transform: `rotate(-90deg)`, transformOrigin: "50% 50%" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className={`text-5xl font-extrabold ${computed.colors.numberClassName}`}>
              {computed.metricNumber}
            </div>
            <div className="mt-1 text-[11px] font-semibold tracking-wider text-slate-500">
              {computed.metricLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200" />

      <div className="px-5 py-4">
        <div className="text-[10px] font-semibold tracking-wider text-slate-500">
          PREVISÃO DE CONCLUSÃO
        </div>
        <div className="mt-1 text-base font-extrabold text-slate-900">
          {computed.expectedDateText}
        </div>
      </div>
    </section>
  );
}
