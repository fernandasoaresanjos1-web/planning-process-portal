import { supabase } from "@/integrations/supabase/client";
import { carregarTagsEmpresas } from "@/lib/tags-empresas";


export interface BIEmpresa {
  cnpj: string;
  razao: string;
  regime: string;
  grupo: string;
  tags: string;
  pessoal: string;
  contabil: string;
  fiscal: string;
  is_new?: boolean;
}
export interface BIConfigFolha {
  sistema: string;
  adiant: boolean;
  dia_adiant: string;
  fechamento: string;
  curva: string;
}
export interface BIConfigContabil {
  integrado: string;
  software: string;
  apuracao: string;
  fech_tipo: string;
  tipo_emp: string;
  tipo_holding: string;
  curva: string;
}
export interface BIConfigFiscal {
  curva: string;
}
export interface BIVidas {
  trabalhando: number;
  ferias: number;
  afastados: number;
  total_ativos: number;
}
export type BITab = "geral" | "folha" | "contabil" | "fiscal" | "afastados" | "auditoria";
export type BICurva = "" | "A" | "B" | "C";

export const BI_SISTEMAS = ["Domínio","Senior","Alterdata","Questor","Fortes","Nasajon","RM","Folhamatic","Totvs RH","Outro","Sem movimento"];
export const BI_SISTEMAS_CLI = ["Excel / Google Sheets","SAP","Oracle","TOTVS Protheus","Senior","Linx","Bling","Conta Azul","Omie","Netsuite","Outro"];
export const BI_FECH_OPTS = ["Último dia útil do mês","5º dia útil do mês seguinte"];
export const BI_APUR_OPTS = ["Mensal","Trimestral"];
export const BI_FECH_TIPO = ["Mensal","Trimestral","Trimestral D60","Trimestral D90","Semestral","Semestral D90","Anual","Anual D90","Sem movimento"];

export type BIOpcaoCategoria = "sistema_folha" | "sistema_cli" | "fechamento_folha" | "apuracao" | "fech_tipo";

export async function biLoadOpcoes(): Promise<Record<BIOpcaoCategoria, string[]>> {
  const { data, error } = await supabase
    .from("bi_opcoes" as never)
    .select("categoria,valor,ordem")
    .order("categoria")
    .order("ordem");
  if (error) throw error;
  const out: Record<string, string[]> = {
    sistema_folha: [], sistema_cli: [], fechamento_folha: [], apuracao: [], fech_tipo: [],
  };
  ((data as unknown as { categoria: string; valor: string }[]) ?? []).forEach((r) => {
    if (!out[r.categoria]) out[r.categoria] = [];
    out[r.categoria].push(r.valor);
  });
  return out as Record<BIOpcaoCategoria, string[]>;
}

export async function biAddOpcao(categoria: BIOpcaoCategoria, valor: string) {
  const v = valor.trim();
  if (!v) return;
  const { error } = await supabase
    .from("bi_opcoes" as never)
    .insert({ categoria, valor: v, ordem: 999 } as never);
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}

export async function biDeleteOpcao(categoria: BIOpcaoCategoria, valor: string) {
  const { error } = await supabase
    .from("bi_opcoes" as never)
    .delete()
    .eq("categoria", categoria)
    .eq("valor", valor);
  if (error) throw error;
}

const stripAccents = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function biGetTag(tags: string, pattern: string): string {
  if (!tags) return "";
  const re = new RegExp(stripAccents(pattern), "i");
  for (const p of tags.split(",")) {
    const t = p.trim();
    if (re.test(stripAccents(t))) return t;
  }
  return "";
}
export function biHasTag(tags: string, pattern: string): boolean {
  return !!biGetTag(tags, pattern);
}
export function biIsLucroReal(regime: string): boolean {
  return /lucro real/i.test(regime || "");
}
export function biCurvaStyle(c: BICurva): string {
  if (c === "A") return "bg-green-100 text-green-800 border-green-300";
  if (c === "B") return "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (c === "C") return "bg-red-100 text-red-800 border-red-300";
  return "bg-gray-100 text-gray-500 border-gray-200";
}
export function biRegimeColor(regime: string): string {
  const r = (regime || "").toLowerCase();
  if (r.includes("lucro real")) return "bg-orange-100 text-orange-800 border-orange-200";
  if (r.includes("lucro pres")) return "bg-purple-100 text-purple-700 border-purple-200";
  if (r.includes("simples")) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

async function fetchAll<T = unknown>(table: string): Promise<T[]> {
  const out: T[] = [];
  const step = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table as never)
      .select("*")
      .order("cnpj", { ascending: true })
      .range(from, from + step - 1);
    if (error) throw error;
    const rows = (data as unknown as T[]) ?? [];
    out.push(...rows);
    if (rows.length < step) break;
    from += step;
  }
  return out;
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && ch === sep) { row.push(cell.trim()); cell = ""; continue; }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = []; cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

