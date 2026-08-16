import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

// ─── Utils ─────────────────────────────────────────────────────────────
const MESES_ABBR = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function mmYYYYtoISO(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${m[2]}-${m[1].padStart(2,"0")}`;
}
function ddmmYYYYtoISO(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2,"0")}`;
}
function isoToLabel(iso: string): string {
  const [y,m] = iso.split("-");
  return `${MESES_ABBR[parseInt(m,10)-1]}/${y.slice(2)}`;
}
function normCNPJ(s: string): string {
  const raw = (s || "").trim();
  const numeric = /^\d+(?:[.,]\d+)?e\+?\d+$/i.test(raw)
    ? Number(raw.replace(",", ".")).toFixed(0)
    : raw;
  const d = numeric.replace(/\D/g,"").padStart(14,"0");
  if (d.length !== 14) return (s||"").trim();
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}
function detectSep(sample: string): string {
  const c = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of sample) if (ch in c) (c as Record<string, number>)[ch]++;
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ";";
}
function splitLine(line: string, sep: string = ";"): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (const c of line) {
    if (c === '"') { q = !q; continue; }
    if (c === sep && !q) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function parseCountPct(s: string): { n: number; p: number } {
  const m = (s||"").match(/(\d+)\s*\((\d+)/);
  return m ? { n: parseInt(m[1],10), p: parseInt(m[2],10) } : { n: 0, p: 0 };
}

// ─── COMPOSIÇÃO CONTÁBIL (CSV) ─────────────────────────────────────────
export interface CompReg {
  cn: string; em: string; re: string; gr: string; ec: string;
  ub: string; mb: string; fp: number; op: number;
  fn: number; on: number; dn: number; tc: number;
  st: string; tb: boolean;
}
export interface CompRaw { regs: CompReg[]; meses: string[]; ml: Record<string,string> }

export function parseComposicaoCSV(text: string, base?: CompReg[]): CompRaw {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { regs: [], meses: [], ml: {} };
  const sep = detectSep(lines[0]);
  const rows = lines.slice(1).map(l => splitLine(l, sep));
  const baseMap = new Map<string, CompReg>((base||[]).map(r => [r.cn, r]));
  const regs: CompReg[] = rows.map(r => {
    const cn = normCNPJ(r[0]);
    const em = r[1] || "";
    const gr = r[2] || "";
    const re = r[3] || "";
    const ub = (r[4] || "").trim();
    const mb = mmYYYYtoISO(ub);
    const fc = parseCountPct(r[5] || "");
    const cd = parseCountPct(r[6] || "");
    const ok = parseCountPct(r[7] || "");
    const tc = fc.n + cd.n + ok.n;
    let st = "sem_balancete";
    if (mb) {
      if (tc === 0) st = "sem_balancete";
      else if (ok.n === tc) st = "ok";
      else if (cd.n > 0) st = "revisao";
      else if (fc.n === tc) st = "zerada";
      else st = "parcial";
    }
    const prev = baseMap.get(cn);
    return {
      cn, em, gr, re,
      ec: prev?.ec || "",
      ub, mb,
      fp: fc.p, op: cd.p,
      fn: fc.n, on: cd.n, dn: ok.n, tc,
      st, tb: !!mb,
    };
  });
  const mesesSet = new Set(regs.map(r => r.mb).filter(Boolean));
  const meses = [...mesesSet].sort();
  const ml: Record<string,string> = {};
  meses.forEach(m => { ml[m] = isoToLabel(m); });
  return { regs, meses, ml };
}

/** Lê arquivo .csv (texto) ou .xlsx (planilha) e retorna o texto CSV com `;`. */
export async function readCompFileAsCsv(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const address = XLSX.utils.encode_cell({ r: row, c: range.s.c });
      const cell = ws[address];
      if (!cell) continue;
      const raw = String(cell.v ?? "").trim();
      if (cell.t === "n" || /^\d+(?:[.,]\d+)?e\+?\d+$/i.test(raw)) {
        const digits = Number(raw.replace(",", ".")).toFixed(0);
        cell.t = "s";
        cell.v = digits;
        cell.w = digits;
        cell.z = "@";
      }
    }
    return XLSX.utils.sheet_to_csv(ws, { FS: ";" });
  }
  return await file.text();
}

// ─── IRPJ / CSLL ─────────────────────────────────────────────────────
export interface IrpjReg {
  cn: string; em: string; re: string; gr: string; ec: string;
  tem_aut: boolean; sub: string; mas: string; ult: string;
  tem_dom: boolean; mdom: string[]; udom: string[]; ndom: number;
  sit: string;
}

