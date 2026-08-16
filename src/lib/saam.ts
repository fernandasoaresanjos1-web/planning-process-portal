import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export type SaamRow = {
  cnpj: string;
  razao: string | null;
  apelido: string | null;
  uf: string | null;
  cidade: string | null;
  base?: string;
};

export type EmpresaSlim = {
  cnpj: string;
  razao: string | null;
  regime: string | null;
  grupo: string | null;
  tags: string[];
};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** Lê planilha SAAM. Espera cabeçalho com colunas: Código, CPF, CNPJ, IE, Razão, Nome Fantasia, ... */
export async function parseSaamFile(file: File): Promise<SaamRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const seen = new Set<string>();
  const rows: SaamRow[] = [];
  for (const r of json) {
    // localiza colunas por nome case-insensitive
    const get = (...keys: string[]) => {
      for (const k of keys) {
        for (const key of Object.keys(r)) {
          if (key.toLowerCase().trim() === k.toLowerCase()) return r[key];
        }
      }
      return undefined;
    };
    const cnpj = digits(get("CNPJ"));
    if (cnpj.length !== 14 || seen.has(cnpj)) continue;
    seen.add(cnpj);
    rows.push({
      cnpj,
      razao: clean(get("Razão", "Razao", "Razão Social")),
      apelido: clean(get("Nome Fantasia", "Apelido")),
      uf: clean(get("UF", "Estado")),
      cidade: clean(get("Cidade", "Município")),
    });
  }
  return rows;
}

export async function importSaamFile(file: File, base: string) {
  const rows = await parseSaamFile(file);
  if (!rows.length) throw new Error("Nenhum CNPJ válido encontrado na planilha.");
  const { error: delErr } = await supabase.from("saam_cadastros").delete().eq("base", base);
  if (delErr) throw delErr;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, base, atualizado_em: now }));
    const { error } = await supabase.from("saam_cadastros").insert(batch);
    if (error) throw error;
  }
  return rows.length;
}

export async function listSaam(): Promise<SaamRow[]> {
  const out: SaamRow[] = [];
  let from = 0;
  const step = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("saam_cadastros")
      .select("cnpj,razao,apelido,uf,cidade,base").order("cnpj")
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = (data ?? []) as SaamRow[];
    out.push(...chunk);
    if (chunk.length < step) break;
    from += step;
  }
  return out;
}

export type SaamBase = {
  base: string;
  rotulo: string;
  quantidade_contratada: number;
};

export async function listSaamBases(): Promise<SaamBase[]> {
  const { data, error } = await supabase
    .from("saam_bases")
    .select("base,rotulo,quantidade_contratada")
    .order("base");
  if (error) throw error;
  return (data ?? []) as SaamBase[];
}

export async function salvarSaamBase(b: SaamBase) {
  const { error } = await supabase
    .from("saam_bases")
    .upsert({ ...b, atualizado_em: new Date().toISOString() }, { onConflict: "base" });
  if (error) throw error;
}