function cleanCsvCell(value: string | undefined): string {
  return (value || "").replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim();
}


export async function biLoadAll() {
  const [empRows, folhaRows, contRows, fiscRows, vidasRows, tagsMap] = await Promise.all([
    fetchAll<BIEmpresa>("bi_empresas"),
    fetchAll<BIConfigFolha & { cnpj: string }>("bi_config_folha"),
    fetchAll<BIConfigContabil & { cnpj: string }>("bi_config_contabil"),
    fetchAll<BIConfigFiscal & { cnpj: string }>("bi_config_fiscal"),
    fetchAll<BIVidas & { cnpj: string }>("bi_vidas_empregados"),
    carregarTagsEmpresas().catch(() => ({} as Record<string, string[]>)),
  ]);

  const empresas: BIEmpresa[] = empRows.map((r) => ({
    cnpj: r.cnpj, razao: r.razao ?? "", regime: r.regime ?? "", grupo: r.grupo ?? "",
    tags: r.tags ?? "", pessoal: r.pessoal ?? "", contabil: r.contabil ?? "", fiscal: r.fiscal ?? "",
    is_new: !!(r as { is_new?: boolean }).is_new,
  }));
  const folhaCfg: Record<string, BIConfigFolha> = {};
  folhaRows.forEach((r) => {
    folhaCfg[r.cnpj] = { sistema: r.sistema || "", adiant: !!r.adiant, dia_adiant: r.dia_adiant || "", fechamento: r.fechamento || "", curva: r.curva || "" };
  });
  const contCfg: Record<string, BIConfigContabil> = {};
  contRows.forEach((r) => {
    contCfg[r.cnpj] = { integrado: r.integrado || "", software: r.software || "", apuracao: r.apuracao || "", fech_tipo: r.fech_tipo || "", tipo_emp: r.tipo_emp || "", tipo_holding: r.tipo_holding || "", curva: r.curva || "" };
  });
  const fiscCfg: Record<string, BIConfigFiscal> = {};
  fiscRows.forEach((r) => {
    fiscCfg[r.cnpj] = { curva: r.curva || "" };
  });
  const vidasMap: Record<string, BIVidas> = {};
  vidasRows.forEach((r) => {
    vidasMap[r.cnpj] = { trabalhando: r.trabalhando || 0, ferias: r.ferias || 0, afastados: r.afastados || 0, total_ativos: r.total_ativos || 0 };
  });
  return { empresas, folhaCfg, contCfg, fiscCfg, vidas: vidasMap, tagsMap };
}


export async function biUpsertFolha(cnpj: string, cfg: BIConfigFolha) {
  await supabase.from("bi_config_folha" as never).upsert({ cnpj, ...cfg, updated_at: new Date().toISOString() } as never);
}
export async function biUpsertCont(cnpj: string, cfg: BIConfigContabil) {
  await supabase.from("bi_config_contabil" as never).upsert({ cnpj, ...cfg, updated_at: new Date().toISOString() } as never);
}
export async function biUpsertFisc(cnpj: string, cfg: BIConfigFiscal) {
  await supabase.from("bi_config_fiscal" as never).upsert({ cnpj, ...cfg, updated_at: new Date().toISOString() } as never);
}

export async function biDeleteConfig(table: "bi_config_folha" | "bi_config_contabil" | "bi_config_fiscal", cnpj: string) {
  const { error } = await supabase.from(table as never).delete().eq("cnpj", cnpj);
  if (error) throw error;
}