function subFromRegime(re: string): string {
  if (/Estimativa/i.test(re)) return "estimativa";
  if (/Trimestral/i.test(re)) return "trimestral";
  return "";
}

export function parseAutomacaoCSV(text: string): Array<{cn:string;em:string;gr:string;re:string;mas:string;ult:string;sub:string}> {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = detectSep(lines[0]);
  return lines.slice(1).map(l => splitLine(l, sep)).map(r => {
    const cn = normCNPJ(r[0]);
    const ub = (r[4]||"").trim();
    return {
      cn, em: r[1]||"", gr: r[2]||"", re: r[3]||"",
      mas: mmYYYYtoISO(ub), ult: ub, sub: subFromRegime(r[3]||""),
    };
  });
}

export async function parseDominioXLSX(buffer: ArrayBuffer): Promise<Map<string,{mdom:string[];udom:string[]}>> {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
  const map = new Map<string,{mdom:Set<string>;udom:Set<string>}>();
  rows.forEach(row => {
    const cnpjRaw = String(row.cgce_emp||row.CNPJ||"").trim();
    if (!cnpjRaw) return;
    const cn = normCNPJ(cnpjRaw);
    const compStr = String(row.competencia||"").trim();
    // Accept DD/MM/YYYY or Excel serial
    let iso = ddmmYYYYtoISO(compStr);
    if (!iso && typeof row.competencia === "number") {
      const d = XLSX.SSF.parse_date_code(row.competencia);
      if (d) iso = `${d.y}-${String(d.m).padStart(2,"0")}`;
    }
    if (!iso) return;
    const usr = String(row.usuario||"").trim();
    if (!map.has(cn)) map.set(cn, { mdom: new Set(), udom: new Set() });
    const e = map.get(cn)!;
    e.mdom.add(iso);
    if (usr) e.udom.add(usr);
  });
  const out = new Map<string,{mdom:string[];udom:string[]}>();
  map.forEach((v,k) => out.set(k, { mdom: [...v.mdom].sort(), udom: [...v.udom] }));
  return out;
}

export function mergeIrpjData(base: IrpjReg[], aut: ReturnType<typeof parseAutomacaoCSV> | null, dom: Map<string,{mdom:string[];udom:string[]}> | null): IrpjReg[] {
  const map = new Map<string, IrpjReg>(base.map(r => [r.cn, { ...r, mdom: [...r.mdom], udom: [...r.udom] }]));
  // Reset AUT if provided
  if (aut) {
    map.forEach(r => { r.tem_aut = false; r.mas = ""; r.ult = ""; r.sub = ""; });
    aut.forEach(a => {
      let r = map.get(a.cn);
      if (!r) {
        r = { cn: a.cn, em: a.em, re: a.re, gr: a.gr, ec: "", tem_aut: false, sub: "", mas: "", ult: "", tem_dom: false, mdom: [], udom: [], ndom: 0, sit: "sem_dados" };
        map.set(a.cn, r);
      }
      r.tem_aut = true; r.mas = a.mas; r.ult = a.ult; r.sub = a.sub;
      if (!r.em) r.em = a.em;
      if (!r.gr) r.gr = a.gr;
      if (!r.re) r.re = a.re;
    });
  }
  if (dom) {
    map.forEach(r => { r.tem_dom = false; r.mdom = []; r.udom = []; r.ndom = 0; });
    dom.forEach((v, cn) => {
      let r = map.get(cn);
      if (!r) {
        r = { cn, em: "", re: "Lucro Real - Geral", gr: "", ec: "", tem_aut: false, sub: "", mas: "", ult: "", tem_dom: false, mdom: [], udom: [], ndom: 0, sit: "sem_dados" };
        map.set(cn, r);
      }
      r.tem_dom = true; r.mdom = v.mdom; r.udom = v.udom; r.ndom = v.mdom.length;
    });
  }
  // Recompute sit
  map.forEach(r => {
    if (r.tem_aut && r.tem_dom) r.sit = "ambos";
    else if (r.tem_aut) r.sit = "so_automatizacao";
    else if (r.tem_dom) r.sit = "so_dominio";
    else r.sit = "sem_dados";
  });
  return [...map.values()].sort((a,b) => a.em.localeCompare(b.em));
}

// ─── LocalStorage helpers ─────────────────────────────────────────────
const LS_COMP = "processos.composicao.v1";
const LS_IRPJ = "processos.irpj.v1";
const LS_COMP_TS = "processos.composicao.v1.ts";
const LS_IRPJ_TS = "processos.irpj.v1.ts";

