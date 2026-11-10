import React, { useEffect, useState } from 'react';
import { MunicipalEmptyState, MunicipalPagination } from './MunicipalPageUi';

export default function PipaTable({ headings, rows, render, empty = 'Nenhum registro encontrado' }) {
  const [page, setPage] = useState(1), size = 20;
  useEffect(() => setPage(1), [rows.length]);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  return <div className="pipa-panel">{rows.length ? <><div className="pipa-table-scroll"><table className="pipa-table"><thead><tr>{headings.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.slice((current - 1) * size, current * size).map(render)}</tbody></table></div><MunicipalPagination page={current} total={rows.length} pageSize={size} onPageChange={setPage} /></> : <MunicipalEmptyState title={empty} />}</div>;
}
