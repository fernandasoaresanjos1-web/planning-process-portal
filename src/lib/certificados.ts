import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist";

import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export type Fonte = "ByToken" | "SAAM" | "Agilizza";

export type Certificado = {
  id: string;
  importacao_id: string;
  fonte: string;
  cnpj: string;
  razao: string | null;
  validade: string | null;
  usuarios: Json;
};

export type CertificadoImportacao = {
  id: string;
  fonte: string;
  arquivo_nome: string;
  total_linhas: number;
  total_certificados: number;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  criado_por: string | null;
};

type ParsedRow = {
  cnpj: string;
  razao: string | null;
  validade: string | null;
  usuarios: string[];
};

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

function parseDateBR(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Excel serial date
  const num = Number(s);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const d = XLSX.SSF.parse_date_code(num);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return null;
}

export async function parsePdfBytoken(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const allLines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (line.trim()) allLines.push(line.trim());
        line = "";
      }
      line += (line ? " " : "") + item.str;
      lastY = y;
    }
    if (line.trim()) allLines.push(line.trim());
  }
  const records: ParsedRow[] = [];
  let cur: ParsedRow | null = null;
  const headRe = /^\d+\s+(\d{11,14})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})$/;
  for (const ln of allLines) {
    const m = ln.match(headRe);
    if (m) {
      if (cur) records.push(cur);
      cur = { cnpj: m[1], razao: m[2].trim(), validade: parseDateBR(m[3]), usuarios: [] };
    } else if (cur && (ln.endsWith("BYTOKEN") || ln.endsWith("MANUAL") || ln.endsWith("DESCONHECIDO"))) {
      cur.usuarios.push(ln);
    }
  }
  if (cur) records.push(cur);
  return dedupe(records);
}

export async function parseXlsxCertificados(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string", cellDates: true, raw: false })
    : XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!json.length) return [];
  const headers = Object.keys(json[0]);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  const cnpjCol = headers.find((h) => /cnpj|cpfcnpj|cnpjcpf|documento/.test(norm(h)));
  const certCol = headers.find((h) => /^certificado$/.test(norm(h)))
    ?? headers.find((h) => /certificado/.test(norm(h)))
    ?? headers.find((h) => /apelido/.test(norm(h)));
  const razaoCol = headers.find((h) => /razao|nomeempresarial|empresa|^nome$|fantasia/.test(norm(h)));
  const validadeCol = headers.find((h) => /validade|vencimento|expira|datavalidade/.test(norm(h)));
  if (!validadeCol) throw new Error("Não encontrei a coluna Validade/Vencimento na planilha.");
  if (!cnpjCol && !certCol) throw new Error("Não encontrei a coluna CNPJ na planilha.");
  // Agilizza: "RAZAO SOCIAL:00000000000000" embutido na coluna Certificado
  const extractEmbedded = (v: unknown): { cnpj: string; razao: string | null } | null => {
    const s = String(v ?? "");
    const m = s.match(/^(.*?)[:|]\s*(\d{11,14})\s*$/);
    if (m) return { razao: m[1].trim() || null, cnpj: m[2] };
    const d = onlyDigits(s);
    if (d.length >= 11 && d.length <= 14) return { cnpj: d, razao: null };
    return null;
  };
  const rows: ParsedRow[] = json.flatMap((r) => {
    let cnpj = cnpjCol ? onlyDigits(r[cnpjCol]) : "";
    let razao: string | null = razaoCol ? String(r[razaoCol] ?? "").trim() || null : null;
    if (!cnpj && certCol) {
      const ex = extractEmbedded(r[certCol]);
      if (ex) { cnpj = ex.cnpj; if (!razao) razao = ex.razao; }
    }
    if (!cnpj) return [];
    const raw = r[validadeCol];
    const validade = raw instanceof Date
      ? `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`
      : parseDateBR(String(raw));
    return [{ cnpj, razao, validade, usuarios: [] }];
  });
  return dedupe(rows);
}

function dedupe(rows: ParsedRow[]): ParsedRow[] {
  const map = new Map<string, ParsedRow>();
  for (const r of rows) {
    const prev = map.get(r.cnpj);
    if (!prev) { map.set(r.cnpj, r); continue; }
    const a = prev.validade ?? "";
    const b = r.validade ?? "";
    if (b > a) map.set(r.cnpj, r);
  }
  return Array.from(map.values());
}

/**
 * Parser do relatório SAAM "Certificados Ativos/Vencidos".
 * Cabeçalhos podem ter \n; datas vêm como "dd/mm/aaaa hh:mm:ss".
 * Se Situação = "Certificado Vencido!" e não há "Válido até", marca validade no passado.
 */
