import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export type SittaxRow = {
  cnpj: string;
  razao: string | null;
  apelido: string | null;
  uf: string | null;
  cidade: string | null;
};

export type EmpresaSlim = {
  cnpj: string;
  razao: string | null;
  regime: string | null;
  grupo: string | null;
  tags: string[];
};

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/** Lê a planilha do Sittax — pode ter ou não cabeçalho. Colunas: CNPJ, Razão, Apelido, UF, Cidade. */
export async function parseSittaxFile(file: File): Promise<SittaxRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (!matrix.length) return [];

  // Detecta header: se a primeira célula da primeira linha não for CNPJ válido, considera header.
  const firstCnpj = digits(matrix[0]?.[0]);
  const startRow = firstCnpj.length === 14 ? 0 : 1;

  const seen = new Set<string>();
  const rows: SittaxRow[] = [];
  for (let i = startRow; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const cnpj = digits(r[0]);
    if (cnpj.length !== 14 || seen.has(cnpj)) continue;
    seen.add(cnpj);
    rows.push({
      cnpj,
      razao: clean(r[1]),
      apelido: clean(r[2]),
      uf: clean(r[3]),
      cidade: clean(r[4]),
    });
  }
  return rows;
}

/** Sobrescreve a base inteira do Sittax SN com o conteúdo do arquivo. */
export async function importSittaxFile(file: File) {
  const rows = await parseSittaxFile(file);
  if (!rows.length) throw new Error("Nenhum CNPJ válido encontrado na planilha.");
  // Limpa tudo e reinsere — base substituída a cada upload.
  const { error: delErr } = await supabase.from("sittax_sn_cadastros").delete().neq("cnpj", "");
  if (delErr) throw delErr;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, atualizado_em: now }));
    const { error } = await supabase.from("sittax_sn_cadastros").insert(batch);
    if (error) throw error;
  }
  return rows.length;
}

export async function listSittax(): Promise<SittaxRow[]> {
  const out: SittaxRow[] = [];
  let from = 0;
  const step = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("sittax_sn_cadastros")
      .select("cnpj,razao,apelido,uf,cidade")
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = (data ?? []) as SittaxRow[];
    out.push(...chunk);
    if (chunk.length < step) break;
    from += step;
  }
  return out;
}

export async function listEmpresasAtivas(): Promise<{ competencia: string | null; rows: EmpresaSlim[] }> {
  const { data: imp, error: ie } = await supabase
    .from("empresas_importacoes")
    .select("id,competencia")
    .eq("ativo", true)
    .order("competencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ie) throw ie;
  if (!imp) return { competencia: null, rows: [] };

  const rows: EmpresaSlim[] = [];
  let from = 0;
  const step = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("empresas_base_mensal")
      .select("cnpj,razao,regime,grupo,tags")
      .eq("importacao_id", imp.id)
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = (data ?? []) as EmpresaSlim[];
    rows.push(...chunk);
    if (chunk.length < step) break;
    from += step;
  }
  return { competencia: imp.competencia, rows };
}

/** Simples Nacional matriz: SN Geral ou MEI. Exclui filial e SN CC (Equipe CC fora). */
export function isSimplesNacional(regime: string | null): boolean {
  if (!regime) return false;
  const r = regime.toLowerCase().trim();
  if (r.includes("filial")) return false;
  if (r.includes(" cc")) return false; // SN CC
  return r.includes("simples nacional") || r.startsWith("mei");
}

/** Verifica se a tag é uma equipe FISCAL elegível (exclui CC, Canopus, Planning RJ, CX, FILIAL). */
export function isTagFiscalElegivel(tag: string): boolean {
  const t = tag.toLowerCase().trim();
  if (!t.includes("fiscal")) return false;
  if (t.includes("equipe cc")) return false;
  if (t.includes("canopus")) return false;
  if (t.includes("planning rj")) return false;
  if (t === "cx" || t === "filial") return false;
  return true;
}

export type EquipeBreakdown = {
  equipe: string;
  total_sn: number;
  cadastrados: number;
  faltam: number;
};

export type AnaliseSittax = {
  competencia: string | null;
  total_acessorias: number;
  total_sn_acessorias: number;
  total_sittax: number;
  cadastrados: number;
  faltam_cadastrar: number;
  fora_regime: SittaxComContexto[];
  fora_da_base: SittaxRow[];
  equipes: EquipeBreakdown[];
  faltam_lista: EmpresaSlim[];
};

export type SittaxComContexto = SittaxRow & { regime_acessorias: string | null; tags: string[]; grupo: string | null };

export async function gerarAnalise(): Promise<AnaliseSittax> {
  const [sittax, ativa] = await Promise.all([listSittax(), listEmpresasAtivas()]);
  const empresas = ativa.rows;
  const empresasMap = new Map(empresas.map((e) => [e.cnpj, e]));
  const sittaxSet = new Set(sittax.map((s) => s.cnpj));

  // Filtro: SN matriz E com pelo menos uma TAG fiscal elegível
  const snAcessorias = empresas.filter((e) => {
    if (!isSimplesNacional(e.regime)) return false;
    const tagsFiscal = (e.tags ?? []).filter(isTagFiscalElegivel);
    return tagsFiscal.length > 0;
  });

  const equipeMap = new Map<string, EquipeBreakdown>();
  const ensure = (eq: string) => {
    let b = equipeMap.get(eq);
    if (!b) {
      b = { equipe: eq, total_sn: 0, cadastrados: 0, faltam: 0 };
      equipeMap.set(eq, b);
    }
    return b;
  };

  const faltam_lista: EmpresaSlim[] = [];
  for (const e of snAcessorias) {
    const equipes = (e.tags ?? []).filter(isTagFiscalElegivel);
    const isCad = sittaxSet.has(e.cnpj);
    if (!isCad) faltam_lista.push(e);
    for (const eq of equipes) {
      const b = ensure(eq);
      b.total_sn++;
      if (isCad) b.cadastrados++;
      else b.faltam++;
    }
  }

  const fora_regime: SittaxComContexto[] = [];
  const fora_da_base: SittaxRow[] = [];
  for (const s of sittax) {
    const e = empresasMap.get(s.cnpj);
    if (!e) {
      fora_da_base.push(s);
      continue;
    }
    const r = (e.regime ?? "").toLowerCase();
    // Filial de SN ou MEI continuam sendo SN — não é alerta de regime.
    const ehFamiliaSN = r.includes("simples nacional") || r.startsWith("mei");
    if (!ehFamiliaSN) {
      fora_regime.push({ ...s, regime_acessorias: e.regime, tags: e.tags ?? [], grupo: e.grupo ?? null });
    }
  }

  const equipes = Array.from(equipeMap.values()).sort((a, b) => b.faltam - a.faltam || b.total_sn - a.total_sn);
  const cadastrados = snAcessorias.filter((e) => sittaxSet.has(e.cnpj)).length;

  return {
    competencia: ativa.competencia,
    total_acessorias: empresas.length,
    total_sn_acessorias: snAcessorias.length,
    total_sittax: sittax.length,
    cadastrados,
    faltam_cadastrar: snAcessorias.length - cadastrados,
    fora_regime,
    fora_da_base,
    equipes,
    faltam_lista,
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
