import * as XLSX from "xlsx";

export interface SheetSpec {
  name: string;
  rows: Array<Record<string, unknown>>;
}

/** Gera e baixa um arquivo .xlsx com uma ou mais abas. */
export function exportXlsx(fileName: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  let added = 0;
  sheets.forEach((s) => {
    if (!s.rows?.length) return;
    const ws = XLSX.utils.json_to_sheet(s.rows);
    const cols = Object.keys(s.rows[0] || {});
    ws["!cols"] = cols.map((c) => ({ wch: Math.min(48, Math.max(12, c.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    added++;
  });
  if (!added) {
    alert("Não há dados para exportar com os filtros atuais.");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
}
