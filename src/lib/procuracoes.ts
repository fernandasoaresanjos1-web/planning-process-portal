import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { listEmpresasAtivas, type EmpresaSlim } from "@/lib/sittax-sn";

export type ProcuracaoRow = {
  cnpj: string;
  razao: string | null;
  validade: string | null; // ISO date
  situacao: string | null;
  certificado: string | null;
};

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}
function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}
function excelDateToIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial -> JS date (epoch: 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function parseProcuracoesFile(file: File): Promise<ProcuracaoRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (!matrix.length) return [];

  // Detecta header pela presença de "cnpj" ou "cpf" na primeira linha
  const firstRow = (matrix[0] ?? []).map((x) => String(x ?? "").toLowerCase());
  const headerRow = firstRow.some((c) => c.includes("cnpj") || c.includes("cpf") || c.includes("razão")) ? 0 : -1;

  // Estrutura esperada: Razão Social | CPF/CNPJ | Validade | Situação | Certificado
  const seen = new Set<string>();
  const rows: ProcuracaoRow[] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const cnpj = digits(r[1]);
    if (cnpj.length !== 14) continue; // ignora CPFs
    if (seen.has(cnpj)) continue;
    seen.add(cnpj);
    rows.push({
      cnpj,
      razao: clean(r[0]),
      validade: excelDateToIso(r[2]),
      situacao: clean(r[3]),
      certificado: clean(r[4]),
    });
  }
  return rows;
}

export async function importProcuracoesFile(file: File) {
  const rows = await parseProcuracoesFile(file);
  if (!rows.length) throw new Error("Nenhum CNPJ válido encontrado na planilha.");
  const { error: delErr } = await supabase.from("procuracoes_cadastros").delete().neq("cnpj", "");
  if (delErr) throw delErr;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, atualizado_em: now }));
    const { error } = await supabase.from("procuracoes_cadastros").insert(batch);
    if (error) throw error;
  }
  return rows.length;
}

export async function listProcuracoes(): Promise<ProcuracaoRow[]> {
  const out: ProcuracaoRow[] = [];
  let from = 0;
  const step = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("procuracoes_cadastros")
      .select("cnpj,razao,validade,situacao,certificado")
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = (data ?? []) as ProcuracaoRow[];
    out.push(...chunk);
    if (chunk.length < step) break;
    from += step;
  }
  return out;
}

export type EmpresaComProcuracao = EmpresaSlim & {
  tem_procuracao: boolean;
  validade: string | null;
  situacao: string | null;
  certificado: string | null;
};

export type EquipeBreakdown = {
  equipe: string;
  total: number;
  com: number;
  sem: number;
};

export type AnaliseProcuracoes = {
  competencia: string | null;
  total_fiscal: number;
  com_procuracao: number;
  sem_procuracao: number;
  total_procuracoes: number;
  fora_da_base: ProcuracaoRow[];
  equipes: EquipeBreakdown[];
  empresas: EmpresaComProcuracao[];
};

export async function gerarAnalise(): Promise<AnaliseProcuracoes> {
  const [procs, ativa] = await Promise.all([listProcuracoes(), listEmpresasAtivas()]);
  const procMap = new Map(procs.map((p) => [p.cnpj, p]));
  const empresasMap = new Map(ativa.rows.map((e) => [e.cnpj, e]));

  const empresas: EmpresaComProcuracao[] = ativa.rows.map((e) => {
    const p = procMap.get(e.cnpj);
    return {
      ...e,
      tem_procuracao: !!p,
      validade: p?.validade ?? null,
      situacao: p?.situacao ?? null,
      certificado: p?.certificado ?? null,
    };
  });

  const equipeMap = new Map<string, EquipeBreakdown>();
  const ensure = (eq: string) => {
    let b = equipeMap.get(eq);
    if (!b) {
      b = { equipe: eq, total: 0, com: 0, sem: 0 };
      equipeMap.set(eq, b);
    }
    return b;
  };
  for (const e of empresas) {
    const equipes = e.tags ?? [];
    for (const eq of equipes) {
      const b = ensure(eq);
      b.total++;
      if (e.tem_procuracao) b.com++;
      else b.sem++;
    }
  }

  const fora_da_base = procs.filter((p) => !empresasMap.has(p.cnpj));
  const com_procuracao = empresas.filter((e) => e.tem_procuracao).length;

  const equipes = Array.from(equipeMap.values()).sort((a, b) => b.sem - a.sem || b.total - a.total);

  return {
    competencia: ativa.competencia,
    total_fiscal: empresas.length,
    com_procuracao,
    sem_procuracao: empresas.length - com_procuracao,
    total_procuracoes: procs.length,
    fora_da_base,
    equipes,
    empresas,
  };
}

export function exportToXlsx(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function formatCnpj(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