export async function biImportS3D(file: File, onProgress?: (m: string) => void) {
  onProgress?.("Lendo CSV...");
  const text = await file.text();
  const parsed = parseCsv(text);
  const hdr = (parsed[0] || []).map(cleanCsvCell);
  const idx: Record<string, number> = {};
  hdr.forEach((h, i) => { idx[h] = i; });
  const g = (cols: string[], n: string) => cleanCsvCell(cols[idx[n]]);
  const byCnpj = new Map<string, BIEmpresa>();
  let validRows = 0;
  for (let i = 1; i < parsed.length; i++) {
    const cols = parsed[i];
    const cnpj = g(cols, "CNPJ"); if (!cnpj || cnpj.length < 8) continue;
    validRows++;
    byCnpj.set(cnpj, {
      cnpj,
      razao: g(cols, "Razão social"),
      regime: g(cols, "Regime"),
      grupo: g(cols, "Grupo de Empresas"),
      tags: g(cols, "Tags"),
      pessoal: g(cols, "Pessoal"),
      contabil: g(cols, "Contábil"),
      fiscal: g(cols, "Fiscal"),
    });
  }
  const rows = Array.from(byCnpj.values());
  const cnpjSet = new Set(rows.map((r) => r.cnpj));
  const cnpjList = Array.from(cnpjSet);

  // Snapshot existing CNPJs to detect novos vs já existentes
  onProgress?.("Consultando base atual...");
  const existingEmp = await fetchAll<{ cnpj: string }>("bi_empresas");
  const existingSet = new Set(existingEmp.map((r) => r.cnpj));

  // Reset all is_new flags (batched update)
  await supabase.from("bi_empresas" as never).update({ is_new: false } as never).eq("is_new", true);

  const rowsWithFlag = rows.map((r) => ({ ...r, is_new: !existingSet.has(r.cnpj) }));
  for (let i = 0; i < rowsWithFlag.length; i += 500) {
    onProgress?.(`Salvando empresas ${i}/${rowsWithFlag.length}...`);
    const { error } = await supabase
      .from("bi_empresas" as never)
      .upsert(rowsWithFlag.slice(i, i + 500) as never, { onConflict: "cnpj" });
    if (error) throw error;
  }

  // Delete bi_empresas rows for CNPJs no longer present (configs are KEPT and shown as "REMOVIDA")
  const removedEmp = existingEmp.map((r) => r.cnpj).filter((c) => !cnpjSet.has(c));
  for (let i = 0; i < removedEmp.length; i += 200) {
    const { error } = await supabase
      .from("bi_empresas" as never)
      .delete()
      .in("cnpj", removedEmp.slice(i, i + 200));
    if (error) throw error;
  }

  onProgress?.("Sincronizando configurações...");
  const [existFolha, existCont, existFisc] = await Promise.all([
    fetchAll<{ cnpj: string }>("bi_config_folha"),
    fetchAll<{ cnpj: string }>("bi_config_contabil"),
    fetchAll<{ cnpj: string }>("bi_config_fiscal"),
  ]);

  // Insert defaults for new CNPJs (configs for removed CNPJs are kept for user review)
  const haveFolha = new Set(existFolha.map((r) => r.cnpj));
  const haveCont = new Set(existCont.map((r) => r.cnpj));
  const haveFisc = new Set(existFisc.map((r) => r.cnpj));
  const newFolha = cnpjList.filter((c) => !haveFolha.has(c)).map((cnpj) => ({ cnpj, sistema: "", adiant: false, dia_adiant: "", fechamento: "", curva: "" }));
  const newCont = cnpjList.filter((c) => !haveCont.has(c)).map((cnpj) => ({ cnpj, integrado: "", software: "", apuracao: "", fech_tipo: "", tipo_emp: "", tipo_holding: "", curva: "" }));
  const newFisc = cnpjList.filter((c) => !haveFisc.has(c)).map((cnpj) => ({ cnpj, curva: "" }));
  const insBatch = async (table: string, arr: unknown[]) => {
    for (let i = 0; i < arr.length; i += 500) {
      const { error } = await supabase
        .from(table as never)
        .upsert(arr.slice(i, i + 500) as never, { onConflict: "cnpj" });
      if (error) throw error;
    }
  };
  if (newFolha.length) await insBatch("bi_config_folha", newFolha);
  if (newCont.length) await insBatch("bi_config_contabil", newCont);
  if (newFisc.length) await insBatch("bi_config_fiscal", newFisc);

  const novos = rowsWithFlag.filter((r) => r.is_new).length;
  const dupInfo = validRows > rows.length ? ` (${validRows - rows.length} duplicadas no CSV)` : "";
  onProgress?.(`OK: ${rows.length} empresas${dupInfo} | ${novos} novas | ${removedEmp.length} removidas (configs mantidas para revisão)`);
  return rows.length;
}


