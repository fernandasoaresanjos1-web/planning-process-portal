import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import * as XLSX from "xlsx";

type RawRow = Record<string, unknown>;
type JsonObject = { [key: string]: Json | undefined };

export type EmpresaMensalRow = {
  importacao_id: string;
  competencia: string;
  cnpj: string;
  razao: string | null;
  nome_fantasia: string | null;
  regime: string | null;
  grupo: string | null;
  tags: string[];
  sem_tag: boolean;
  dados: JsonObject;
  atualizado_em: string;
};

export type EmpresaImportacao = {
  id: string;
  competencia: string;
  arquivo_nome: string;
  total_linhas: number;
  total_empresas: number;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  criado_por: string | null;
};

export type EmpresaBaseResumo = {
  total: number;
  competencia: string | null;
  importacao: EmpresaImportacao | null;
};

function normalize(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanText(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s === "#NAME?") return null;
  return s;
}

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

function findHeader(headers: string[], patterns: RegExp[]) {
  return headers.find((h) => patterns.some((p) => p.test(normalize(h))));
}

function parseTags(v: unknown) {
  return String(v ?? "")
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toJsonObject(row: RawRow): JsonObject {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value == null) return [key, null];
      if (["string", "number", "boolean"].includes(typeof value)) return [key, value as Json];
      return [key, String(value)];
    }),
  );
}

function competenciaFromFilename(name: string): string | null {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})?/);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${String(mes).padStart(2, "0")}-01`;
}

export async function parseEmpresasFile(file: File, competenciaInput?: string): Promise<{ competencia: string; rows: Omit<EmpresaMensalRow, "importacao_id" | "atualizado_em">[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  if (!json.length) return { competencia: competenciaInput ? `${competenciaInput}-01` : competenciaFromFilename(file.name) ?? "", rows: [] };

  const headers = Object.keys(json[0]);
  const cnpjCol = findHeader(headers, [/^cnpj$/, /cnpj_cpf/, /cpf_cnpj/]);
  const razaoCol = findHeader(headers, [/^razao_social$/, /^razao$/, /nome_empresarial/]);
  const fantasiaCol = findHeader(headers, [/nome_fantasia/, /^fantasia$/]);
  const regimeCol = findHeader(headers, [/^regime$/, /regime_tributario/, /tributacao/]);
  const grupoCol = findHeader(headers, [/grupo/, /grupo_economico/]);
  const tagCols = headers.filter((h) => /(^tag$|^tags$|tag_|_tag|equipe|time|departamento|depto)/.test(normalize(h)));

  if (!cnpjCol) throw new Error("Não encontrei a coluna CNPJ na planilha.");

  const competencia = competenciaInput ? `${competenciaInput}-01` : competenciaFromFilename(file.name);
  if (!competencia) throw new Error("Informe a competência do upload ou use um arquivo com data no nome, como 202606.");

  const seen = new Set<string>();
  const rows = json.flatMap((r) => {
    const cnpj = onlyDigits(r[cnpjCol]);
    if (!cnpj || seen.has(cnpj)) return [];
    seen.add(cnpj);
    const tags = tagCols.flatMap((c) => parseTags(r[c]));
    const uniqueTags = Array.from(new Set(tags));
    return [{
      competencia,
      cnpj,
      razao: razaoCol ? cleanText(r[razaoCol]) : null,
      nome_fantasia: fantasiaCol ? cleanText(r[fantasiaCol]) : null,
      regime: regimeCol ? cleanText(r[regimeCol]) : null,
      grupo: grupoCol ? cleanText(r[grupoCol]) : null,
      tags: uniqueTags,
      sem_tag: uniqueTags.length === 0,
      dados: toJsonObject(r),
    }];
  });

  return { competencia, rows };
}

export async function listEmpresasImportacoes(): Promise<EmpresaImportacao[]> {
  const { data, error } = await supabase
    .from("empresas_importacoes")
    .select("*")
    .order("competencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []) as EmpresaImportacao[];
}

export async function getEmpresaBaseResumo(): Promise<EmpresaBaseResumo> {
  const { data: importacao, error: impError } = await supabase
    .from("empresas_importacoes")
    .select("*")
    .eq("ativo", true)
    .order("competencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (impError) throw impError;
  if (!importacao) return { total: 0, competencia: null, importacao: null };

  const { count, error } = await supabase
    .from("empresas_base_mensal")
    .select("cnpj", { count: "exact", head: true })
    .eq("importacao_id", importacao.id);
  if (error) throw error;
  return { total: count ?? importacao.total_empresas ?? 0, competencia: importacao.competencia, importacao: importacao as EmpresaImportacao };
}

export async function importEmpresasMensal(file: File, competenciaInput: string, autor?: string) {
  const parsed = await parseEmpresasFile(file, competenciaInput);
  if (parsed.rows.length === 0) throw new Error("A planilha não tem empresas válidas para importar.");

  const { error: oldImpErr } = await supabase
    .from("empresas_importacoes")
    .update({ ativo: false })
    .eq("ativo", true);
  if (oldImpErr) throw oldImpErr;

  const { data: importacao, error: impErr } = await supabase
    .from("empresas_importacoes")
    .insert({
      competencia: parsed.competencia,
      arquivo_nome: file.name,
      total_linhas: parsed.rows.length,
      total_empresas: parsed.rows.length,
      observacao: "Upload mensal de empresas",
      criado_por: autor ?? null,
      ativo: true,
    })
    .select("*")
    .single();
  if (impErr) throw impErr;

  const { error: delErr } = await supabase
    .from("empresas_base_mensal")
    .delete()
    .eq("competencia", parsed.competencia);
  if (delErr) throw delErr;

  const now = new Date().toISOString();
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const batch = parsed.rows.slice(i, i + 500).map((r) => ({ ...r, importacao_id: importacao.id, atualizado_em: now }));
    const { error } = await supabase.from("empresas_base_mensal").insert(batch);
    if (error) throw error;
  }

  return { importacao: importacao as EmpresaImportacao, total: parsed.rows.length };
}

/** Empresas da importação ativa, com paginação interna pra atravessar o limite do PostgREST. */
export async function listEmpresasAtivas(): Promise<EmpresaMensalRow[]> {
  const resumo = await getEmpresaBaseResumo();
  if (!resumo.importacao) return [];
  const importacaoId = resumo.importacao.id;
  const PAGE = 1000;
  const out: EmpresaMensalRow[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("empresas_base_mensal")
      .select("*")
      .eq("importacao_id", importacaoId)
      .order("cnpj")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as EmpresaMensalRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
