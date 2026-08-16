import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export type EntregaRow = {
  cnpj: string;
  razao: string | null;
  obrigacao: "ECD" | "ECF";
  status: string | null;
  competencia: string | null;
  responsavel_prazo: string | null;
  responsavel_entrega: string | null;
  data_entrega: string | null;
  prazo_legal: string | null;
  prazo_tecnico: string | null;
  protocolo: string | null;
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

function detectObrigacao(s: string | null): "ECD" | "ECF" | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u.includes("ECF")) return "ECF";
  if (u.includes("ECD")) return "ECD";
  return null;
}

/** Lê CSV/XLSX do S3D — exporta com ; (CSV) ou XLSX padrão. */
export async function parseEntregasFile(file: File): Promise<EntregaRow[]> {
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  let json: Record<string, unknown>[] = [];
  if (isCsv) {
    const text = new TextDecoder("utf-8").decode(buf);
    const wb = XLSX.read(text, { type: "string", FS: ";" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } else {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }
  if (!json.length) return [];

  const get = (r: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      for (const key of Object.keys(r)) {
        if (key.toLowerCase().trim() === k.toLowerCase()) return r[key];
      }
    }
    return undefined;
  };

  const out: EntregaRow[] = [];
  const seen = new Set<string>();
  for (const r of json) {
    const cnpj = digits(get(r, "CNPJ"));
    if (cnpj.length !== 14) continue;
    const obrigacaoTxt = clean(get(r, "Obrigação / Tarefa", "Obrigacao / Tarefa", "Obrigação", "Obrigacao", "Tarefa"));
    const obrigacao = detectObrigacao(obrigacaoTxt);
    if (!obrigacao) continue;
    const competencia = clean(get(r, "Competência", "Competencia"));
    const key = `${cnpj}|${obrigacao}|${competencia ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      cnpj,
      razao: clean(get(r, "Empresa", "Razão", "Razao", "Razão Social")),
      obrigacao,
      status: clean(get(r, "Status")),
      competencia,
      responsavel_prazo: clean(get(r, "Responsável prazo", "Responsavel prazo")),
      responsavel_entrega: clean(get(r, "Responsável entrega", "Responsavel entrega")),
      data_entrega: clean(get(r, "Data da entrega", "Data entrega")),
      prazo_legal: clean(get(r, "Prazo legal")),
      prazo_tecnico: clean(get(r, "Prazo Técnico", "Prazo Tecnico")),
      protocolo: clean(get(r, "Protocolo")),
    });
  }
  return out;
}

export async function importEntregasFile(file: File) {
  const rows = await parseEntregasFile(file);
  if (!rows.length) throw new Error("Nenhuma entrega ECD/ECF válida encontrada na planilha.");
  const { error: delErr } = await supabase.from("entregas_contabil_cadastros").delete().neq("cnpj", "");
  if (delErr) throw delErr;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, atualizado_em: now }));
    const { error } = await supabase.from("entregas_contabil_cadastros").insert(batch);
    if (error) throw error;
  }
  return rows.length;
}

export async function listEntregas(): Promise<EntregaRow[]> {
  const out: EntregaRow[] = [];
  let from = 0;
  const step = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("entregas_contabil_cadastros")
      .select("cnpj,razao,obrigacao,status,competencia,responsavel_prazo,responsavel_entrega,data_entrega")
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = (data ?? []) as EntregaRow[];
    out.push(...chunk);
    if (chunk.length < step) break;
    from += step;
  }
  return out;
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

/** Regime obrigado a entregar ECD/ECF — matriz (sem Filial, sem CC).
 *  Inclui Lucro Real, Lucro Presumido, Imune e Isenta. */
export function isLrOuLpMatriz(regime: string | null): boolean {
  if (!regime) return false;
  const r = regime.toLowerCase().trim();
  if (r.includes("filial")) return false;
  if (r.includes(" cc")) return false;
  if (r.startsWith("lucro real") || r.startsWith("lucro presumido")) return true;
  if (r.startsWith("imune") || r.startsWith("isenta") || r.startsWith("isento")) return true;
  return false;
}


/** TAG Contábil elegível (exclui Equipe CC, Canopus, Planning RJ, CX, FILIAL). */
export function isTagContabilElegivel(tag: string): boolean {
  const t = tag.toLowerCase().trim();
  if (!t.includes("contábil") && !t.includes("contabil")) return false;
  if (t.includes("equipe cc")) return false;
  if (t.includes("canopus")) return false;
  if (t.includes("planning rj")) return false;
  if (t === "cx" || t === "filial") return false;
  return true;
}

/** Empresa elegível para o painel: tem ao menos uma TAG Contábil elegível. */
function temContabilElegivel(tags: string[] | null | undefined): boolean {
  return (tags ?? []).some(isTagContabilElegivel);
}

/** Status que representa "justificado" — conta como entrega mas vai pro radar. */
function isStatusJustificado(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s.includes("justific");
}

/** Status indica que a obrigação foi efetivamente entregue/transmitida.
 *  Inclui justificadas (Atraso justificado / Pend. justificada). */
function isStatusEntregue(status: string | null, data_entrega: string | null): boolean {
  if (data_entrega && data_entrega.trim()) return true;
  if (!status) return false;
  const s = status.toLowerCase().trim();
  // Status do S3D: "Ent. antecipada", "Ent. PzTéc.", "Entregue", "Transmitida"
  if (s.startsWith("ent.") || s.startsWith("ent ")) return true;
  if (s.startsWith("entreg")) return true;
  if (s.startsWith("transmit")) return true;
  if (s.includes("justific")) return true;
  return false;
}

export type EquipeBreakdown = {
  equipe: string;
  total: number;
  // ECD
  gerou_ecd: number;
  entregou_ecd: number;
  falta_gerar_ecd: number;
  gerada_nao_entregue_ecd: number;
  tudo_entregue_ecd: number;
  // ECF
  gerou_ecf: number;
  entregou_ecf: number;
  falta_gerar_ecf: number;
  gerada_nao_entregue_ecf: number;
  tudo_entregue_ecf: number;
  // Combinado (ambas)
  faltam_gerar: number; // pelo menos uma obrigação sem registro no S3D
  gerada_nao_entregue: number; // todas geradas mas alguma sem entrega
  tudo_entregue: number;
};

export type EmpresaPendente = EmpresaSlim & {
  ecd_gerado: boolean;
  ecd_entregue: boolean;
  ecd_justificada: boolean;
  ecf_gerado: boolean;
  ecf_entregue: boolean;
  ecf_justificada: boolean;
  ecd_status: string | null;
  ecf_status: string | null;
};

export type EntregaForaContexto = EntregaRow & { regime_acessorias: string | null; tags: string[] };

export type ObrigacaoFiltro = "ambas" | "ECD" | "ECF";

export type AnaliseEntregas = {
  competencia: string | null;
  total_acessorias: number;
  total_lr_lp_contabil: number;
  total_entregas_cnpj: number;
  // Combinado
  tudo_entregue: number;
  gerada_nao_entregue: number;
  faltam_gerar: number;
  // ECD
  ecd_gerou: number;
  ecd_entregou: number;
  ecd_falta_gerar: number;
  ecd_gerada_nao_entregue: number;
  // ECF
  ecf_gerou: number;
  ecf_entregou: number;
  ecf_falta_gerar: number;
  ecf_gerada_nao_entregue: number;
  sem_regime_contabil: EmpresaSlim[];
  fora_regime: EntregaForaContexto[];
  fora_da_base: EntregaRow[];
  sem_tag_contabil: EntregaForaContexto[];
  equipes: EquipeBreakdown[];

  faltam_gerar_lista: EmpresaPendente[];
  gerada_nao_entregue_lista: EmpresaPendente[];
  faltam_gerar_ecd_lista: EmpresaPendente[];
  faltam_gerar_ecf_lista: EmpresaPendente[];
  gerada_nao_entregue_ecd_lista: EmpresaPendente[];
  gerada_nao_entregue_ecf_lista: EmpresaPendente[];
  // Radar de justificadas (contam como entrega mas precisam ser monitoradas)
  ecd_justificadas: number;
  ecf_justificadas: number;
  radar_justificadas: EmpresaPendente[];
};

export async function gerarAnaliseEntregas(): Promise<AnaliseEntregas> {
  const [entregas, ativa] = await Promise.all([listEntregas(), listEmpresasAtivas()]);
  const empresas = ativa.rows;
  const empresasMap = new Map(empresas.map((e) => [e.cnpj, e]));

  // CNPJ -> estado por obrigação
  type Bucket = {
    ecd_gerado: boolean; ecd_entregue: boolean; ecd_justificada: boolean; ecd_status: string | null;
    ecf_gerado: boolean; ecf_entregue: boolean; ecf_justificada: boolean; ecf_status: string | null;
  };
  const entregaMap = new Map<string, Bucket>();
  for (const r of entregas) {
    let b = entregaMap.get(r.cnpj);
    if (!b) {
      b = { ecd_gerado: false, ecd_entregue: false, ecd_justificada: false, ecd_status: null,
            ecf_gerado: false, ecf_entregue: false, ecf_justificada: false, ecf_status: null };
      entregaMap.set(r.cnpj, b);
    }
    const entregue = isStatusEntregue(r.status, r.data_entrega);
    const justificada = isStatusJustificado(r.status);
    if (r.obrigacao === "ECD") {
      b.ecd_gerado = true;
      if (entregue) b.ecd_entregue = true;
      if (justificada) { b.ecd_justificada = true; b.ecd_status = r.status; }
      else if (!b.ecd_status) b.ecd_status = r.status;
    } else if (r.obrigacao === "ECF") {
      b.ecf_gerado = true;
      if (entregue) b.ecf_entregue = true;
      if (justificada) { b.ecf_justificada = true; b.ecf_status = r.status; }
      else if (!b.ecf_status) b.ecf_status = r.status;
    }
  }

  const lrLp = empresas.filter((e) => isLrOuLpMatriz(e.regime) && temContabilElegivel(e.tags));
  const semRegime = empresas.filter((e) => !e.regime && temContabilElegivel(e.tags));

  const equipeMap = new Map<string, EquipeBreakdown>();
  const ensure = (eq: string): EquipeBreakdown => {
    let b = equipeMap.get(eq);
    if (!b) {
      b = {
        equipe: eq,
        total: 0,
        gerou_ecd: 0,
        entregou_ecd: 0,
        falta_gerar_ecd: 0,
        gerada_nao_entregue_ecd: 0,
        tudo_entregue_ecd: 0,
        gerou_ecf: 0,
        entregou_ecf: 0,
        falta_gerar_ecf: 0,
        gerada_nao_entregue_ecf: 0,
        tudo_entregue_ecf: 0,
        faltam_gerar: 0,
        gerada_nao_entregue: 0,
        tudo_entregue: 0,
      };
      equipeMap.set(eq, b);
    }
    return b;
  };

  const faltam_gerar_lista: EmpresaPendente[] = [];
  const gerada_nao_entregue_lista: EmpresaPendente[] = [];
  const faltam_gerar_ecd_lista: EmpresaPendente[] = [];
  const faltam_gerar_ecf_lista: EmpresaPendente[] = [];
  const gerada_nao_entregue_ecd_lista: EmpresaPendente[] = [];
  const gerada_nao_entregue_ecf_lista: EmpresaPendente[] = [];
  let tudo_entregue = 0;
  let gerada_nao_entregue = 0;
  let faltam_gerar = 0;
  let ecd_gerou = 0, ecd_entregou = 0, ecd_falta_gerar = 0, ecd_gerada_nao_entregue = 0;
  let ecf_gerou = 0, ecf_entregou = 0, ecf_falta_gerar = 0, ecf_gerada_nao_entregue = 0;

  const radar_justificadas: EmpresaPendente[] = [];
  let ecd_justificadas = 0;
  let ecf_justificadas = 0;

  for (const e of lrLp) {
    const b = entregaMap.get(e.cnpj);
    const ecd_gerado = !!b?.ecd_gerado;
    const ecf_gerado = !!b?.ecf_gerado;
    const ecd_entregue = !!b?.ecd_entregue;
    const ecf_entregue = !!b?.ecf_entregue;
    const ecd_justificada = !!b?.ecd_justificada;
    const ecf_justificada = !!b?.ecf_justificada;
    const empresaPend: EmpresaPendente = {
      ...e, ecd_gerado, ecd_entregue, ecd_justificada,
      ecf_gerado, ecf_entregue, ecf_justificada,
      ecd_status: b?.ecd_status ?? null, ecf_status: b?.ecf_status ?? null,
    };
    if (ecd_justificada) ecd_justificadas++;
    if (ecf_justificada) ecf_justificadas++;
    if (ecd_justificada || ecf_justificada) radar_justificadas.push(empresaPend);

    // Classificação por obrigação
    type Cat = "falta_gerar" | "gerada_nao_entregue" | "tudo_entregue";
    const catEcd: Cat = !ecd_gerado ? "falta_gerar" : !ecd_entregue ? "gerada_nao_entregue" : "tudo_entregue";
    const catEcf: Cat = !ecf_gerado ? "falta_gerar" : !ecf_entregue ? "gerada_nao_entregue" : "tudo_entregue";

    if (ecd_gerado) ecd_gerou++;
    if (ecd_entregue) ecd_entregou++;
    if (catEcd === "falta_gerar") { ecd_falta_gerar++; faltam_gerar_ecd_lista.push(empresaPend); }
    else if (catEcd === "gerada_nao_entregue") { ecd_gerada_nao_entregue++; gerada_nao_entregue_ecd_lista.push(empresaPend); }

    if (ecf_gerado) ecf_gerou++;
    if (ecf_entregue) ecf_entregou++;
    if (catEcf === "falta_gerar") { ecf_falta_gerar++; faltam_gerar_ecf_lista.push(empresaPend); }
    else if (catEcf === "gerada_nao_entregue") { ecf_gerada_nao_entregue++; gerada_nao_entregue_ecf_lista.push(empresaPend); }

    // Combinado
    const todasGeradas = ecd_gerado && ecf_gerado;
    const todasEntregues = ecd_entregue && ecf_entregue;
    let categoria: "faltam_gerar" | "gerada_nao_entregue" | "tudo_entregue";
    if (!todasGeradas) { categoria = "faltam_gerar"; faltam_gerar++; faltam_gerar_lista.push(empresaPend); }
    else if (!todasEntregues) { categoria = "gerada_nao_entregue"; gerada_nao_entregue++; gerada_nao_entregue_lista.push(empresaPend); }
    else { categoria = "tudo_entregue"; tudo_entregue++; }

    for (const eq of (e.tags ?? []).filter(isTagContabilElegivel)) {
      const k = ensure(eq);
      k.total++;
      if (ecd_gerado) k.gerou_ecd++;
      if (ecd_entregue) k.entregou_ecd++;
      if (catEcd === "falta_gerar") k.falta_gerar_ecd++;
      else if (catEcd === "gerada_nao_entregue") k.gerada_nao_entregue_ecd++;
      else k.tudo_entregue_ecd++;

      if (ecf_gerado) k.gerou_ecf++;
      if (ecf_entregue) k.entregou_ecf++;
      if (catEcf === "falta_gerar") k.falta_gerar_ecf++;
      else if (catEcf === "gerada_nao_entregue") k.gerada_nao_entregue_ecf++;
      else k.tudo_entregue_ecf++;

      if (categoria === "faltam_gerar") k.faltam_gerar++;
      else if (categoria === "gerada_nao_entregue") k.gerada_nao_entregue++;
      else k.tudo_entregue++;
    }
  }

  const fora_regime: EntregaForaContexto[] = [];
  const fora_da_base: EntregaRow[] = [];
  const sem_tag_contabil: EntregaForaContexto[] = [];
  for (const r of entregas) {
    const e = empresasMap.get(r.cnpj);
    if (!e) {
      fora_da_base.push(r);
      continue;
    }
    if (!temContabilElegivel(e.tags)) {
      sem_tag_contabil.push({ ...r, regime_acessorias: e.regime, tags: e.tags ?? [] });
      continue;
    }
    if (!isLrOuLpMatriz(e.regime)) {
      fora_regime.push({ ...r, regime_acessorias: e.regime, tags: e.tags ?? [] });
    }
  }


  const equipes = Array.from(equipeMap.values()).sort(
    (a, b) => b.faltam_gerar - a.faltam_gerar || b.gerada_nao_entregue - a.gerada_nao_entregue || b.total - a.total,
  );

  return {
    competencia: ativa.competencia,
    total_acessorias: empresas.length,
    total_lr_lp_contabil: lrLp.length,
    total_entregas_cnpj: entregaMap.size,
    tudo_entregue,
    gerada_nao_entregue,
    faltam_gerar,
    ecd_gerou, ecd_entregou, ecd_falta_gerar, ecd_gerada_nao_entregue,
    ecf_gerou, ecf_entregou, ecf_falta_gerar, ecf_gerada_nao_entregue,
    sem_regime_contabil: semRegime,
    fora_regime,
    fora_da_base,
    sem_tag_contabil,

    equipes,
    faltam_gerar_lista,
    gerada_nao_entregue_lista,
    faltam_gerar_ecd_lista,
    faltam_gerar_ecf_lista,
    gerada_nao_entregue_ecd_lista,
    gerada_nao_entregue_ecf_lista,
    ecd_justificadas,
    ecf_justificadas,
    radar_justificadas,
  };
}

function sanitizeSheetName(name: string, used: Set<string>) {
  const base = (name || "Planilha")
    .replace(/[:\\/?*\[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Planilha";

  let safe = base;
  let i = 2;
  while (used.has(safe.toLowerCase())) {
    const suffix = ` ${i++}`;
    safe = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(safe.toLowerCase());
  return safe;
}

export function exportToXlsx(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows ?? []);
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(s.name, usedSheetNames));
  }
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const navAny = navigator as any;
  if (navAny?.msSaveOrOpenBlob) {
    navAny.msSaveBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.parentNode?.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
    return;
  } catch {
    // fallback abaixo
  }

  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function formatCnpj(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
