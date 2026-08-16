import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export interface IrpjLpUpload {
  id: string;
  competencia: string;
  arquivo_nome: string;
  total_linhas: number;
  observacao: string | null;
  criado_por: string | null;
  criado_em: string;
}

export interface IrpjLpAutoRow {
  id: string;
  upload_id: string;
  competencia: string;
  cnpj: string;
  empresa: string | null;
  grupo: string | null;
  regime: string | null;
  ultimo_balancete: string | null;
  ultimo_balancete_iso: string | null;
  dados: Record<string, unknown>;
  criado_em: string;
}

export interface IrpjLpParsedRow {
  cnpj: string;
  empresa: string | null;
  grupo: string | null;
  regime: string | null;
  ultimo_balancete: string | null;
  ultimo_balancete_iso: string | null;
  dados: Record<string, unknown>;
}

export interface IrpjLpParseResult {
  rows: IrpjLpParsedRow[];
  competenciaSugerida: string | null;
}

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const norm = (s: string) =>
  String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function pickCol(headers: string[], patterns: RegExp[]): string | undefined {
  return headers.find((h) => patterns.some((p) => p.test(norm(h))));
}

function balanceteToIso(v: unknown): { txt: string | null; iso: string | null } {
  const s = String(v ?? "").trim();
  if (!s) return { txt: null, iso: null };
  const m = s.match(/(\d{1,2})\/(\d{4})/);
  if (!m) return { txt: s, iso: null };
  const mm = m[1].padStart(2, "0");
  return { txt: `${mm}/${m[2]}`, iso: `${m[2]}-${mm}-01` };
}

export async function parseIrpjLpFile(file: File): Promise<IrpjLpParseResult> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  let json: Record<string, unknown>[];
  if (name.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buf);
    const wb = XLSX.read(text, { type: "string", FS: ";" });
    json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  } else {
    const wb = XLSX.read(buf, { type: "array" });
    json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }
  if (!json.length) return { rows: [], competenciaSugerida: null };
  const headers = Object.keys(json[0]);
  const cCnpj = pickCol(headers, [/^cnpj$/, /cnpj/]);
  const cEmp = pickCol(headers, [/empresa/, /razao/]);
  const cGrupo = pickCol(headers, [/grupo/]);
  const cReg = pickCol(headers, [/regime/]);
  const cBal = pickCol(headers, [/balancete/, /ultimo/]);
  if (!cCnpj) throw new Error("Coluna CNPJ não encontrada.");
  if (!cBal) throw new Error("Coluna 'Último Balancete' não encontrada.");

  const seen = new Set<string>();
  const rows: IrpjLpParsedRow[] = [];
  let maxIso: string | null = null;
  for (const r of json) {
    const cnpj = onlyDigits(r[cCnpj]);
    if (!cnpj || seen.has(cnpj)) continue;
    seen.add(cnpj);
    const bal = balanceteToIso(r[cBal]);
    if (bal.iso && (!maxIso || bal.iso > maxIso)) maxIso = bal.iso;
    rows.push({
      cnpj,
      empresa: cEmp ? String(r[cEmp] ?? "").trim() || null : null,
      grupo: cGrupo ? String(r[cGrupo] ?? "").trim() || null : null,
      regime: cReg ? String(r[cReg] ?? "").trim() || null : null,
      ultimo_balancete: bal.txt,
      ultimo_balancete_iso: bal.iso,
      dados: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : String(v)])),
    });
  }
  return { rows, competenciaSugerida: maxIso };
}

export async function importIrpjLp(file: File, competenciaYYYYMM: string, autor?: string) {
  const parsed = await parseIrpjLpFile(file);
  if (!parsed.rows.length) throw new Error("A planilha não tem linhas válidas.");
  if (!/^\d{4}-\d{2}$/.test(competenciaYYYYMM)) throw new Error("Competência inválida.");
  const competencia = `${competenciaYYYYMM}-01`;

  const { data: upl, error: uErr } = await supabase
    .from("irpj_lp_uploads")
    .insert({
      competencia,
      arquivo_nome: file.name,
      total_linhas: parsed.rows.length,
      observacao: null,
      criado_por: autor ?? null,
    })
    .select("*")
    .single();
  if (uErr) throw uErr;

  // Só apaga a competência informada
  const { error: dErr } = await supabase
    .from("irpj_lp_automatizacao")
    .delete()
    .eq("competencia", competencia);
  if (dErr) throw dErr;

  const upload_id = upl.id;
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const batch = parsed.rows.slice(i, i + 500).map((r) => ({
      upload_id,
      competencia,
      cnpj: r.cnpj,
      empresa: r.empresa,
      grupo: r.grupo,
      regime: r.regime,
      ultimo_balancete: r.ultimo_balancete,
      ultimo_balancete_iso: r.ultimo_balancete_iso,
      dados: r.dados as never,
    }));
    const { error } = await supabase.from("irpj_lp_automatizacao").insert(batch as never);
    if (error) throw error;
  }
  return { upload: upl as IrpjLpUpload, total: parsed.rows.length };
}

export async function listIrpjLpUploads(): Promise<IrpjLpUpload[]> {
  const { data, error } = await supabase
    .from("irpj_lp_uploads")
    .select("*")
    .order("competencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(48);
  if (error) throw error;
  return (data ?? []) as IrpjLpUpload[];
}

export async function listIrpjLpAuto(): Promise<IrpjLpAutoRow[]> {
  const PAGE = 1000;
  const out: IrpjLpAutoRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("irpj_lp_automatizacao")
      .select("*")
      .order("competencia", { ascending: false })
      .order("cnpj")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as IrpjLpAutoRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export function competenciaLabel(iso: string): string {
  // iso "YYYY-MM-01"
  const [y, m] = iso.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m) - 1]}/${y.slice(2)}`;
}