export async function parseSaamXlsx(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string", cellDates: true, raw: false })
    : XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (!matrix.length) return [];
  const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const headers = (matrix[0] as unknown[]).map(norm);
  const findIdx = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const iCnpj = findIdx(/\bcnpj\b/);
  const iEmp = findIdx(/empresa|base de dados|razao|nome empresarial/);
  const iSit = findIdx(/situacao|status certificado/);
  const iValido = findIdx(/valido ate|validade|vencimento/);
  if (iCnpj < 0) throw new Error("SAAM: não encontrei a coluna CNPJ.");

  const parseValidade = (raw: unknown): string | null => {
    if (raw instanceof Date) return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}-${String(raw.getDate()).padStart(2, "0")}`;
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return parseDateBR(s);
  };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] as unknown[];
    const cnpj = onlyDigits(r[iCnpj]);
    if (cnpj.length !== 14) continue;
    const razao = iEmp >= 0
      ? String(r[iEmp] ?? "").replace(/\s*\(Base de Dados[^)]*\)\s*/i, "").trim() || null
      : null;
    let validade = iValido >= 0 ? parseValidade(r[iValido]) : null;
    const sit = iSit >= 0 ? String(r[iSit] ?? "").toLowerCase() : "";
    if (!validade && sit.includes("vencido")) validade = "1970-01-01";
    rows.push({ cnpj, razao, validade, usuarios: [] });
  }
  return dedupe(rows);
}

export async function importCertificados(fonte: Fonte, file: File, autor?: string) {
  const rows = fonte === "ByToken" && file.name.toLowerCase().endsWith(".pdf")
    ? await parsePdfBytoken(file)
    : fonte === "SAAM"
    ? await parseSaamXlsx(file)
    : await parseXlsxCertificados(file);
  if (!rows.length) throw new Error("Nenhum certificado encontrado no arquivo.");

  // desativa importações anteriores da fonte
  await supabase.from("certificados_importacoes").update({ ativo: false }).eq("fonte", fonte);

  const { data: imp, error: impErr } = await supabase
    .from("certificados_importacoes")
    .insert({
      fonte,
      arquivo_nome: file.name,
      total_linhas: rows.length,
      total_certificados: rows.length,
      criado_por: autor ?? null,
      ativo: true,
    })
    .select("*")
    .single();
  if (impErr) throw impErr;

  // remove certificados das importações antigas dessa fonte
  await supabase.from("certificados").delete().eq("fonte", fonte).neq("importacao_id", imp.id);

  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({
      importacao_id: imp.id,
      fonte,
      cnpj: r.cnpj,
      razao: r.razao,
      validade: r.validade,
      usuarios: r.usuarios as unknown as Json,
      atualizado_em: now,
    }));
    const { error } = await supabase.from("certificados").insert(batch);
    if (error) throw error;
  }
  return { total: rows.length, importacao: imp as CertificadoImportacao };
}

export async function listImportacoesCert(): Promise<CertificadoImportacao[]> {
  const { data, error } = await supabase
    .from("certificados_importacoes")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as CertificadoImportacao[];
}

export type ResumoCert = {
  porFonte: Record<string, { total: number; vencidos: number; vence30: number; vence60: number; vence90: number }>;
  totalUnicos: number;
};

function hasAgenteBytoken(usuarios: unknown): boolean {
  if (!Array.isArray(usuarios)) return false;
  return usuarios.some((u) => String(u ?? "").toLowerCase().includes("agentebytoken"));
}

export async function getResumoCertificados(): Promise<ResumoCert> {
  const fontes: Fonte[] = ["ByToken", "Agilizza", "SAAM"];
  const por: ResumoCert["porFonte"] = {};
  const unicos = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  const d30 = addDays(today, 30);
  const d60 = addDays(today, 60);
  const d90 = addDays(today, 90);
  for (const f of fontes) {
    const lista = await listarCertificadosPorFonte(f);
    por[f] = { total: 0, vencidos: 0, vence30: 0, vence60: 0, vence90: 0 };
    for (const r of lista) {
      unicos.add(r.cnpj);
      por[f].total++;
      const v = r.validade;
      if (!v) continue;
      if (v < today) por[f].vencidos++;
      else if (v <= d30) por[f].vence30++;
      else if (v <= d60) por[f].vence60++;
      else if (v <= d90) por[f].vence90++;
    }
  }
  return { porFonte: por, totalUnicos: unicos.size };
}


function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type EmpresaSemCertificado = {
  cnpj: string;
  razao: string | null;
  grupo: string | null;
  tags: string[];
};

export async function getEmpresasSemCertificado(fonte: Fonte, limit = 5000): Promise<{ rows: EmpresaSemCertificado[]; totalEmpresas: number; comCertificado: number }> {
  // pega importação ativa da base mensal
  const { data: impEmp } = await supabase
    .from("empresas_importacoes")
    .select("id")
    .eq("ativo", true)
    .order("competencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!impEmp) return { rows: [], totalEmpresas: 0, comCertificado: 0 };

  async function fetchAll<T>(builder: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const out: T[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await builder(from, from + size - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      out.push(...data);
      if (data.length < size) break;
    }
    return out;
  }

  const empresasRaw = await fetchAll<{ cnpj: string; razao: string | null; grupo: string | null; tags: string[] | null }>(
    async (from, to) => await supabase.from("empresas_base_mensal").select("cnpj,razao,grupo,tags").eq("importacao_id", impEmp.id).range(from, to)
  );
  const empresas = empresasRaw.filter((e) => !isEquipeExcluida(e.tags));
  const certs = await fetchAll<{ cnpj: string; usuarios: Json }>(
    async (from, to) => await supabase.from("certificados").select("cnpj,usuarios").eq("fonte", fonte).range(from, to)
  );

  const certsFiltrados = fonte === "ByToken" ? certs.filter((c) => hasAgenteBytoken(c.usuarios)) : certs;
  const setCert = new Set(certsFiltrados.map((c) => c.cnpj));
  const setCertSemZero = new Set(Array.from(setCert).map((c) => c.replace(/^0+/, "")));
  let comCert = 0;
  const semCert: EmpresaSemCertificado[] = [];
  for (const e of empresas) {
    const c = e.cnpj;
    const found = setCert.has(c) || setCertSemZero.has(c.replace(/^0+/, ""));
    if (found) comCert++;
    else semCert.push({ cnpj: c, razao: e.razao, grupo: e.grupo, tags: e.tags ?? [] });
  }
  return { rows: semCert.slice(0, limit), totalEmpresas: empresas.length, comCertificado: comCert };
}

export function isEquipeExcluida(tags: string[] | null | undefined): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => {
    const s = String(t ?? "").toLowerCase();
    return s.includes("equipe cc") || s.includes("planning rj");
  });
}

export type CertificadoLista = {
  cnpj: string;
  razao: string | null;
  validade: string | null;
  status: "vencido" | "30" | "60" | "90" | "ok" | "sem-data";
  diasRestantes: number | null;
  grupo: string | null;
  tags: string[];
};

export async function listarCertificadosByToken(): Promise<CertificadoLista[]> {
  return listarCertificadosPorFonte("ByToken");
}

export async function listarCertificadosPorFonte(fonte: Fonte): Promise<CertificadoLista[]> {
  const pageSize = 1000;
  const certs: Array<{ cnpj: string; razao: string | null; validade: string | null; usuarios: Json }> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("certificados")
      .select("cnpj,razao,validade,usuarios")
      .eq("fonte", fonte)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    certs.push(...data);
    if (data.length < pageSize) break;
  }
  const filtrados = fonte === "ByToken" ? certs.filter((c) => hasAgenteBytoken(c.usuarios)) : certs;


  // join com empresas para pegar grupo/tags e excluir equipes
  const { data: impEmp } = await supabase
    .from("empresas_importacoes")
    .select("id")
    .eq("ativo", true)
    .order("competencia", { ascending: false })
    .limit(1)
    .maybeSingle();

  const empMap = new Map<string, { grupo: string | null; tags: string[] }>();
  if (impEmp) {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("empresas_base_mensal")
        .select("cnpj,grupo,tags")
        .eq("importacao_id", impEmp.id)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const e of data) {
        if (isEquipeExcluida(e.tags)) continue;
        empMap.set(e.cnpj, { grupo: e.grupo, tags: e.tags ?? [] });
        empMap.set(e.cnpj.replace(/^0+/, ""), { grupo: e.grupo, tags: e.tags ?? [] });
      }
      if (data.length < pageSize) break;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: CertificadoLista[] = [];
  for (const c of filtrados) {
    const meta = empMap.get(c.cnpj) ?? empMap.get(c.cnpj.replace(/^0+/, ""));
    // se temos base e a empresa não está nela (ou foi excluída), pula
    if (impEmp && empMap.size > 0 && !meta) continue;
    let status: CertificadoLista["status"] = "sem-data";
    let dias: number | null = null;
    if (c.validade) {
      const v = new Date(c.validade + "T00:00:00");
      dias = Math.floor((v.getTime() - today.getTime()) / 86400000);
      if (dias < 0) status = "vencido";
      else if (dias <= 30) status = "30";
      else if (dias <= 60) status = "60";
      else if (dias <= 90) status = "90";
      else status = "ok";
    }
    out.push({
      cnpj: c.cnpj,
      razao: c.razao,
      validade: c.validade,
      status,
      diasRestantes: dias,
      grupo: meta?.grupo ?? null,
      tags: meta?.tags ?? [],
    });
  }
  // ordena por validade asc (vencidos primeiro)
  out.sort((a, b) => {
    if (!a.validade) return 1;
    if (!b.validade) return -1;
    return a.validade.localeCompare(b.validade);
  });
  return out;
}

