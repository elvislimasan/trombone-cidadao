import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown, ExternalLink, LayoutGrid, Lock, Search, Settings2, Table2, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function ObraPaymentsSummary({
  phaseName,
  totalPaid,
  expectedValue = 0,
  totalPaidAllPhases = 0,
  totalExpectedAllPhases = 0,
  onConsult,
}) {
  const phasePct = expectedValue ? Math.min((Number(totalPaid) / Number(expectedValue)) * 100, 100) : 0;
  const totalPct = totalExpectedAllPhases ? Math.min((Number(totalPaidAllPhases) / Number(totalExpectedAllPhases)) * 100, 100) : 0;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-7 lg:px-4 lg:py-6 2xl:px-6 2xl:py-7">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <div className="min-w-0 text-[14px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
            Pagamentos{phaseName ? ` — ${phaseName}` : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 shrink-0">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-muted-foreground">Pago na Fase Atual</div>
              <div className="text-xl font-bold text-foreground mt-1">{formatCurrency(totalPaid)}</div>
              <div className="mt-3">
                <div className="text-xs text-blue-700 mb-2">{Math.round(phasePct)}% do previsto</div>
                <Progress value={phasePct} className="h-1.5 bg-muted" indicatorClassName="bg-blue-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shrink-0">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-muted-foreground">Total Pago (Todas as Fases)</div>
              <div className="text-xl font-bold text-foreground mt-1">{formatCurrency(totalPaidAllPhases)}</div>
              <div className="mt-3">
                <div className="text-xs text-emerald-700 mb-2">{Math.round(totalPct)}% do contrato</div>
                <Progress value={totalPct} className="h-1.5 bg-muted" indicatorClassName="bg-emerald-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-6 rounded-2xl border border-red-100/60 bg-gradient-to-br from-red-50/70 via-background to-amber-50/40 p-5 sm:p-6 overflow-hidden shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-red-200/30 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-amber-200/25 blur-2xl" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <button type="button" className="text-left" onClick={onConsult}>
              <div className="text-xl font-semibold text-foreground mb-2">Ver todos os pagamentos</div>
              <div className="text-md text-muted-foreground">Acesse a lista completa organizada por empenho, credor e tipo.</div>
            </button>
            <div className="text-[14px] text-muted-foreground mt-2">
              Para consultar valores das fases anteriores <br /> vá até{" "}
              <a href="#historico-licitacoes" className="text-red-600 underline underline-offset-2">
                Histórico de Licitações
              </a>
              .
            </div>
          </div>

          <Button
            type="button"
            onClick={onConsult}
            className="sm:ml-8 sm:px-12 sm:py-6 bg-red-500 hover:bg-red-600 text-white w-full sm:w-auto shadow-md hover:shadow-lg"
          >
            Consultar pagamentos
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      
    </div>
  );
}

export function ObraPayments({
  payments,
  phaseName,
  embedded = false,
  canAdd = false,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  onBack,
}) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-4 sm:p-6 lg:p-4 2xl:p-6" : "bg-card rounded-lg border p-4 sm:p-6 lg:p-4 2xl:p-6";
  const list = Array.isArray(payments) ? payments : [];

  const PAGE_SIZE = 5;
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [commitmentFilter, setCommitmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("payment_date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [desktopView, setDesktopView] = useState("table");
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [openGroupKeys, setOpenGroupKeys] = useState(() => new Set());
  const [openDescription, setOpenDescription] = useState({ isOpen: false, text: "" });
  const [manageQuery, setManageQuery] = useState("");
  const [manageYearFilter, setManageYearFilter] = useState("all");
  const [manageCommitmentFilter, setManageCommitmentFilter] = useState("all");
  const [manageTypeFilter, setManageTypeFilter] = useState("all");
  const [manageSortKey, setManageSortKey] = useState("payment_date");
  const [manageSortDir, setManageSortDir] = useState("desc");
  const [managePage, setManagePage] = useState(1);

  const parsePtBrDate = useCallback((value) => {
    const str = String(value || "").trim();
    if (!str) return null;
    const parts = str.split("/");
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, []);

  const getPaymentDate = useCallback(
    (p) => {
      const raw = p?.payment_date || p?.created_at;
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return parsePtBrDate(p?.date);
    },
    [parsePtBrDate]
  );

  const normalizeText = useCallback((value) => {
    return String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }, []);

  const normalizeTypeKey = useCallback(
    (value) => {
      const t = normalizeText(value);
      if (!t) return "sem_tipo";
      if (t.includes("extra") && t.includes("orc")) return "extra_orc";
      if (t.includes("estim")) return "estimativo";
      if (t.includes("global")) return "global";
      if (t.includes("ordin")) return "ordinario";
      return t.replace(/\s+/g, "_");
    },
    [normalizeText]
  );

  const formatTypeLabel = useCallback(
    (value) => {
      const key = normalizeTypeKey(value);
      if (key === "sem_tipo") return "Sem tipo";
      if (key === "extra_orc") return "Extra Orç.";
      if (key === "estimativo") return "Estimativo";
      if (key === "global") return "Global";
      if (key === "ordinario") return "Ordinário";
      const raw = String(value || "").trim();
      if (raw) return raw;
      return "Sem tipo";
    },
    [normalizeTypeKey]
  );

  const yearOptions = useMemo(() => {
    const years = new Set();
    list.forEach((p) => {
      const d = getPaymentDate(p);
      if (d) years.add(String(d.getUTCFullYear()));
    });
    return [...years].sort((a, b) => Number(b) - Number(a));
  }, [getPaymentDate, list]);

  const commitmentOptions = useMemo(() => {
    const keys = new Set();
    list.forEach((p) => {
      const key = String(p?.orderNumber || "").trim() || "SEM_EMPENHO";
      keys.add(key);
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [list]);

  const typeOptions = useMemo(() => {
    const keys = new Map();
    list.forEach((p) => {
      const raw = String(p?.commitmentType || "").trim();
      const key = normalizeTypeKey(raw);
      keys.set(key, formatTypeLabel(raw));
    });
    const arr = [...keys.entries()]
      .filter(([k]) => k && k !== "all")
      .map(([key, label]) => ({ key, label }));
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: "all", label: "Todos" }, ...arr];
  }, [formatTypeLabel, list, normalizeTypeKey]);

  const filtered = useMemo(() => {
    let items = list;

    if (yearFilter !== "all") {
      items = items.filter((p) => {
        const d = getPaymentDate(p);
        if (!d) return false;
        return String(d.getUTCFullYear()) === String(yearFilter);
      });
    }

    if (commitmentFilter !== "all") {
      items = items.filter((p) => (String(p?.orderNumber || "").trim() || "SEM_EMPENHO") === commitmentFilter);
    }

    if (typeFilter !== "all") {
      items = items.filter((p) => normalizeTypeKey(p?.commitmentType) === typeFilter);
    }

    const q = normalizeText(query);
    if (!q) return items;

    return items.filter((p) => {
      const hay = [p?.date, p?.orderNumber, p?.commitmentType, p?.description, p?.installment, p?.contractor, p?.value]
        .filter(Boolean)
        .map((x) => normalizeText(x))
        .join(" ");
      return hay.includes(q);
    });
  }, [commitmentFilter, getPaymentDate, list, normalizeText, normalizeTypeKey, query, typeFilter, yearFilter]);

  const sortedPayments = useMemo(() => {
    const arr = filtered.map((p, idx) => ({ p, idx }));
    arr.sort((a, b) => {
      const pa = a.p;
      const pb = b.p;
      const da = getPaymentDate(pa)?.getTime() ?? 0;
      const db = getPaymentDate(pb)?.getTime() ?? 0;
      if (da !== db) return db - da;
      const oa = String(pa?.orderNumber || "");
      const ob = String(pb?.orderNumber || "");
      const cmp = oa.localeCompare(ob);
      if (cmp !== 0) return cmp;
      return a.idx - b.idx;
    });
    return arr.map((x) => x.p);
  }, [filtered, getPaymentDate]);

  const totalFilteredValue = useMemo(() => {
    return (sortedPayments || []).reduce((acc, p) => acc + (Number(p?.value) || 0), 0);
  }, [sortedPayments]);

  const groups = useMemo(() => {
    const map = new Map();
    (sortedPayments || []).forEach((p) => {
      const key = String(p?.orderNumber || "").trim() || "SEM_EMPENHO";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });

    const list = [];
    map.forEach((items, key) => {
      const itemsSorted = [...items].sort((a, b) => (getPaymentDate(b)?.getTime() ?? 0) - (getPaymentDate(a)?.getTime() ?? 0));
      const latestDate = getPaymentDate(itemsSorted[0]) || null;
      const latestDateLabel = latestDate ? latestDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

      const total = itemsSorted.reduce((acc, x) => acc + (Number(x?.value) || 0), 0);
      const contractorSet = new Set(itemsSorted.map((x) => String(x?.contractor || "").trim()).filter(Boolean));
      const contractorLabel = contractorSet.size === 1 ? [...contractorSet][0] : contractorSet.size > 1 ? "Vários" : "—";

      const typeSet = new Set(itemsSorted.map((x) => normalizeTypeKey(x?.commitmentType)));
      const typeLabel = typeSet.size === 1 ? formatTypeLabel(itemsSorted[0]?.commitmentType) : "Vários";

      const descriptionPreview = String(itemsSorted[0]?.description || "").trim() || "—";
      const installmentPreview = itemsSorted.length === 1 ? String(itemsSorted[0]?.installment || "").trim() || "—" : "—";
      const hasPortal = itemsSorted.some((x) => Boolean(x?.url));

      list.push({
        key,
        orderNumber: key === "SEM_EMPENHO" ? "" : key,
        items: itemsSorted,
        count: itemsSorted.length,
        total,
        contractorLabel,
        typeLabel,
        latestDate,
        latestDateLabel,
        hasPortal,
        descriptionPreview,
        installmentPreview,
      });
    });

    return list;
  }, [formatTypeLabel, getPaymentDate, normalizeTypeKey, sortedPayments]);

  const sortedGroups = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getStr = (v) => normalizeText(v);
    const getNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const arr = groups.map((g, idx) => ({ g, idx }));
    arr.sort((a, b) => {
      const ga = a.g;
      const gb = b.g;
      let cmp = 0;

      if (sortKey === "payment_date") {
        cmp = (ga.latestDate?.getTime() ?? 0) - (gb.latestDate?.getTime() ?? 0);
      } else if (sortKey === "orderNumber") {
        cmp = getStr(ga.orderNumber).localeCompare(getStr(gb.orderNumber));
      } else if (sortKey === "type") {
        cmp = getStr(ga.typeLabel).localeCompare(getStr(gb.typeLabel));
      } else if (sortKey === "contractor") {
        cmp = getStr(ga.contractorLabel).localeCompare(getStr(gb.contractorLabel));
      } else if (sortKey === "value") {
        cmp = getNum(ga.total) - getNum(gb.total);
      } else if (sortKey === "portal") {
        cmp = Number(Boolean(ga.hasPortal)) - Number(Boolean(gb.hasPortal));
      }

      if (cmp === 0) cmp = a.idx - b.idx;
      return cmp * dir;
    });

    return arr.map((x) => x.g);
  }, [groups, normalizeText, sortDir, sortKey]);

  const manageFilteredPayments = useMemo(() => {
    let items = list;

    if (manageYearFilter !== "all") {
      items = items.filter((p) => {
        const d = getPaymentDate(p);
        if (!d) return false;
        return String(d.getUTCFullYear()) === String(manageYearFilter);
      });
    }

    if (manageCommitmentFilter !== "all") {
      items = items.filter((p) => (String(p?.orderNumber || "").trim() || "SEM_EMPENHO") === manageCommitmentFilter);
    }

    if (manageTypeFilter !== "all") {
      items = items.filter((p) => normalizeTypeKey(p?.commitmentType) === manageTypeFilter);
    }

    const q = normalizeText(manageQuery);
    if (!q) return items;

    return items.filter((p) => {
      const hay = [p?.date, p?.orderNumber, p?.commitmentType, p?.description, p?.installment, p?.contractor, p?.value]
        .filter(Boolean)
        .map((x) => normalizeText(x))
        .join(" ");
      return hay.includes(q);
    });
  }, [getPaymentDate, list, manageCommitmentFilter, manageQuery, manageTypeFilter, manageYearFilter, normalizeText, normalizeTypeKey]);

  const manageSortedPayments = useMemo(() => {
    const dir = manageSortDir === "asc" ? 1 : -1;
    const getStr = (v) => normalizeText(v);
    const getNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const arr = manageFilteredPayments.map((p, idx) => ({ p, idx }));
    arr.sort((a, b) => {
      const pa = a.p;
      const pb = b.p;
      let cmp = 0;

      if (manageSortKey === "payment_date") {
        cmp = (getPaymentDate(pa)?.getTime() ?? 0) - (getPaymentDate(pb)?.getTime() ?? 0);
      } else if (manageSortKey === "orderNumber") {
        cmp = getStr(pa.orderNumber).localeCompare(getStr(pb.orderNumber));
      } else if (manageSortKey === "type") {
        cmp = getStr(formatTypeLabel(pa.commitmentType)).localeCompare(getStr(formatTypeLabel(pb.commitmentType)));
      } else if (manageSortKey === "contractor") {
        cmp = getStr(pa.contractor).localeCompare(getStr(pb.contractor));
      } else if (manageSortKey === "value") {
        cmp = getNum(pa.value) - getNum(pb.value);
      } else if (manageSortKey === "portal") {
        cmp = Number(Boolean(pa.url)) - Number(Boolean(pb.url));
      } else if (manageSortKey === "description") {
        cmp = getStr(pa.description).localeCompare(getStr(pb.description));
      }

      if (cmp === 0) cmp = a.idx - b.idx;
      return cmp * dir;
    });

    return arr.map((x) => x.p);
  }, [formatTypeLabel, getPaymentDate, manageFilteredPayments, manageSortDir, manageSortKey, normalizeText]);

  const manageTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(manageSortedPayments.length / PAGE_SIZE));
  }, [manageSortedPayments.length]);

  const managePageSafe = useMemo(() => {
    const p = Number(managePage) || 1;
    return Math.max(1, Math.min(manageTotalPages, p));
  }, [managePage, manageTotalPages]);

  useEffect(() => {
    if (!isManageOpen) return;
    setManagePage(1);
  }, [isManageOpen, manageCommitmentFilter, manageQuery, manageSortDir, manageSortKey, manageTypeFilter, manageYearFilter]);

  const managePageItems = useMemo(() => {
    const start = (managePageSafe - 1) * PAGE_SIZE;
    return manageSortedPayments.slice(start, start + PAGE_SIZE);
  }, [managePageSafe, manageSortedPayments]);

  const managePageNumbers = useMemo(() => {
    const total = manageTotalPages;
    const current = managePageSafe;
    const to = Math.min(total, Math.max(1, current - 2) + 4);
    const from = Math.max(1, to - 4);
    const pages = [];
    for (let i = from; i <= to; i += 1) pages.push(i);
    return pages;
  }, [managePageSafe, manageTotalPages]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE));
  }, [sortedGroups.length]);

  const pageSafe = useMemo(() => {
    const p = Number(page) || 1;
    return Math.max(1, Math.min(totalPages, p));
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
    setOpenGroupKeys(new Set());
  }, [commitmentFilter, query, sortDir, sortKey, typeFilter, yearFilter]);

  const pageGroups = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return sortedGroups.slice(start, start + PAGE_SIZE);
  }, [pageSafe, sortedGroups]);

  const pageNumbers = useMemo(() => {
    const total = totalPages;
    const current = pageSafe;
    const to = Math.min(total, Math.max(1, current - 2) + 4);
    const from = Math.max(1, to - 4);
    const pages = [];
    for (let i = from; i <= to; i += 1) pages.push(i);
    return pages;
  }, [pageSafe, totalPages]);

  const toggleGroupOpen = useCallback((key) => {
    setOpenGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleGroupOpenSingle = useCallback((key) => {
    setOpenGroupKeys((prev) => {
      if (prev.has(key)) return new Set();
      return new Set([key]);
    });
  }, []);

  const PaymentGroupCard = useCallback(
    ({ g }) => {
      const isExpandable = g.count > 1;
      const isOpen = isExpandable && openGroupKeys.has(g.key);
      const portalUrl = g.count === 1 ? g.items[0]?.url : "";
      const descriptionText = g.count === 1 ? String(g.items?.[0]?.description || "").trim() : "";
      const countLabel = `${g.count} pagamento${g.count === 1 ? "" : "s"}`;

      return (
        <div
          key={g.key}
          className={`relative rounded-2xl border overflow-hidden shadow-sm transition-all ring-1 ring-black/5 ${
            isOpen ? "border-red-200 ring-red-500/10 shadow-md" : "border-border/70"
          } ${isExpandable ? "hover:shadow-md hover:border-red-200" : "hover:shadow-md"}`}
        >
          <div
            className={`h-1 w-full bg-gradient-to-r ${
              isOpen ? "from-red-500/80 via-red-500/30 to-transparent" : "from-red-500/40 via-red-500/15 to-transparent"
            }`}
          />
          <div className="w-full text-left p-4 bg-gradient-to-b from-red-50/40 via-background to-muted/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nº Empenho</div>
                <div className="mt-1 text-red-600 font-semibold break-words text-lg leading-tight">{g.orderNumber || "—"}</div>
              </div>

              {isExpandable ? (
                <div
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-semibold whitespace-nowrap ${
                    isOpen ? "bg-red-50 text-red-700 border-red-200" : "bg-muted/20 text-foreground border-border/70"
                  }`}
                >
                  <span>{countLabel}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground whitespace-nowrap mt-1">{countLabel}</div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</div>
                <div className="mt-1 text-foreground">{g.latestDateLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</div>
                <div className="mt-1 inline-flex items-center h-6 px-2.5 rounded-full bg-muted/20 border border-border/70 text-xs text-foreground">
                  {g.typeLabel}
                </div>
              </div>
            </div>

            {String(g.descriptionPreview || "").trim().length > 0 ? (
              <div className="mt-3 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {g.descriptionPreview}
                {g.count > 1 ? <span className="text-muted-foreground"> (+{g.count - 1})</span> : null}
              </div>
            ) : null}

            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="text-xs text-muted-foreground">{isExpandable ? "Total do empenho" : "Valor"}</div>
              <div className="text-base font-bold text-foreground whitespace-nowrap">{formatCurrency(g.total)}</div>
            </div>

            {portalUrl || descriptionText ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {portalUrl ? (
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center h-8 px-3 rounded-lg border border-border/70 bg-background text-xs font-semibold text-red-600 hover:bg-muted/20 shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ver no portal
                  </a>
                ) : null}
                {descriptionText ? (
                  <button
                    type="button"
                    className="inline-flex items-center h-8 px-3 rounded-lg border border-border/70 bg-background text-xs font-semibold text-red-600 hover:bg-muted/20 shadow-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenDescription({ isOpen: true, text: descriptionText });
                    }}
                  >
                    Ver descrição
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {isExpandable ? (
            <button
              type="button"
              className="w-full border-t border-border/60 bg-gradient-to-r from-red-50/80 via-background to-background px-4 py-4 text-sm font-semibold text-foreground flex items-center justify-between hover:from-red-50 hover:via-muted/10 hover:to-muted/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 cursor-pointer"
              onClick={() => toggleGroupOpenSingle(g.key)}
              aria-expanded={isOpen}
            >
              <span>{isOpen ? "Ocultar pagamentos desse empenho" : "Ver pagamentos desse empenho"}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
          ) : null}

          {isOpen ? (
            <div className="border-t border-border/60 bg-muted/5 p-4 space-y-3">
              {g.items.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/70 bg-background p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground line-clamp-2">{p.description || "—"}</div>
                    </div>
                    <div className="text-sm font-semibold text-foreground whitespace-nowrap">{formatCurrency(p.value)}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{p.date || "—"}</span>
                    <span>•</span>
                    <span>{formatTypeLabel(p.commitmentType)}</span>
                    {p.installment ? (
                      <>
                        <span>•</span>
                        <span>Parcela {p.installment}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {String(p.description || "").trim().length > 120 ? (
                      <button
                        type="button"
                        className="inline-flex items-center h-8 px-3 rounded-lg border border-border/70 bg-background text-xs font-semibold text-red-600 hover:bg-muted/20 shadow-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenDescription({ isOpen: true, text: String(p.description || "") });
                        }}
                      >
                        Ler descrição
                      </button>
                    ) : null}
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center h-8 px-3 rounded-lg border border-border/70 bg-background text-xs font-semibold text-red-600 hover:bg-muted/20 shadow-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Portal
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    },
    [formatTypeLabel, openGroupKeys, toggleGroupOpenSingle]
  );

  return (
    <Container className={containerClassName}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <Button type="button" variant="outline" size="sm" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Voltar
            </Button>
          ) : null}
        
        </div>
        {canAdd ? (
          <Button type="button" size="sm" onClick={() => setIsManageOpen(true)} className="bg-red-500 hover:bg-red-700 text-white">
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar
          </Button>
        ) : null}
      </div>

        <div className="flex items-center gap-2 min-w-0 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <div className="min-w-0 text-[14px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Pagamentos{phaseName ? ` — ${phaseName}` : ""}
            </div>
          </div>

    
      <div className={list.length > 0 ? "" : ""}>
        {list.length > 0 ? (
          <div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center mb-3">
              <div className="order-4 md:order-1 md:col-span-6">
                <div className="relative">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por descrição, empenho ou credor..."
                    className="bg-muted/20 rounded-xl pl-9"
                  />
                </div>
              </div>
              <div className="order-1 md:order-2 md:col-span-2">
                <select
                  className="h-10 w-full rounded-xl border border-input bg-muted/20 px-3 py-2 text-sm"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="all">Todos os anos</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="order-2 md:order-3 md:col-span-4">
                <select
                  className="h-10 w-full rounded-xl border border-input bg-muted/20 px-3 py-2 text-sm"
                  value={commitmentFilter}
                  onChange={(e) => setCommitmentFilter(e.target.value)}
                >
                  <option value="all">Todos os empenhos</option>
                  {commitmentOptions.map((k) => (
                    <option key={k} value={k}>
                      {k === "SEM_EMPENHO" ? "Sem empenho" : k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground whitespace-nowrap">Ordenar por:</div>
                <select
                  className="h-9 rounded-xl border border-input bg-muted/20 px-3 py-2 text-sm"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                >
                  <option value="payment_date">Data</option>
                  <option value="orderNumber">Nº Empenho</option>
                  <option value="type">Tipo</option>
                  <option value="contractor">Credor</option>
                  <option value="value">Valor</option>
                  <option value="portal">Portal</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  aria-label="Alternar direção de ordenação"
                >
                  {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div className="hidden md:flex items-center gap-1 rounded-xl border border-border bg-muted/20 p-1">
                  <button
                    type="button"
                    onClick={() => setDesktopView("table")}
                    className={`h-7 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                      desktopView === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                    aria-pressed={desktopView === "table"}
                  >
                    <Table2 className="h-4 w-4" />
                    Tabela
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesktopView("cards")}
                    className={`h-7 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                      desktopView === "cards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                    aria-pressed={desktopView === "cards"}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Cards
                  </button>
                </div>
                {(query || yearFilter !== "all" || commitmentFilter !== "all" || typeFilter !== "all" || sortKey !== "payment_date" || sortDir !== "desc") ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => {
                      setQuery("");
                      setYearFilter("all");
                      setCommitmentFilter("all");
                      setTypeFilter("all");
                      setSortKey("payment_date");
                      setSortDir("desc");
                    }}
                  >
                    Limpar
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="text-xs text-muted-foreground">Tipo:</div>
              {typeOptions.map((t) => {
                const active = typeFilter === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTypeFilter(t.key)}
                    className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-red-500 border-red-600 text-white"
                        : "bg-muted/20 border-border text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {desktopView === "table" ? (
              <div className="hidden md:block rounded-2xl border border-border overflow-hidden bg-background">
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <Table>
                      <TableHeader className="bg-muted/20">
                        <TableRow className="border-b border-border/60 hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Nº Empenho
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Data
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Parcela</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Credor</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right">
                            Valor
                          </TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Portal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageGroups.map((g, idx) => {
                          const isExpandable = g.count > 1;
                          const isOpen = isExpandable && openGroupKeys.has(g.key);
                          const portalUrl = g.count === 1 ? g.items[0]?.url : "";
                          const zebraClassName = idx % 2 === 0 ? "bg-slate-50" : "bg-slate-100/50";
                          return (
                            <Fragment key={g.key}>
                              <TableRow
                                className={`${zebraClassName} ${isExpandable ? "cursor-pointer" : ""} hover:bg-slate-200/70`}
                                onClick={isExpandable ? () => toggleGroupOpen(g.key) : undefined}
                              >
                                <TableCell className="whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {isExpandable ? (
                                      <span
                                        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted/10 text-muted-foreground transition-transform ${
                                          isOpen ? "rotate-180" : ""
                                        }`}
                                      >
                                        <ChevronDown className="h-4 w-4" />
                                      </span>
                                    ) : (
                                      <span className="inline-flex h-7 w-7" />
                                    )}
                                    <span className="text-red-600 font-semibold">{g.orderNumber || "—"}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-foreground">{g.latestDateLabel}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-muted/20 border border-border text-xs text-foreground">
                                    {g.typeLabel}
                                  </span>
                                </TableCell>
                                <TableCell className="whitespace-normal break-words text-foreground text-[11px]">
                                  {g.descriptionPreview}
                                  {g.count > 1 ? <span className="text-muted-foreground"> (+{g.count - 1})</span> : null}
                                </TableCell>
                                <TableCell className="text-center whitespace-nowrap text-muted-foreground">{g.installmentPreview}</TableCell>
                                <TableCell className="whitespace-normal break-words text-foreground">{g.contractorLabel}</TableCell>
                                <TableCell className="text-right font-semibold text-foreground whitespace-nowrap">{formatCurrency(g.total)}</TableCell>
                                <TableCell className="text-center">
                                  {portalUrl ? (
                                    <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-red-600 font-medium hover:underline">
                                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                      Ver
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>

                              {isOpen ? (
                                <TableRow className="bg-muted/5">
                                  <TableCell colSpan={8} className="p-0">
                                    <div className="border-t border-border/60 px-3 py-3">
                                      <div className="text-xs text-muted-foreground mb-2">
                                        {g.count} pagamento{g.count === 1 ? "" : "s"} neste empenho
                                      </div>
                                      <div className="rounded-xl border border-border overflow-hidden bg-background">
                                        <Table>
                                          <TableHeader className="bg-muted/20">
                                            <TableRow className="hover:bg-transparent">
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</TableHead>
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</TableHead>
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição</TableHead>
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Parcela</TableHead>
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Credor</TableHead>
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor</TableHead>
                                              <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Portal</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {g.items.map((p) => (
                                              <TableRow key={p.id} className="odd:bg-slate-50 even:bg-slate-100/50 hover:bg-slate-200/70">
                                                <TableCell className="whitespace-nowrap text-foreground">{p.date || "—"}</TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                  <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-muted/20 border border-border text-xs text-foreground">
                                                    {formatTypeLabel(p.commitmentType)}
                                                  </span>
                                                </TableCell>
                                                <TableCell className="whitespace-normal break-words text-foreground text-[11px]">{p.description || "—"}</TableCell>
                                                <TableCell className="text-center whitespace-nowrap text-muted-foreground">{p.installment || "—"}</TableCell>
                                                <TableCell className="whitespace-normal break-words text-foreground">{p.contractor || "—"}</TableCell>
                                                <TableCell className="text-right font-semibold text-foreground whitespace-nowrap">{formatCurrency(p.value)}</TableCell>
                                                <TableCell className="text-center">
                                                  {p.url ? (
                                                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-red-600 font-medium hover:underline">
                                                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                                      Ver
                                                    </a>
                                                  ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                {pageGroups.map((g) => (
                  <PaymentGroupCard key={g.key} g={g} />
                ))}
              </div>
            )}

            <div className="md:hidden space-y-3">
              {pageGroups.map((g) => (
                <PaymentGroupCard key={g.key} g={g} />
              ))}
            </div>

            {groups.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhum pagamento encontrado.</div> : null}

            {groups.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-border bg-muted/10 px-4 py-3 text-sm flex items-center justify-between gap-3">
                <div className="text-muted-foreground">Somatório (filtros atuais)</div>
                <div className="font-semibold text-foreground">{formatCurrency(totalFilteredValue)}</div>
              </div>
            ) : null}

            {groups.length > 0 ? (
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
               
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, (Number(p) || 1) - 1))}>
                    ‹
                  </Button>
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={n === pageSafe ? "default" : "outline"}
                        size="sm"
                        className={n === pageSafe ? "bg-red-500 hover:bg-red-500 text-white" : ""}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, (Number(p) || 1) + 1))}>
                    ›
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-sm">Nenhum pagamento registrado {phaseName ? `para ${phaseName}` : ""}</div>
          </div>
        )}
      </div>

      <Dialog
        open={openDescription.isOpen}
        onOpenChange={(open) => setOpenDescription({ isOpen: open, text: open ? openDescription.text : "" })}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Descrição</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground whitespace-pre-line">{openDescription.text || "—"}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl lg:max-w-6xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Gerenciar pagamentos</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-muted-foreground">Selecione um pagamento para editar ou excluir.</div>
            <Button
              type="button"
              onClick={() => {
                setIsManageOpen(false);
                onAddPayment?.();
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Adicionar
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <div className="sm:col-span-6">
              <div className="relative">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={manageQuery}
                  onChange={(e) => setManageQuery(e.target.value)}
                  placeholder="Buscar por descrição, empenho ou credor..."
                  className="bg-muted/20 rounded-xl pl-9"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <select
                className="h-10 w-full rounded-xl border border-input bg-muted/20 px-3 py-2 text-sm"
                value={manageYearFilter}
                onChange={(e) => setManageYearFilter(e.target.value)}
              >
                <option value="all">Todos os anos</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-4">
              <select
                className="h-10 w-full rounded-xl border border-input bg-muted/20 px-3 py-2 text-sm"
                value={manageCommitmentFilter}
                onChange={(e) => setManageCommitmentFilter(e.target.value)}
              >
                <option value="all">Todos os empenhos</option>
                {commitmentOptions.map((k) => (
                  <option key={k} value={k}>
                    {k === "SEM_EMPENHO" ? "Sem empenho" : k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground whitespace-nowrap">Ordenar por:</div>
              <select
                className="h-9 rounded-xl border border-input bg-muted/20 px-3 py-2 text-sm"
                value={manageSortKey}
                onChange={(e) => setManageSortKey(e.target.value)}
              >
                <option value="payment_date">Data</option>
                <option value="orderNumber">Nº Empenho</option>
                <option value="type">Tipo</option>
                <option value="contractor">Credor</option>
                <option value="value">Valor</option>
                <option value="portal">Portal</option>
                <option value="description">Descrição</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setManageSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                aria-label="Alternar direção de ordenação"
              >
                {manageSortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3">
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {manageSortedPayments.length} registro{manageSortedPayments.length === 1 ? "" : "s"}
              </div>
              {(manageQuery ||
                manageYearFilter !== "all" ||
                manageCommitmentFilter !== "all" ||
                manageTypeFilter !== "all" ||
                manageSortKey !== "payment_date" ||
                manageSortDir !== "desc") ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => {
                    setManageQuery("");
                    setManageYearFilter("all");
                    setManageCommitmentFilter("all");
                    setManageTypeFilter("all");
                    setManageSortKey("payment_date");
                    setManageSortDir("desc");
                  }}
                >
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="text-xs text-muted-foreground">Tipo:</div>
            {typeOptions.map((t) => {
              const active = manageTypeFilter === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setManageTypeFilter(t.key)}
                  className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                    active ? "bg-red-500 border-red-600 text-white" : "bg-muted/20 border-border text-foreground hover:bg-muted/30"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
              <div className="hidden md:block min-w-[1100px] h-full">
                <div className="h-full flex flex-col">
                  <div className="flex-shrink-0">
                    <Table>
                      <TableHeader className="bg-muted/20 sticky top-0 z-10">
                        <TableRow className="border-b border-border/60 hover:bg-transparent">
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nº Empenho</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Descrição</TableHead>
                          <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor</TableHead>
                          <TableHead className="sticky right-0 bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-right min-w-[220px] border-l border-border/60">
                            Ação
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                    </Table>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <Table>
                      <TableBody>
                        {managePageItems.map((p) => (
                          <TableRow key={p.id} className="odd:bg-slate-50 even:bg-slate-100/50 hover:bg-slate-200/70">
                            <TableCell className="whitespace-nowrap text-red-600 font-semibold">{p.orderNumber || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{p.date || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{formatTypeLabel(p.commitmentType)}</TableCell>
                            <TableCell className="whitespace-normal break-words text-[11px]">{p.description || "—"}</TableCell>
                            <TableCell className="text-right font-semibold whitespace-nowrap">{formatCurrency(p.value)}</TableCell>
                            <TableCell className="sticky right-0 bg-inherit text-right whitespace-nowrap min-w-[220px] border-l border-border/60">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="min-w-[104px]"
                                  onClick={() => {
                                    setIsManageOpen(false);
                                    onEditPayment?.(p);
                                  }}
                                >
                                  Editar
                                </Button>
                                {canAdd && onDeletePayment ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    className="min-w-[104px]"
                                    onClick={() => onDeletePayment(p)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1.5" />
                                    Excluir
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="md:hidden p-3 space-y-3 overflow-y-auto flex-1">
                {managePageItems.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nº Empenho</div>
                        <div className="mt-1 text-red-600 font-semibold">{p.orderNumber || "—"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsManageOpen(false);
                            onEditPayment?.(p);
                          }}
                        >
                          Editar
                        </Button>
                        {canAdd && onDeletePayment ? (
                          <Button type="button" size="sm" variant="destructive" onClick={() => onDeletePayment(p)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</div>
                        <div className="mt-1 text-foreground">{p.date || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tipo</div>
                        <div className="mt-1 inline-flex items-center h-6 px-2.5 rounded-full bg-muted/20 border border-border text-xs text-foreground">
                          {formatTypeLabel(p.commitmentType)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">Valor</div>
                      <div className="text-sm font-semibold text-foreground">{formatCurrency(p.value)}</div>
                    </div>

                    {String(p.description || "").trim().length > 0 ? (
                      <button
                        type="button"
                        className="mt-3 text-xs font-medium text-red-600 hover:underline"
                        onClick={() => setOpenDescription({ isOpen: true, text: String(p.description || "") })}
                      >
                        Ver descrição
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {manageSortedPayments.length > 0 ? (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Exibindo {(managePageSafe - 1) * PAGE_SIZE + 1}–{Math.min(manageSortedPayments.length, managePageSafe * PAGE_SIZE)} de {manageSortedPayments.length} registros
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={managePageSafe <= 1} onClick={() => setManagePage((p) => Math.max(1, (Number(p) || 1) - 1))}>
                  ‹
                </Button>
                <div className="flex items-center gap-1">
                  {managePageNumbers.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={n === managePageSafe ? "default" : "outline"}
                      size="sm"
                      className={n === managePageSafe ? "bg-red-500 hover:bg-red-500 text-white" : ""}
                      onClick={() => setManagePage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" disabled={managePageSafe >= manageTotalPages} onClick={() => setManagePage((p) => Math.min(manageTotalPages, (Number(p) || 1) + 1))}>
                  ›
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-center text-sm text-muted-foreground">Nenhum pagamento encontrado.</div>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
