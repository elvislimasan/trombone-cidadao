import { ExternalLink, Minus, Plus, Receipt, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function ObraPayments({
  payments,
  totalPaid,
  phaseName,
  expectedValue = 0,
  totalPaidAllPhases = 0,
  totalExpectedAllPhases = 0,
  embedded = false,
  canAdd = false,
  onAddPayment,
}) {
  const Container = embedded ? "div" : "section";
  const containerClassName = embedded ? "p-4 sm:p-6 lg:p-4 2xl:p-6" : "bg-card rounded-lg border p-4 sm:p-6 lg:p-4 2xl:p-6";
  const list = Array.isArray(payments) ? payments : [];
  const phasePct = expectedValue ? Math.min((Number(totalPaid) / Number(expectedValue)) * 100, 100) : 0;
  const totalPct = totalExpectedAllPhases ? Math.min((Number(totalPaidAllPhases) / Number(totalExpectedAllPhases)) * 100, 100) : 0;

  const PAGE_SIZE = 8;
  const [sortKey, setSortKey] = useState("payment_date");
  const [sortDir, setSortDir] = useState("asc");
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [commitmentFilter, setCommitmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [openGroupKeys, setOpenGroupKeys] = useState(() => new Set());

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

    const q = String(query || "").trim().toLowerCase();
    if (!q) return items;

    return items.filter((p) => {
      const hay = [p?.date, p?.orderNumber, p?.description, p?.installment, p?.contractor, p?.value]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [commitmentFilter, getPaymentDate, list, query, yearFilter]);

  const groups = useMemo(() => {
    const map = new Map();
    (filtered || []).forEach((p) => {
      const key = String(p?.orderNumber || "").trim() || "SEM_EMPENHO";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });

    const groupList = [];
    map.forEach((items, key) => {
      const sortedItems = [...items].sort((a, b) => (getPaymentDate(a)?.getTime() ?? 0) - (getPaymentDate(b)?.getTime() ?? 0));
      const totalsum = sortedItems.reduce((acc, p) => acc + (Number(p?.value) || 0), 0);
      const contractorSet = new Set(sortedItems.map((p) => String(p?.contractor || "").trim()).filter(Boolean));

      const firstDate = getPaymentDate(sortedItems[0]) || null;
      const lastDate = getPaymentDate(sortedItems[sortedItems.length - 1]) || null;

      const contractorLabel = contractorSet.size === 1 ? [...contractorSet][0] : contractorSet.size > 1 ? "Vários" : "-";
      const hasPortal = sortedItems.some((p) => Boolean(p?.url));

      groupList.push({
        key,
        orderNumber: key === "SEM_EMPENHO" ? "" : key,
        items: sortedItems,
        total: totalsum,
        contractorLabel,
        firstDate,
        lastDate,
        count: sortedItems.length,
        hasPortal,
      });
    });

    return groupList;
  }, [filtered, getPaymentDate]);

  const sortedGroups = useMemo(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    const getStr = (v) => String(v || "").toLowerCase();
    const getNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const list = groups.map((g, idx) => ({ g, idx }));
    list.sort((a, b) => {
      const ga = a.g;
      const gb = b.g;
      let cmp = 0;

      if (sortKey === "payment_date") {
        cmp = (ga.firstDate?.getTime() ?? 0) - (gb.firstDate?.getTime() ?? 0);
      } else if (sortKey === "orderNumber") {
        cmp = getStr(ga.orderNumber).localeCompare(getStr(gb.orderNumber));
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

    return list.map((x) => x.g);
  }, [groups, sortDir, sortKey]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE));
  }, [sortedGroups.length]);

  const pageSafe = useMemo(() => {
    const p = Number(page) || 1;
    return Math.max(1, Math.min(totalPages, p));
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [commitmentFilter, query, sortDir, sortKey, yearFilter]);

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

  const toggleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "payment_date" ? "asc" : "asc");
      return key;
    });
  }, []);

  const sortIndicator = useCallback(
    (key) => {
      if (sortKey !== key) return "↕";
      return sortDir === "asc" ? "▲" : "▼";
    },
    [sortDir, sortKey]
  );

  const toggleGroupOpen = useCallback((key) => {
    setOpenGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <Container className={containerClassName}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-3 w-1 rounded-full bg-blue-600" />
          <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
            Pagamentos{phaseName ? ` — ${phaseName}` : ""}
          </div>
        </div>
        {canAdd ? (
          <Button size="sm" variant="outline" onClick={onAddPayment} className="border-blue-200 text-blue-700 hover:bg-blue-50">
            <Plus className="h-4 w-4 mr-1" />
            Adicionar pagamento
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 border border-blue-200 text-blue-700 shrink-0">
              <Receipt className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-blue-700">Pago na Fase Atual</div>
              <div className="text-xl font-bold text-blue-900 mt-1">{formatCurrency(totalPaid)}</div>
            </div>
          </div>
          <Progress value={phasePct} className="h-2 bg-blue-100 mt-3" indicatorClassName="bg-blue-600" />
          <div className="text-xs text-blue-700 mt-2">{Math.round(phasePct)}%</div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 shrink-0">
              <Receipt className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-emerald-700">Total Pago (Todas as Fases)</div>
              <div className="text-xl font-bold text-emerald-900 mt-1">{formatCurrency(totalPaidAllPhases)}</div>
            </div>
          </div>
          <Progress value={totalPct} className="h-2 bg-emerald-100 mt-3" indicatorClassName="bg-emerald-600" />
          <div className="text-xs text-emerald-700 mt-2">{Math.round(totalPct)}%</div>
        </div>
      </div>

      {list.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="mb-4 text-xs sm:text-sm text-muted-foreground">
            Para consultar valores das fases anteriores, vá até a seção de{" "}
            <a href="#historico-licitacoes" className="text-primary underline underline-offset-2">
              Histórico de Licitações
            </a>
            .
          </div>

          <div className="mb-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div className="lg:col-span-6">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por descrição, empenho ou credor..."
                  className="bg-white pl-9"
                />
              </div>
            </div>
            <div className="lg:col-span-2">
              <select
                className="h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background"
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
            <div className="lg:col-span-2">
              <select
                className="h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background"
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
            <div className="lg:col-span-2 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 whitespace-nowrap">{sortedGroups.length} registros</div>
              {(query || yearFilter !== "all" || commitmentFilter !== "all") ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-500"
                  onClick={() => {
                    setQuery("");
                    setYearFilter("all");
                    setCommitmentFilter("all");
                  }}
                >
                  Limpar
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="border-b border-slate-200 hover:bg-transparent">
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("orderNumber")}>
                      Nº Empenho <span>{sortIndicator("orderNumber")}</span>
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("payment_date")}>
                      Data <span>{sortIndicator("payment_date")}</span>
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">
                    Descrição
                  </TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100 text-center">Parcela</TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("contractor")}>
                      Credor <span>{sortIndicator("contractor")}</span>
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("value")}>
                      Valor <span>{sortIndicator("value")}</span>
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-slate-900 dark:text-slate-100 text-center">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("portal")}>
                      Portal <span>{sortIndicator("portal")}</span>
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageGroups.map((group) => {
                  const isOpen = openGroupKeys.has(group.key);
                  const first = group.firstDate ? group.firstDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-";
                  return (
                    <Fragment key={group.key}>
                      <TableRow
                        className="odd:bg-background even:bg-slate-50/80 dark:even:bg-slate-900/20 hover:bg-slate-100/70 dark:hover:bg-slate-900/40 cursor-pointer"
                        onClick={() => toggleGroupOpen(group.key)}
                      >
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center text-slate-400">
                              {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </span>
                            <span className="font-semibold text-slate-800">{group.orderNumber || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{first}</TableCell>
                        <TableCell className="whitespace-normal break-words">
                          <div className="whitespace-normal break-words">
                            {group.items?.[0]?.description || "-"}
                            {group.count > 1 ? <span className="text-slate-400"> (+{group.count - 1})</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">{group.count === 1 ? (group.items?.[0]?.installment || "-") : "-"}</TableCell>
                        <TableCell className="whitespace-normal break-words">{group.contractorLabel}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(group.total)}</TableCell>
                        <TableCell className="text-center">
                          {group.count === 1 && group.items?.[0]?.url ? (
                            <Button asChild variant="ghost" size="sm" className="text-blue-700 hover:bg-blue-50">
                              <a href={group.items[0].url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Ver
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow className="bg-background">
                          <TableCell colSpan={7} className="p-0">
                            <div className="border-t border-border/60 bg-muted/10 px-3 py-3">
                              <div className="text-xs text-muted-foreground mb-2">
                                {group.count} pagamento{group.count === 1 ? "" : "s"} neste empenho
                              </div>
                              <div className="rounded-lg border border-border overflow-hidden bg-background">
                                <Table>
                                  <TableHeader className="bg-slate-50/70">
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="text-xs font-semibold text-slate-600">Nº Empenho</TableHead>
                                      <TableHead className="text-xs font-semibold text-slate-600">Data</TableHead>
                                      <TableHead className="text-xs font-semibold text-slate-600">Descrição</TableHead>
                                      <TableHead className="text-xs font-semibold text-slate-600">Parcela</TableHead>
                                      <TableHead className="text-xs font-semibold text-slate-600">Credor</TableHead>
                                      <TableHead className="text-xs font-semibold text-slate-600 text-right">Valor</TableHead>
                                      <TableHead className="text-xs font-semibold text-slate-600 text-center">Portal</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.items.map((p) => (
                                      <TableRow key={p.id} className="odd:bg-background even:bg-slate-50/50 hover:bg-slate-100/60">
                                        <TableCell className="whitespace-nowrap">{p.orderNumber || "-"}</TableCell>
                                        <TableCell className="whitespace-nowrap">{p.date || "-"}</TableCell>
                                        <TableCell className="whitespace-normal break-words">{p.description || "-"}</TableCell>
                                        <TableCell className="whitespace-nowrap">{p.installment || "-"}</TableCell>
                                        <TableCell className="whitespace-normal break-words">{p.contractor || "-"}</TableCell>
                                        <TableCell className="text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(p.value)}</TableCell>
                                        <TableCell className="text-center">
                                          {p.url ? (
                                            <Button asChild variant="ghost" size="sm" className="text-blue-700 hover:bg-blue-50">
                                              <a href={p.url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="h-3 w-3 mr-1" />
                                                Ver
                                              </a>
                                            </Button>
                                          ) : (
                                            <span className="text-muted-foreground">-</span>
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

          {sortedGroups.length > 0 ? (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-slate-500">
                Exibindo {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(sortedGroups.length, pageSafe * PAGE_SIZE)} de {sortedGroups.length} registros
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, (Number(p) || 1) - 1))}
                >
                  ‹
                </Button>
                <div className="flex items-center gap-1">
                  {pageNumbers.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={n === pageSafe ? "default" : "outline"}
                      size="sm"
                      className={n === pageSafe ? "bg-blue-600 hover:bg-blue-600" : ""}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, (Number(p) || 1) + 1))}
                >
                  ›
                </Button>
              </div>
            </div>
          ) : null}

          {sortedGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum pagamento encontrado.</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum pagamento registrado {phaseName ? `para ${phaseName}` : ""}</p>
        </div>
      )}
    </Container>
  );
}