async function listEmpresasAtivas(): Promise<{ competencia: string | null; rows: EmpresaSlim[] }> {
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

/** Lucro Real ou Lucro Presumido — matriz e filiais (exclui CC). */
export function isLucroRealOuPresumidoMatriz(regime: string | null): boolean {
  if (!regime) return false;
  const r = regime.toLowerCase().trim();
  if (r.includes(" cc")) return false; // Lucro X CC
  return r.startsWith("lucro real") || r.startsWith("lucro presumido");
}

/** TAG de departamento contábil ou DP/folha (não elegível para SAAM quando isolada). */
export function isTagContabilOuDP(tag: string): boolean {
  const t = tag.toLowerCase().trim();
  if (t.includes("fiscal")) return false;
  return (
    t.includes("cont") ||
    t.includes("folha") ||
    t.includes("pessoal") ||
    t.includes("dp") ||
    t.includes("rh")
  );
}

/** Elegível SAAM: LR/LP e não tem apenas TAGs contábil/DP. */
export function isElegivelSaam(e: EmpresaSlim): boolean {
  if (!isLucroRealOuPresumidoMatriz(e.regime)) return false;
  const tags = e.tags ?? [];
  if (!tags.length) return true;
  return tags.some((t) => !isTagContabilOuDP(t));
}

export type EquipeBreakdown = {
  equipe: string;
  total: number;
  cadastrados: number;
  faltam: number;
};


export type SaamComContexto = SaamRow & { regime_acessorias: string | null; tags: string[]; grupo: string | null };

export type BaseCapacidade = {
  base: string;
  rotulo: string;
  quantidade_contratada: number;
  cadastrados: number;
  a_excluir: number;
  validos: number;
  sobra_atual: number;
  ocupacao_pct: number;
};

export type CapacidadeSaam = {
  bases: BaseCapacidade[];
  contratado_total: number;
  cadastrados_total: number;
  a_excluir_total: number;
  validos_total: number;
  a_incluir_total: number;
  sobra_atual_total: number;
  sobra_potencial_total: number;
};

export type AnaliseSaam = {
  competencia: string | null;
  total_acessorias: number;
  total_lr_lp_acessorias: number;
  total_saam: number;
  cadastrados: number;
  faltam_cadastrar: number;
  fora_regime: SaamComContexto[];
  fora_da_base: SaamRow[];
  duplicadas: (SaamRow & { bases: string[] })[];
  equipes: EquipeBreakdown[];
  faltam_lista: EmpresaSlim[];
  capacidade: CapacidadeSaam;
};

export async function gerarAnaliseSaam(): Promise<AnaliseSaam> {
  const [saam, ativa, basesCfg] = await Promise.all([listSaam(), listEmpresasAtivas(), listSaamBases()]);
  const empresas = ativa.rows;
  const empresasMap = new Map(empresas.map((e) => [e.cnpj, e]));
  const saamSet = new Set(saam.map((s) => s.cnpj));

  const lrLp = empresas.filter(isElegivelSaam);

  const equipeMap = new Map<string, EquipeBreakdown>();
  const ensure = (eq: string) => {
    let b = equipeMap.get(eq);
    if (!b) {
      b = { equipe: eq, total: 0, cadastrados: 0, faltam: 0 };
      equipeMap.set(eq, b);
    }
    return b;
  };

  const faltam_lista: EmpresaSlim[] = [];
  for (const e of lrLp) {
    const tags = (e.tags ?? []).filter((t) => !isTagContabilOuDP(t));
    const equipes = tags.length ? tags : ["Sem TAG"];
    const isCad = saamSet.has(e.cnpj);
    if (!isCad) faltam_lista.push(e);
    for (const eq of equipes) {
      const b = ensure(eq);
      b.total++;
      if (isCad) b.cadastrados++;
      else b.faltam++;
    }
  }

  // Empresas presentes em mais de uma base SAAM simultaneamente
  const porCnpj = new Map<string, { row: SaamRow; bases: Set<string> }>();
  for (const s of saam) {
    const cur = porCnpj.get(s.cnpj) ?? { row: s, bases: new Set<string>() };
    cur.bases.add(s.base ?? "260");
    porCnpj.set(s.cnpj, cur);
  }
  const duplicadas = Array.from(porCnpj.values())
    .filter((v) => v.bases.size > 1)
    .map((v) => ({ ...v.row, bases: Array.from(v.bases).sort() }));


  const fora_regime: SaamComContexto[] = [];
  const fora_da_base: SaamRow[] = [];
  const excluirPorBase = new Map<string, number>();
  const cadPorBase = new Map<string, number>();
  for (const s of saam) {
    const b = s.base ?? "260";
    cadPorBase.set(b, (cadPorBase.get(b) ?? 0) + 1);
    const e = empresasMap.get(s.cnpj);
    const marcaExcluir = () => excluirPorBase.set(b, (excluirPorBase.get(b) ?? 0) + 1);
    if (!e) {
      fora_da_base.push(s);
      marcaExcluir();
      continue;
    }
    const r = (e.regime ?? "").toLowerCase();
    const familiaLR = r.startsWith("lucro real") || r.startsWith("lucro presumido");
    if (!familiaLR) {
      fora_regime.push({ ...s, regime_acessorias: e.regime, tags: e.tags ?? [], grupo: e.grupo ?? null });
      marcaExcluir();
    }
  }

  const equipes = Array.from(equipeMap.values()).sort((a, b) => b.faltam - a.faltam || b.total - a.total);
  const cadastrados = lrLp.filter((e) => saamSet.has(e.cnpj)).length;
  const a_incluir_total = lrLp.length - cadastrados;

  const basesConhecidas = new Map(basesCfg.map((b) => [b.base, b]));
  for (const b of cadPorBase.keys()) {
    if (!basesConhecidas.has(b)) basesConhecidas.set(b, { base: b, rotulo: b, quantidade_contratada: 0 });
  }

  const bases: BaseCapacidade[] = Array.from(basesConhecidas.values())
    .sort((a, b) => a.base.localeCompare(b.base))
    .map((cfg) => {
      const cad = cadPorBase.get(cfg.base) ?? 0;
      const exc = excluirPorBase.get(cfg.base) ?? 0;
      const validos = cad - exc;
      return {
        base: cfg.base,
        rotulo: cfg.rotulo,
        quantidade_contratada: cfg.quantidade_contratada,
        cadastrados: cad,
        a_excluir: exc,
        validos,
        sobra_atual: cfg.quantidade_contratada - validos,
        ocupacao_pct: cfg.quantidade_contratada ? Math.round((validos / cfg.quantidade_contratada) * 100) : 0,
      };
    });

  const contratado_total = bases.reduce((s, b) => s + b.quantidade_contratada, 0);
  const cadastrados_total = bases.reduce((s, b) => s + b.cadastrados, 0);
  const a_excluir_total = bases.reduce((s, b) => s + b.a_excluir, 0);
  const validos_total = cadastrados_total - a_excluir_total;

  return {
    competencia: ativa.competencia,
    total_acessorias: empresas.length,
    total_lr_lp_acessorias: lrLp.length,
    total_saam: saam.length,
    cadastrados,
    faltam_cadastrar: a_incluir_total,
    fora_regime,
    fora_da_base,
    duplicadas,
    equipes,
    faltam_lista,
    capacidade: {
      bases,
      contratado_total,
      cadastrados_total,
      a_excluir_total,
      validos_total,
      a_incluir_total,
      sobra_atual_total: contratado_total - validos_total,
      sobra_potencial_total: contratado_total - validos_total - a_incluir_total,
    },
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