const SA_SET = new Set([1,2,3,4,5,6,7,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]);

async function biReadCadastrais(file: File) {
  const XLSX = await import("xlsx");
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(ab), { type: "array", raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  let hIdx = 4;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] as unknown[] | undefined;
    if (row?.some((c) => c && (String(c).includes("CNPJ") || String(c).includes("Cód")))) { hIdx = i; break; }
  }
  const cad: Record<number, string> = {};
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[] | undefined;
    if (!row?.[0] || !row?.[2]) continue;
    const cod = Math.round(Number(row[0]));
    const cnpj = String(row[2]).trim();
    if (cod > 0 && cnpj.includes("/")) cad[cod] = cnpj;
  }
  return cad;
}

async function biSaveVidas(cnpjVidas: Record<string, { t: number; f: number; a: number }>) {
  const rows = Object.entries(cnpjVidas).map(([cnpj, v]) => ({
    cnpj, trabalhando: v.t, ferias: v.f, afastados: v.a, total_ativos: v.t + v.f + v.a,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from("bi_vidas_empregados" as never).upsert(rows.slice(i, i + 500) as never);
  }
  return rows.length;
}

const WORKER_CODE = `
self.onmessage=function(e){
  var buf=e.data.buf,dv=new DataView(buf),u8=new Uint8Array(buf),len=buf.byteLength;
  var SA=new Set([1,2,3,4,5,6,7,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]);
  var colMap={},p=0;
  while(p+4<=len){var rt=dv.getUint16(p,true),rl=dv.getUint16(p+2,true),dp=p+4;
    if(rt===0x0004&&rl>=8){var rn=dv.getUint16(dp,true),col=dv.getUint16(dp+2,true),tl=u8[dp+7],v='';
      for(var j=0;j<tl;j++)v+=String.fromCharCode(u8[dp+8+j]);
      if(rn===0)colMap[v.trim()]=col; else if(Object.keys(colMap).length>0)break;}
    p+=4+rl;}
  var cC=colMap['codi_emp']!==undefined?colMap['codi_emp']:0;
  var cS=colMap['situacao']!==undefined?colMap['situacao']:10;
  self.postMessage({type:'cols',cC:cC,cS:cS});
  var cs={},cur={c:0,s:0};p=0;var lp=0;
  function sv(){if(!cur.c)return;if(!cs[cur.c])cs[cur.c]={t:0,f:0,a:0};
    var s=cur.s;if(s===1)cs[cur.c].t++;else if(s===9)cs[cur.c].f++;
    else if(s!==8&&s!==0&&SA.has(s))cs[cur.c].a++;}
  while(p+4<=len){var rt=dv.getUint16(p,true),rl=dv.getUint16(p+2,true),dp=p+4;
    if(rt===0x0003&&rl>=15){var rn=dv.getUint16(dp,true),col=dv.getUint16(dp+2,true),val=Math.round(dv.getFloat64(dp+7,true));
      if(rn>0){if(col===cC){sv();cur={c:val,s:0};}else if(col===cS&&cur.c)cur.s=val;}}
    p+=4+rl;var pct=Math.round(p/len*100);if(pct!==lp){self.postMessage({type:'p',pct:pct});lp=pct;}}
  sv();self.postMessage({type:'done',cs:cs});};`;

export async function biImportEmpregados(
  empFile: File,
  cadFile: File | null,
  onProgress?: (m: string) => void,
): Promise<number> {
  const isCsv = empFile.name.toLowerCase().endsWith(".csv");
  let codV: Record<number, { t: number; f: number; a: number }> = {};

  if (isCsv) {
    onProgress?.("Lendo CSV de empregados...");
    const text = await empFile.text();
    const lines = text.split(/\r?\n/);
    const hdr = lines[0].split(",").map((h) => h.trim());
    const iCod = hdr.indexOf("codi_emp"), iTrb = hdr.indexOf("trabalhando");
    const iFer = hdr.indexOf("ferias"), iAfs = hdr.indexOf("afastados");
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(","); if (!c[iCod]) continue;
      codV[Number(c[iCod])] = { t: Number(c[iTrb] || 0), f: Number(c[iFer] || 0), a: Number(c[iAfs] || 0) };
    }
  } else {
    onProgress?.("Iniciando Web Worker BIFF2...");
    const ab = await empFile.arrayBuffer();
    codV = await new Promise((resolve) => {
      const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const wk = new Worker(url);
      wk.onmessage = (ev: MessageEvent) => {
        const msg = ev.data;
        if (msg.type === "p") onProgress?.(`Lendo empregados... ${msg.pct}%`);
        else if (msg.type === "cols") onProgress?.(`Cols: codi_emp=${msg.cC} situacao=${msg.cS}`);
        else if (msg.type === "done") {
          wk.terminate(); URL.revokeObjectURL(url);
          const out: Record<number, { t: number; f: number; a: number }> = {};
          Object.entries(msg.cs).forEach(([k, v]) => {
            const val = v as { t: number; f: number; a: number };
            out[Number(k)] = { t: val.t, f: val.f, a: val.a };
          });
          resolve(out);
        }
      };
      wk.postMessage({ buf: ab }, [ab]);
    });
  }

  let cad: Record<number, string> = {};
  if (cadFile) {
    onProgress?.("Lendo Dados Cadastrais...");
    cad = await biReadCadastrais(cadFile);
  }
  const cnpjVidas: Record<string, { t: number; f: number; a: number }> = {};
  Object.entries(codV).forEach(([cod, v]) => {
    const cnpj = cad[Number(cod)]; if (!cnpj) return;
    if (!cnpjVidas[cnpj]) cnpjVidas[cnpj] = { t: 0, f: 0, a: 0 };
    cnpjVidas[cnpj].t += v.t; cnpjVidas[cnpj].f += v.f; cnpjVidas[cnpj].a += v.a;
  });
  onProgress?.("Salvando vidas no banco...");
  return await biSaveVidas(cnpjVidas);
}

// keep unused constant used elsewhere silent
void SA_SET;

// ─── Sincronização com a base ativa (empresas_base_mensal) ─────────────
function fmtCnpj(digits: string): string {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

const SYNC_KEY = "bi_empresas.sync.importacao_id";

/**
 * Espelha a base ativa (última importação de empresas) em bi_empresas:
 * inclui as novas, remove as que saíram e atualiza razão/regime/grupo/tags/equipes.
 * As configurações (folha/contábil/fiscal) das removidas são mantidas para revisão.
 */
export async function biSyncFromBaseAtiva(onProgress?: (m: string) => void) {
  const { listEmpresasAtivas, getEmpresaBaseResumo } = await import("@/lib/empresas-mensal");
  onProgress?.("Lendo base ativa...");
  const resumo = await getEmpresaBaseResumo();
  if (!resumo.importacao) return { total: 0, novos: 0, removidos: 0, importacaoId: null as string | null };
  const ativas = await listEmpresasAtivas();
  if (!ativas.length) return { total: 0, novos: 0, removidos: 0, importacaoId: resumo.importacao.id };

  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const rows: BIEmpresa[] = ativas.map((a) => {
    const d = (a.dados || {}) as Record<string, unknown>;
    return {
      cnpj: fmtCnpj(a.cnpj),
      razao: a.razao || str(d["Razão social"]),
      regime: a.regime || str(d["Regime"]),
      grupo: a.grupo || str(d["Grupo de Empresas"]),
      tags: (a.tags && a.tags.length ? a.tags.join(", ") : str(d["Tags"])),
      pessoal: str(d["Pessoal"]),
      contabil: str(d["Contábil"]),
      fiscal: str(d["Fiscal"]),
    };
  });
  const cnpjSet = new Set(rows.map((r) => r.cnpj));
  const cnpjList = [...cnpjSet];

  const existing = await fetchAll<{ cnpj: string }>("bi_empresas");
  const existingSet = new Set(existing.map((r) => r.cnpj));

  await supabase.from("bi_empresas" as never).update({ is_new: false } as never).eq("is_new", true);

  const rowsWithFlag = rows.map((r) => ({ ...r, is_new: !existingSet.has(r.cnpj) }));
  for (let i = 0; i < rowsWithFlag.length; i += 500) {
    onProgress?.(`Atualizando empresas ${i}/${rowsWithFlag.length}...`);
    const { error } = await supabase
      .from("bi_empresas" as never)
      .upsert(rowsWithFlag.slice(i, i + 500) as never, { onConflict: "cnpj" });
    if (error) throw error;
  }

  const removidos = existing.map((r) => r.cnpj).filter((c) => !cnpjSet.has(c));
  for (let i = 0; i < removidos.length; i += 200) {
    const { error } = await supabase
      .from("bi_empresas" as never)
      .delete()
      .in("cnpj", removidos.slice(i, i + 200));
    if (error) throw error;
  }

  onProgress?.("Sincronizando configurações...");
  const [existFolha, existCont, existFisc] = await Promise.all([
    fetchAll<{ cnpj: string }>("bi_config_folha"),
    fetchAll<{ cnpj: string }>("bi_config_contabil"),
    fetchAll<{ cnpj: string }>("bi_config_fiscal"),
  ]);
  const haveFolha = new Set(existFolha.map((r) => r.cnpj));
  const haveCont = new Set(existCont.map((r) => r.cnpj));
  const haveFisc = new Set(existFisc.map((r) => r.cnpj));
  const insBatch = async (table: string, arr: unknown[]) => {
    for (let i = 0; i < arr.length; i += 500) {
      const { error } = await supabase.from(table as never).upsert(arr.slice(i, i + 500) as never, { onConflict: "cnpj" });
      if (error) throw error;
    }
  };
  const newFolha = cnpjList.filter((c) => !haveFolha.has(c)).map((cnpj) => ({ cnpj, sistema: "", adiant: false, dia_adiant: "", fechamento: "", curva: "" }));
  const newCont = cnpjList.filter((c) => !haveCont.has(c)).map((cnpj) => ({ cnpj, integrado: "", software: "", apuracao: "", fech_tipo: "", tipo_emp: "", tipo_holding: "", curva: "" }));
  const newFisc = cnpjList.filter((c) => !haveFisc.has(c)).map((cnpj) => ({ cnpj, curva: "" }));
  if (newFolha.length) await insBatch("bi_config_folha", newFolha);
  if (newCont.length) await insBatch("bi_config_contabil", newCont);
  if (newFisc.length) await insBatch("bi_config_fiscal", newFisc);

  const novos = rowsWithFlag.filter((r) => r.is_new).length;
  onProgress?.(`OK: ${rows.length} empresas | ${novos} novas | ${removidos.length} removidas`);
  return { total: rows.length, novos, removidos: removidos.length, importacaoId: resumo.importacao.id };
}

/** Roda a sincronização apenas quando a importação ativa mudou desde o último espelhamento. */
export async function biSyncIfBaseChanged(onProgress?: (m: string) => void) {
  const { sharedGetValue, sharedSetValue } = await import("@/lib/import-processos");
  const { getEmpresaBaseResumo } = await import("@/lib/empresas-mensal");
  const resumo = await getEmpresaBaseResumo();
  if (!resumo.importacao) return null;
  const last = await sharedGetValue<string>(SYNC_KEY);
  if (last === resumo.importacao.id) return null;
  const res = await biSyncFromBaseAtiva(onProgress);
  await sharedSetValue(SYNC_KEY, resumo.importacao.id);
  return res;
}