export function loadStoredComposicao(): CompRaw | null {
  try { const s = localStorage.getItem(LS_COMP); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveStoredComposicao(d: CompRaw) { localStorage.setItem(LS_COMP, JSON.stringify(d)); }
export function clearStoredComposicao() { localStorage.removeItem(LS_COMP); localStorage.removeItem(LS_COMP_TS); }

export interface IrpjStore { regs: IrpjReg[]; meses: string[]; ml: Record<string,string> }
export function loadStoredIrpj(): IrpjStore | null {
  try { const s = localStorage.getItem(LS_IRPJ); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveStoredIrpj(d: IrpjStore) { localStorage.setItem(LS_IRPJ, JSON.stringify(d)); }
export function clearStoredIrpj() { localStorage.removeItem(LS_IRPJ); localStorage.removeItem(LS_IRPJ_TS); }

// ─── Shared state (Supabase) ──────────────────────────────────────────
async function sharedFetch(key: string): Promise<{ value: unknown; updated_at: string } | null> {
  const { data, error } = await supabase
    .from("shared_state" as never)
    .select("value,updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as { value: unknown; updated_at: string } | null) ?? null;
}
async function sharedUpsert(key: string, value: unknown): Promise<string | null> {
  const { data, error } = await supabase
    .from("shared_state" as never)
    .upsert({ key, value, updated_at: new Date().toISOString() } as never, { onConflict: "key" })
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  return ((data as unknown as { updated_at: string } | null)?.updated_at) ?? null;
}
async function sharedDelete(key: string): Promise<void> {
  const { error } = await supabase.from("shared_state" as never).delete().eq("key", key);
  if (error) throw error;
}

/** Sync composicao/irpj from Supabase into localStorage. Returns true if local cache was updated. */
export async function syncSharedComposicao(): Promise<boolean> {
  const remote = await sharedFetch("composicao");
  if (!remote) {
    const local = loadStoredComposicao();
    if (local) {
      const ts = await sharedUpsert("composicao", local);
      if (ts) localStorage.setItem(LS_COMP_TS, ts);
    }
    return false;
  }
  const localTs = localStorage.getItem(LS_COMP_TS) || "";
  if (localTs === remote.updated_at) return false;
  localStorage.setItem(LS_COMP, JSON.stringify(remote.value));
  localStorage.setItem(LS_COMP_TS, remote.updated_at);
  return true;
}
export async function syncSharedIrpj(): Promise<boolean> {
  const remote = await sharedFetch("irpj");
  if (!remote) {
    const local = loadStoredIrpj();
    if (local) {
      const ts = await sharedUpsert("irpj", local);
      if (ts) localStorage.setItem(LS_IRPJ_TS, ts);
    }
    return false;
  }
  const localTs = localStorage.getItem(LS_IRPJ_TS) || "";
  if (localTs === remote.updated_at) return false;
  localStorage.setItem(LS_IRPJ, JSON.stringify(remote.value));
  localStorage.setItem(LS_IRPJ_TS, remote.updated_at);
  return true;
}
export async function pushSharedComposicao(d: CompRaw): Promise<void> {
  const ts = await sharedUpsert("composicao", d);
  saveStoredComposicao(d);
  if (ts) localStorage.setItem(LS_COMP_TS, ts);
}
export async function pushSharedIrpj(d: IrpjStore): Promise<void> {
  const ts = await sharedUpsert("irpj", d);
  saveStoredIrpj(d);
  if (ts) localStorage.setItem(LS_IRPJ_TS, ts);
}
export async function clearSharedComposicao(): Promise<void> {
  await sharedDelete("composicao");
  clearStoredComposicao();
}
export async function clearSharedIrpj(): Promise<void> {
  await sharedDelete("irpj");
  clearStoredIrpj();
}

export function buildIrpjMeses(regs: IrpjReg[]): { meses: string[]; ml: Record<string,string> } {
  const set = new Set<string>();
  regs.forEach(r => { if (r.mas) set.add(r.mas); r.mdom.forEach(m => set.add(m)); });
  const meses = [...set].sort();
  const ml: Record<string,string> = {};
  meses.forEach(m => { ml[m] = isoToLabel(m); });
  return { meses, ml };
}

// ─── Generic shared key/value (Supabase) ──────────────────────────────
export async function sharedGetValue<T>(key: string): Promise<T | null> {
  try { const r = await sharedFetch(key); return (r?.value as T) ?? null; } catch { return null; }
}
export async function sharedSetValue(key: string, value: unknown): Promise<void> {
  await sharedUpsert(key, value);
}
