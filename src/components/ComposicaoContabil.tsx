import { useState, useMemo, useRef, useEffect } from "react";
import { parseComposicaoCSV, loadStoredComposicao, readCompFileAsCsv, pushSharedComposicao, clearSharedComposicao, syncSharedComposicao } from "@/lib/import-processos";
import { biLoadAll, biGetTag } from "@/lib/bi-empresas";
import { exportXlsx } from "@/lib/export-xlsx";



// ── TIPOS ──────────────────────────────────────────────────────────────────────
interface Reg {
  cn: string; em: string; re: string; gr: string; ec: string;
  ub: string; mb: string; fp: number; op: number;
  fn: number; on: number; dn: number; tc: number;
  st: string; tb: boolean;
}

function companyNameKey(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b\d{4}[\s/-]?\d{2}\b$/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isValidCnpj(value: string): boolean {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const checkDigit = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return checkDigit(12) === Number(digits[12]) && checkDigit(13) === Number(digits[13]);
}

// ── DADOS DO RELATÓRIO (banco / cache compartilhado) ──────────────────────────
const _stored = typeof window !== "undefined" ? loadStoredComposicao() : null;
const REGS: Reg[] = (_stored?.regs ?? []) as Reg[];

function mesLabel(k: string) {
  const [y, m] = k.split("-");
  return m && y ? `${m}/${y}` : k;
}
const MESES: string[] = (_stored?.meses as string[] | undefined)
  ?? [...new Set(REGS.map((r) => r.mb).filter(Boolean))].sort();
const ML: Record<string, string> = (_stored?.ml as Record<string, string> | undefined)
  ?? Object.fromEntries(MESES.map((m) => [m, mesLabel(m)]));

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SIT_CFG: Record<string, { lbl: string; dot: string; cls: string }> = {
  ok:             { lbl: "✅ Composição OK",   dot: "#00BF63", cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  revisao:        { lbl: "🟣 Em revisão",       dot: "#7C3AED", cls: "bg-purple-50 text-purple-700 border-purple-300" },
  parcial:        { lbl: "🔵 Parcial",           dot: "#0284C7", cls: "bg-blue-50 text-blue-700 border-blue-300" },
  zerada:         { lbl: "⚠️ Zerada (0%)",      dot: "#FA6914", cls: "bg-orange-50 text-orange-700 border-orange-300" },
  sem_balancete:  { lbl: "❌ Sem balancete",     dot: "#DC2626", cls: "bg-red-50 text-red-700 border-red-300" },
};
const SIT_ORDER = ["ok", "revisao", "parcial", "zerada", "sem_balancete"];

const LEGENDA = [
  { sit: "ok",            txt: "Balancete com ≥50% das contas compostas." },
  { sit: "revisao",       txt: "Maioria preenchida, mas há diferenças a corrigir." },
  { sit: "parcial",       txt: "Menos de 50% das contas preenchidas." },
  { sit: "zerada",        txt: "Balancete importado, mas 0% preenchido." },
  { sit: "sem_balancete", txt: "Nenhum balancete importado no sistema." },
];

function P(u: number, b: number) { return b ? Math.round((u / b) * 100) : 0; }
function regLabel(r: string) {
  const s = r.toLowerCase();
  if (s.includes("lucro real"))   return { lbl: "LR", cls: "bg-orange-50 text-orange-700 border border-orange-200" };
  if (s.includes("lucro pres"))   return { lbl: "LP", cls: "bg-purple-50 text-purple-700 border border-purple-200" };
  if (s.includes("simples"))      return { lbl: "SN", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" };
  return { lbl: r.slice(0, 6) || "—", cls: "bg-gray-100 text-gray-500 border border-gray-200" };
}

// ── COMPONENTES HELPERS ───────────────────────────────────────────────────────
function SitBadge({ st }: { st: string }) {
  const c = SIT_CFG[st];
  if (!c) return <span className="text-xs text-gray-400">{st}</span>;
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.cls} whitespace-nowrap`}>
      {c.lbl}
    </span>
  );
}

function RegBadge({ re }: { re: string }) {
  const { lbl, cls } = regLabel(re);
  return <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full text-center min-w-[24px] ${cls}`}>{lbl}</span>;
}

function BalBadge({ r }: { r: Reg }) {
  if (!r.tb) return <span className="text-[10.5px] text-gray-300">—</span>;
  const m = r.ub.replace("✅ ", "").replace("❌ ", "");
  return <span className="text-[10.5px] font-semibold text-emerald-600 whitespace-nowrap">✅ {m}</span>;
}

function CompText({ r }: { r: Reg }) {
  if (!r.tb || !r.tc) return <span className="text-[10.5px] text-gray-300">Sem dados</span>;
  if (r.fp === 100) return <span className="text-[10.5px] font-semibold text-orange-600">0% preenchido</span>;
  if (r.op >= 50)   return <span className="text-[10.5px] font-semibold text-emerald-600">{r.op}% OK</span>;
  return <span className="text-[10.5px] font-semibold text-blue-600">{r.op}% OK / {r.fp}% faltando</span>;
}

function MN({ n }: { n: number }) {
  return n > 0
    ? <strong className="text-gray-800">{n}</strong>
    : <span className="text-gray-300">—</span>;
}

function Pag({ page, total, pp, onPage }: { page: number; total: number; pp: number; onPage: (p: number) => void }) {
  const tp = Math.max(1, Math.ceil(total / pp));
  if (tp <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-2 mt-3">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-30 hover:border-emerald-400 hover:text-emerald-600 transition">
        ← Anterior
      </button>
      <span className="text-[11px] text-gray-400 min-w-[80px] text-center">Página {page} de {tp}</span>
      <button onClick={() => onPage(page + 1)} disabled={page >= tp}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-30 hover:border-emerald-400 hover:text-emerald-600 transition">
        Próxima →
      </button>
    </div>
  );
}

function ImportButton() {
  const ref = useRef<HTMLInputElement>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const text = await readCompFileAsCsv(f);
      const parsed = parseComposicaoCSV(text, REGS);
      if (!parsed.regs.length) { alert("Nenhum registro identificado no arquivo. Confira se ele contém as colunas: CNPJ, Empresa, Grupo, Regime, Último Balancete, Faltantes, Divergências, OK."); return; }
      const comBal = parsed.regs.filter(r => r.tb).length;
      await pushSharedComposicao(parsed);
      alert(`Importado com sucesso: ${parsed.regs.length} empresas (${comBal} com balancete).`);
      location.reload();
    } catch (err) {
      alert("Falha ao ler o arquivo: " + (err as Error).message);
    }
  }
  async function onReset() {
    if (!confirm("Limpar o relatório importado? A base ativa continuará sendo exibida.")) return;
    try { await clearSharedComposicao(); } catch { /* noop */ }
    location.reload();
  }
  return (
    <div className="ml-auto flex items-center gap-2">
      <input ref={ref} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onFile} className="hidden" />
      <button onClick={() => ref.current?.click()} className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">📥 Importar CSV/XLSX</button>
      <button onClick={onReset} className="text-[11px] font-semibold px-2 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50" title="Limpar relatório importado">↺</button>
    </div>
  );
}


export default function ComposicaoContabil() {
  useEffect(() => {
    syncSharedComposicao().then((changed) => { if (changed) location.reload(); }).catch(() => {});
  }, []);
  const [tab, setTab] = useState<"geral" | "empresa" | "zeradas" | "sem" | "alerta">("geral");
  const [mesFiltro, setMesFiltro] = useState<string>("all");
  const [filtroSit, setFiltroSit] = useState<string | null>(null);
  const [q1, setQ1] = useState(""); const [fEq1, setFEq1] = useState(""); const [fRe1, setFRe1] = useState(""); const [fSit1, setFSit1] = useState("");
  const [q2, setQ2] = useState(""); const [fEq2, setFEq2] = useState("");
  const [q3, setQ3] = useState(""); const [fEq3, setFEq3] = useState(""); const [fRe3, setFRe3] = useState("");
  const [qA, setQA] = useState(""); const [fEqA, setFEqA] = useState(""); const [fTipoA, setFTipoA] = useState(""); const [fClassA, setFClassA] = useState(""); const [mesCorte, setMesCorte] = useState<string>("");
  const [p1, setP1] = useState(1); const [p2, setP2] = useState(1); const [p3, setP3] = useState(1); const [pA, setPA] = useState(1);
  const PP = 50;

  // Base de empresas (bi_empresas) — carrega equipes contábeis reais e mapa CNPJ→equipe

  // Base de empresas (bi_empresas) — carrega equipes contábeis reais e mapa CNPJ→equipe
  const [biEcByCnpj, setBiEcByCnpj] = useState<Record<string, string>>({});
  const [biEqBase, setBiEqBase] = useState<Record<string, number>>({});
  const [biEmpList, setBiEmpList] = useState<Array<{ cn: string; em: string; re: string; gr: string; ec: string }>>([]);
  const [biFechByCnpj, setBiFechByCnpj] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { empresas, contCfg } = await biLoadAll();
        const map: Record<string, string> = {};
        const base: Record<string, number> = {};
        const list: Array<{ cn: string; em: string; re: string; gr: string; ec: string }> = [];
        const fech: Record<string, string> = {};
        empresas.forEach((e) => {
          if (!/\/0001-\d{2}$/.test(e.cnpj)) return;
          // Equipe contábil: TAG contábil ou, na falta, o campo "contabil" da base
          const t = biGetTag(e.tags || "", "Cont[áa]bil");
          const campo = (e.contabil || "").trim();
          if (!t && !campo) return;
          const num = (t || campo).match(/(\d+)/)?.[1];
          const eq = num
            ? `Equipe Contábil ${num}`
            : (t || campo).replace(/^Cont[áa]bil\s*-\s*/i, "Equipe Contábil ");
          map[e.cnpj] = eq;
          base[eq] = (base[eq] || 0) + 1;
          list.push({ cn: e.cnpj, em: e.razao, re: e.regime, gr: e.grupo, ec: eq });
          fech[e.cnpj] = (contCfg[e.cnpj]?.fech_tipo || "").trim();
        });


        if (alive) { setBiEcByCnpj(map); setBiEqBase(base); setBiEmpList(list); setBiFechByCnpj(fech); }
      } catch { /* mantém apenas o relatório importado */ }
    })();
    return () => { alive = false; };
  }, []);

  // Merge da base ativa (bi_empresas) com o cache local — empresas que estão na
  // base mas ainda não foram vistas no relatório entram como "sem balancete".
  const mergedRegs = useMemo<Reg[]>(() => {
    if (!biEmpList.length) return REGS;
    const cnSet = new Set(REGS.map((r) => r.cn));
    const stubs: Reg[] = biEmpList
      .filter((b) => !cnSet.has(b.cn))
      .map((b) => ({
        cn: b.cn, em: b.em, re: b.re, gr: b.gr, ec: b.ec,
        ub: "", mb: "", fp: 0, op: 0, fn: 0, on: 0, dn: 0, tc: 0,
        st: "sem_balancete", tb: false,
      }));
    return [...REGS, ...stubs];
  }, [biEmpList]);

  // Visíveis = empresas cujo último balancete é >= mês filtrado (atualizadas até esse mês).
  const vis = useMemo(() => {
    if (mesFiltro === "all") return mergedRegs;
    return mergedRegs.filter((r) => r.mb && r.mb >= mesFiltro);
  }, [mesFiltro, mergedRegs]);


  // A base ativa é a fonte principal. Se o relatório trouxe um CNPJ inválido,
  // tenta identificar a empresa pelo nome antes de recorrer ao valor importado.
  const ecOf = (r: Reg) => {
    const byCnpj = biEcByCnpj[r.cn];
    if (byCnpj) return byCnpj;
    if (!isValidCnpj(r.cn)) {
      const key = companyNameKey(r.em);
      if (key.length >= 6) {
        const teams = new Set(
          biEmpList
            .filter((b) => {
              const baseKey = companyNameKey(b.em);
              return baseKey === key || baseKey.startsWith(`${key} `) || key.startsWith(`${baseKey} `);
            })
            .map((b) => b.ec)
            .filter(Boolean),
        );
        if (teams.size === 1) return [...teams][0];
      }
    }
    return r.ec || "";
  };

  const equipes = useMemo(() => {
    const s = new Set<string>();
    mergedRegs.forEach((r) => { const e = ecOf(r); if (e) s.add(e); });
    Object.keys(biEqBase).forEach((e) => s.add(e));
    return [...s].sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] || "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] || "0", 10);
      return na - nb || a.localeCompare(b);
    });
  }, [biEcByCnpj, biEqBase, mergedRegs]);

  const regimes = useMemo(() => [...new Set(mergedRegs.map((r) => r.re).filter(Boolean))].sort(), [mergedRegs]);

  // Stats dos visíveis
  const sitCount = useMemo(() => {
    const c: Record<string, number> = {};
    vis.forEach((r) => { c[r.st] = (c[r.st] || 0) + 1; });
    return c;
  }, [vis]);

  const comBal = useMemo(() => vis.filter((r) => r.tb).length, [vis]);

  // Base por equipe: prefere bi_empresas quando disponível; caso contrário conta o RAW
  const eqBase = useMemo(() => {
    if (Object.keys(biEqBase).length) return biEqBase;
    const b: Record<string, number> = {};
    mergedRegs.forEach((r) => { const e = ecOf(r); if (e) b[e] = (b[e] || 0) + 1; });
    return b;
  }, [biEqBase, biEcByCnpj, mergedRegs]);

  const eqMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    equipes.forEach((eq) => { m[eq] = {}; });
    vis.forEach((r) => {
      const e = ecOf(r);
      if (!e || !r.tb) return;
      if (!m[e]) m[e] = {};
      m[e][r.st] = (m[e][r.st] || 0) + 1;
    });
    return m;
  }, [vis, equipes, biEcByCnpj]);


  // Aba "Por Empresa" — filtra sobre visíveis
  const fil1 = useMemo(() => {
    return vis.filter((r) => {
      if (fSit1 && r.st !== fSit1) return false;
      if (fEq1 && ecOf(r) !== fEq1) return false;
      if (fRe1 && r.re !== fRe1) return false;
      if (q1 && !r.em.toLowerCase().includes(q1.toLowerCase()) && !r.cn.includes(q1) && !r.gr.toLowerCase().includes(q1.toLowerCase())) return false;
      return true;
    });
  }, [vis, q1, fEq1, fRe1, fSit1, biEcByCnpj]);

  // Aba "Zeradas" — sobre visíveis
  const fil2 = useMemo(() =>
    vis.filter((r) => r.st === "zerada" && (!fEq2 || ecOf(r) === fEq2) && (!q2 || r.em.toLowerCase().includes(q2.toLowerCase()) || r.cn.includes(q2))),
    [vis, q2, fEq2, biEcByCnpj]);

  // CNPJs com balancete no mês visível
  const cnpjsComBalVis = useMemo(() => new Set(vis.filter((r) => r.tb).map((r) => r.cn)), [vis]);


  // Base total = bi_empresas (tag Contábil) quando disponível; fallback RAW
  const totalBase = useMemo(() => biEmpList.length || mergedRegs.length, [biEmpList, mergedRegs]);

  // Aba "Sem Balancete" — empresas da base sem balancete no mês/período selecionado
  const fil3 = useMemo(() => {
    const semBalSet = cnpjsComBalVis;
    // Base preferencial: bi_empresas; fallback: REGS
    const source = biEmpList.length
      ? biEmpList.map((b) => ({ cn: b.cn, em: b.em, re: b.re, gr: b.gr, ec: b.ec }))
      : mergedRegs.map((r) => ({ cn: r.cn, em: r.em, re: r.re, gr: r.gr, ec: ecOf(r) }));
    return source.filter((r) => !semBalSet.has(r.cn)
      && (!fEq3 || r.ec === fEq3)
      && (!fRe3 || r.re === fRe3)
      && (!q3 || r.em.toLowerCase().includes(q3.toLowerCase()) || r.cn.includes(q3)));
  }, [biEmpList, cnpjsComBalVis, q3, fEq3, fRe3, biEcByCnpj, mergedRegs]);

  const sem = Math.max(0, totalBase - comBal);
  const ok = (sitCount.ok || 0);
  const par = (sitCount.parcial || 0) + (sitCount.revisao || 0);
  const zer = sitCount.zerada || 0;
  const mesLbl = mesFiltro === "all" ? "todos os meses" : "atualizadas até " + (ML[mesFiltro] || mesFiltro);


  function clickFunil(k: string) {
    const next = filtroSit === k ? null : k;
    setFiltroSit(next);
    setFSit1(next || "");
    setTab("empresa");
    setP1(1);
  }

  // ── ALERTA — cruzamento com bi_config_contabil.fech_tipo ────────────────────
  // Mês corrente = último balancete visto na base (fallback: último de MESES)
  const mbByCnpj = useMemo(() => {
    const m: Record<string, string> = {};
    mergedRegs.forEach((r) => { if (r.mb) m[r.cn] = r.mb; });
    return m;
  }, [mergedRegs]);
  const autoMes = useMemo(() => {
    const arr = Object.values(mbByCnpj).filter(Boolean).sort();
    if (arr.length) return arr[arr.length - 1];
    return MESES[MESES.length - 1] || "";
  }, [mbByCnpj]);
  const currentMes = mesCorte || autoMes;
  const requiredFor = (tipo: string): string[] => {
    if (!currentMes) return [];
    const cur = currentMes;
    // MESES no formato "YYYY-MM"; extrai mm
    const mm = (k: string) => Number(k.slice(-2));
    const upto = MESES.filter((k) => k <= cur);
    if (/sem movimento/i.test(tipo)) return [];
    if (/mensal/i.test(tipo) || !tipo || /sem classificacao/i.test(tipo)) return upto;
    if (/trimestral/i.test(tipo)) return upto.filter((k) => [3, 6, 9, 12].includes(mm(k)));
    if (/semestral/i.test(tipo)) return upto.filter((k) => [6, 12].includes(mm(k)));
    if (/anual/i.test(tipo)) return upto.filter((k) => mm(k) === 12);
    return upto;
  };
  interface AlertRow { cn: string; em: string; ec: string; re: string; tipo: string; ultMb: string; faltando: string[]; }
  const alertRows = useMemo<AlertRow[]>(() => {
    if (!biEmpList.length) return [];
    const out: AlertRow[] = [];
    biEmpList.forEach((e) => {
      const rawTipo = biFechByCnpj[e.cn] || "";
      if (/sem movimento/i.test(rawTipo)) return;
      const tipo = rawTipo || "Sem classificação";
      const req = requiredFor(tipo);
      if (!req.length) return;
      const ult = mbByCnpj[e.cn] || "";
      const faltando = req.filter((m) => !ult || ult < m);
      if (faltando.length) out.push({ cn: e.cn, em: e.em, ec: e.ec, re: e.re, tipo, ultMb: ult, faltando });
    });
    return out.sort((a, b) => b.faltando.length - a.faltando.length);
  }, [biEmpList, biFechByCnpj, mbByCnpj, currentMes]);

  const alertaFiltrado = useMemo(() => alertRows.filter((r) =>
    (!fEqA || r.ec === fEqA) &&
    (!fTipoA || r.tipo === fTipoA) &&
    (!fClassA || (fClassA === "Sem classificação" ? r.tipo === "Sem classificação" : r.tipo !== "Sem classificação")) &&
    (!qA || r.em.toLowerCase().includes(qA.toLowerCase()) || r.cn.includes(qA))
  ), [alertRows, qA, fEqA, fTipoA, fClassA]);

  const alertaPorEquipe = useMemo(() => {
    const m: Record<string, { total: number; faltas: number }> = {};
    alertRows.forEach((r) => {
      if (!m[r.ec]) m[r.ec] = { total: 0, faltas: 0 };
      m[r.ec].total++;
      m[r.ec].faltas += r.faltando.length;
    });
    return Object.entries(m).sort(([a], [b]) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] || "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] || "0", 10);
      return na - nb || a.localeCompare(b);
    });
  }, [alertRows]);

  const tiposAlerta = useMemo(() => [...new Set(alertRows.map((r) => r.tipo).filter((t) => t !== "Sem classificação"))].sort(), [alertRows]);

  // Base avaliada no alerta = matriz + tag Contábil (exclui apenas Sem movimento). Dentre elas, sem classificação = fech_tipo vazio.
  const alertaBaseAvaliada = useMemo(
    () => biEmpList.filter((e) => !/sem movimento/i.test(biFechByCnpj[e.cn] || "")).length,
    [biEmpList, biFechByCnpj],
  );
  const alertaNaoClassificadas = useMemo(
    () => biEmpList.filter((e) => {
      const t = biFechByCnpj[e.cn] || "";
      return !t && !/sem movimento/i.test(t);
    }).length,
    [biEmpList, biFechByCnpj],
  );

  const TABS = [
    { id: "geral",   lbl: "📊 Visão Geral",       badge: null },
    { id: "empresa", lbl: "🔍 Por Empresa",         badge: totalBase },
    { id: "zeradas", lbl: "⚠️ Zeradas",             badge: zer, danger: true },
    { id: "sem",     lbl: "❌ Sem Balancete",        badge: sem, danger: true },
    { id: "alerta",  lbl: "🚨 Alerta",              badge: alertRows.length, danger: true },
  ];

  const tabLbl = TABS.find(t => t.id === tab)?.lbl.replace(/^\S+\s/, '') || 'Visão Geral';

  const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
.ccroot{--g:#0AE18C;--gd:#00BF63;--glt:#EAFBF4;--bk:#0C0C0C;--ch:#1A1A1A;--g70:#4A4A4A;--g50:#646464;--g30:#CDCDCD;--g10:#E8E8E8;--g05:#F5F5F5;--off:#FAFAFA;--wh:#FFF;--bd:#E2E2E2;--red:#DC2626;--rlt:#FEE2E2;--amb:#FA6914;--abl:#FFF7ED;--blue:#0284C7;--blt:#EFF6FF;--pur:#7C3AED;--plt:#F5F3FF;background:var(--off);color:#2C2C2C;font-family:'Poppins',sans-serif;font-size:13px;-webkit-font-smoothing:antialiased}
.ccroot *,.ccroot *::before,.ccroot *::after{box-sizing:border-box}
.ccroot .top{background:var(--bk);height:54px;display:flex;align-items:center;padding:0 20px;gap:10px;position:sticky;top:0;z-index:100}
.ccroot .logo{width:32px;height:32px;background:var(--g);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;color:var(--bk);flex-shrink:0}
.ccroot .impbtn{margin-left:auto;font-size:11px;font-weight:600;padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:rgba(255,255,255,.7);cursor:pointer;transition:all .15s}
.ccroot .impbtn:hover{background:rgba(10,225,140,.15);border-color:var(--g);color:var(--g)}
.ccroot .mes-bar{background:var(--wh);border-bottom:2px solid var(--bd);padding:0 20px;overflow-x:auto}
.ccroot .mes-inner{display:flex;align-items:stretch;gap:0}
.ccroot .mes-btn{font-family:inherit;font-size:11px;font-weight:600;padding:10px 16px;border:none;background:none;cursor:pointer;color:var(--g50);border-bottom:2px solid transparent;margin-bottom:-2px;display:flex;flex-direction:column;align-items:center;gap:2px;transition:all .15s;white-space:nowrap;min-width:80px}
.ccroot .mes-btn:hover{color:var(--ch)}
.ccroot .mes-btn.act{color:var(--gd);border-bottom-color:var(--g)}
.ccroot .mes-n{font-size:10px;font-weight:700}
.ccroot .mes-sub{font-size:9px;color:var(--g30)}
.ccroot .mes-btn.act .mes-sub{color:var(--gd);opacity:.6}
.ccroot .tabs{background:var(--wh);border-bottom:1px solid var(--bd);display:flex;padding:0 20px;overflow-x:auto}
.ccroot .tab{font-family:inherit;font-size:12px;font-weight:600;padding:9px 14px;border:none;background:none;color:var(--g50);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap}
.ccroot .tab:hover{color:var(--ch)}
.ccroot .tab.act{color:var(--gd);border-bottom-color:var(--g)}
.ccroot .tbg{font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--g10);color:var(--g50)}
.ccroot .tab.act .tbg{background:var(--glt);color:var(--gd)}
.ccroot .tbg.r{background:var(--rlt);color:var(--red)}
.ccroot .tbg.a{background:var(--abl);color:var(--amb)}
.ccroot .main{max-width:1500px;margin:0 auto;padding:16px 20px 80px}
.ccroot .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.ccroot .card{background:var(--wh);border:1px solid var(--bd);border-radius:13px;padding:12px 16px;flex:1;min-width:110px}
.ccroot .card-l{font-size:9px;font-weight:700;color:var(--g50);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.ccroot .card-v{font-size:26px;font-weight:800;color:var(--ch);line-height:1.1}
.ccroot .card-s{font-size:10px;color:var(--g50);margin-top:2px}
.ccroot .cg{border-color:#86EFAC;background:var(--glt)} .ccroot .cg .card-v{color:var(--gd)}
.ccroot .cr{border-color:#FCA5A5;background:var(--rlt)} .ccroot .cr .card-v{color:var(--red)}
.ccroot .ca{border-color:#FED7AA;background:var(--abl)} .ccroot .ca .card-v{color:var(--amb)}
.ccroot .cb{border-color:#93C5FD;background:var(--blt)} .ccroot .cb .card-v{color:var(--blue)}
.ccroot .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.ccroot .box{background:var(--wh);border:1px solid var(--bd);border-radius:14px;padding:14px 18px}
.ccroot .box-title{font-size:12px;font-weight:700;color:var(--ch);margin-bottom:12px}
.ccroot .funil{display:flex;flex-direction:column;gap:5px}
.ccroot .funil-row{display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background .12s}
.ccroot .funil-row:hover{background:var(--g05)}
.ccroot .funil-row.sel{background:var(--glt);outline:1.5px solid var(--g)}
.ccroot .funil-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.ccroot .funil-lbl{font-size:11px;color:var(--g70);flex:1}
.ccroot .funil-bar-w{width:110px;background:var(--g10);border-radius:3px;height:7px;overflow:hidden;flex-shrink:0}
.ccroot .funil-bar-f{height:100%;border-radius:3px}
.ccroot .funil-n{font-size:12px;font-weight:700;color:var(--ch);min-width:28px;text-align:right}
.ccroot .funil-pct{font-size:10px;color:var(--g50);min-width:36px;text-align:right}
.ccroot .eq-table{width:100%;border-collapse:collapse}
.ccroot .eq-table th{font-size:9px;font-weight:700;color:var(--g50);text-transform:uppercase;padding:5px 8px;border-bottom:2px solid var(--bd);white-space:nowrap;text-align:left}
.ccroot .eq-table th.r,.ccroot .eq-table td.r{text-align:right}
.ccroot .eq-table td{padding:6px 8px;font-size:11.5px;border-bottom:1px solid var(--g10);color:var(--ch)}
.ccroot .eq-table tbody tr:last-child td{border-bottom:none}
.ccroot .eq-table tbody tr:hover{background:var(--g05)}
.ccroot .stk{display:flex;height:7px;border-radius:3px;overflow:hidden;gap:1px;width:90px}
.ccroot .bar-t{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.ccroot .sw{position:relative;flex:1;min-width:160px;max-width:250px}
.ccroot .sw svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);opacity:.35;pointer-events:none}
.ccroot .si{width:100%;font-family:inherit;font-size:12px;padding:6px 10px 6px 29px;border:1px solid var(--bd);border-radius:9px;background:var(--wh);outline:none;color:#2C2C2C}
.ccroot .si:focus{border-color:var(--g)}
.ccroot .si::placeholder{color:var(--g30)}
.ccroot .sel{font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--bd);border-radius:9px;background:var(--wh);outline:none;cursor:pointer;color:#2C2C2C}
.ccroot .sel:focus{border-color:var(--g)}
.ccroot .cnt{font-size:11px;color:var(--g50);margin-left:auto;white-space:nowrap}
.ccroot .tw{background:var(--wh);border:1px solid var(--bd);border-radius:14px;overflow:hidden;overflow-x:auto}
.ccroot .tt{width:100%;border-collapse:collapse}
.ccroot .tt thead tr{background:var(--g05);border-bottom:1px solid var(--bd)}
.ccroot .tt th{padding:8px 10px;text-align:left;font-size:9px;font-weight:700;color:var(--g50);text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.ccroot .tt th.r,.ccroot .tt td.r{text-align:right}
.ccroot .tt tbody tr{border-bottom:1px solid var(--bd);transition:background .1s}
.ccroot .tt tbody tr:last-child{border-bottom:none}
.ccroot .tt tbody tr:hover{background:#FAFFFD}
.ccroot .tt td{padding:7px 10px;font-size:11.5px;vertical-align:middle;color:var(--ch)}
.ccroot .tn{font-weight:600;color:var(--ch);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px}
.ccroot .tm{font-family:monospace;font-size:11px;color:var(--g50);white-space:nowrap}
.ccroot .tg{font-size:11px;color:var(--g70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
.ccroot .chip{display:inline-block;font-size:9px;font-weight:600;padding:1px 6px;border-radius:20px;border:1px solid;white-space:nowrap}
.ccroot .clr{background:#FFF3E0;color:#C2410C;border-color:#FED7AA}
.ccroot .clp{background:#F5F3FF;color:#6D28D9;border-color:#DDD6FE}
.ccroot .csn{background:#ECFDF5;color:#065F46;border-color:#A7F3D0}
.ccroot .sit{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:12px;border:1px solid;white-space:nowrap}
.ccroot .sit-ok{background:var(--glt);color:var(--gd);border-color:#86EFAC}
.ccroot .sit-parcial{background:var(--blt);color:var(--blue);border-color:#93C5FD}
.ccroot .sit-revisao{background:var(--plt);color:var(--pur);border-color:#DDD6FE}
.ccroot .sit-zerada{background:var(--abl);color:var(--amb);border-color:#FED7AA}
.ccroot .sit-sem_balancete{background:var(--rlt);color:var(--red);border-color:#FCA5A5}
.ccroot .bal-ok{font-size:10.5px;color:var(--gd);font-weight:600;white-space:nowrap}
.ccroot .bal-sem{font-size:10.5px;color:var(--g30)}
.ccroot .pag{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:10px}
.ccroot .pb{font-family:inherit;font-size:11px;font-weight:600;padding:5px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--wh);color:var(--g70);cursor:pointer;transition:all .15s}
.ccroot .pb:hover:not(:disabled){border-color:var(--g);color:var(--gd)}
.ccroot .pb:disabled{opacity:.35;cursor:default}
.ccroot .pi{font-size:11px;color:var(--g50);min-width:80px;text-align:center}
.ccroot .empty{padding:32px;text-align:center;color:var(--g30);font-size:12px}
.ccroot .nota{border-radius:10px;padding:10px 14px;font-size:12px;margin-bottom:12px;line-height:1.5}
.ccroot .nota-a{background:var(--abl);border:1px solid #FED7AA;color:var(--amb)}
.ccroot .nota-r{background:var(--rlt);border:1px solid #FCA5A5;color:var(--red)}
`;

  const regBadgeCls: Record<string, string> = {
    LR: "clr", LP: "clp", SN: "csn",
  };

  const searchSvg = <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>;

  const monthTabs = [
    { key: "all", lbl: "Todos", sub: `${totalBase} emp.` },
    ...MESES.map((m) => ({ key: m, lbl: ML[m], sub: `${mergedRegs.filter((r) => r.mb && r.mb >= m).length} bal.` })),
  ];

  function exportarExcel() {
    const sitLbl = (st: string) => SIT_CFG[st]?.lbl.replace(/^\S+\s/, "") || st;
    exportXlsx("composicao-contabil", [
      {
        name: "Por Empresa",
        rows: fil1.map((r) => ({
          CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: ecOf(r), Regime: r.re,
          "Último balancete": r.ub, Situação: sitLbl(r.st),
          "Contas OK": r.dn, "Divergências": r.on, Faltantes: r.fn, "Total contas": r.tc,
        })),
      },
      {
        name: "Zeradas",
        rows: fil2.map((r) => ({
          CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: ecOf(r), Regime: r.re, "Último balancete": r.ub,
        })),
      },
      {
        name: "Sem Balancete",
        rows: fil3.map((r) => ({ CNPJ: r.cn, Empresa: r.em, Grupo: r.gr, Equipe: r.ec, Regime: r.re })),
      },
      {
        name: "Alerta",
        rows: alertaFiltrado.map((r) => ({
          CNPJ: r.cn, Empresa: r.em, Equipe: r.ec, Regime: r.re, "Tipo de fechamento": r.tipo,
          "Último balancete": r.ultMb ? (ML[r.ultMb] || r.ultMb) : "—",
          "Competências faltantes": r.faltando.map((m) => ML[m] || m).join(", "),
          "Qtd. faltantes": r.faltando.length,
        })),
      },
    ]);
  }

  return (
    <div className="ccroot w-full">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* TOPBAR */}
      <div className="top">
        <div className="logo">CC</div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginLeft: 4 }}>
          <strong style={{ color: "#fff" }}>Composição Contábil</strong>
          <span style={{ opacity: .3 }}> / </span>
          <span>{tabLbl}</span>
        </span>
        <ImportButton />
        <button onClick={exportarExcel} className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50">
          ⬇️ Exportar Excel
        </button>
      </div>


      {/* FILTRO MÊS */}
      <div className="mes-bar">
        <div className="mes-inner">
          {monthTabs.map(({ key, lbl, sub }) => (
            <button key={key} onClick={() => { setMesFiltro(key); setP1(1); setP2(1); setP3(1); }}
              className={`mes-btn ${mesFiltro === key ? "act" : ""}`}>
              <span className="mes-n">{lbl}</span>
              <span className="mes-sub">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`tab ${tab === t.id ? "act" : ""}`}>
            {t.lbl}
            {t.badge != null && <span className={`tbg ${t.danger ? "r" : ""}`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="main">

        {/* ── GERAL ── */}
        {tab === "geral" && (
          <div>
            <div className="cards">
              {[
                { lbl: "Base (matriz, sem CC)", v: totalBase, sub: "Equipe Contábil", cls: "cb" },
                { lbl: `Com balancete — ${mesLbl}`, v: comBal, sub: `${P(comBal, totalBase)}% da base`, cls: "cg" },
                { lbl: "Composição OK", v: ok, sub: `${P(ok, comBal)}% dos com bal.`, cls: "cg" },
                { lbl: "Parcial / Em revisão", v: par, sub: `${P(par, comBal)}% dos com bal.`, cls: "cb" },
                { lbl: "Zeradas (0%)", v: zer, sub: "com bal. mas sem composição", cls: "ca" },
                { lbl: "Sem balancete", v: sem, sub: `${P(sem, totalBase)}% da base`, cls: "cr" },

              ].map(({ lbl, v, sub, cls }) => (
                <div key={lbl} className={`card ${cls}`}>
                  <div className="card-l">{lbl}</div>
                  <div className="card-v">{v}</div>
                  <div className="card-s">{sub}</div>
                </div>
              ))}
            </div>

            <div className="grid2">
              {/* Funil */}
              <div className="box">
                <div className="box-title">
                  📋 Situação das composições <span style={{ fontSize: 10, fontWeight: 400, color: "var(--g50)" }}>— {mesLbl}</span>
                </div>
                <div className="funil">
                  {SIT_ORDER.map((k) => {
                    const n = k === "sem_balancete" ? sem : (sitCount[k] || 0);
                    const base2 = k === "sem_balancete" ? totalBase : comBal;
                    const cfg = SIT_CFG[k];
                    const pw = (Math.max(...SIT_ORDER.map((s) => s === "sem_balancete" ? sem : (sitCount[s] || 0))) || 1);
                    const isSel = filtroSit === k;
                    return (
                      <div key={k} onClick={() => clickFunil(k)} className={`funil-row ${isSel ? "sel" : ""}`}>
                        <div className="funil-dot" style={{ background: cfg.dot }} />
                        <span className="funil-lbl">{cfg.lbl}</span>
                        <div className="funil-bar-w">
                          <div className="funil-bar-f" style={{ width: `${Math.round(n / pw * 100)}%`, background: cfg.dot }} />
                        </div>
                        <span className="funil-n">{n}</span>
                        <span className="funil-pct">({P(n, base2)}%)</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--g05)", borderRadius: 10, border: "1px solid var(--bd)" }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: "var(--g50)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 7 }}>Legenda</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5, color: "var(--g70)", lineHeight: 1.4 }}>
                    {LEGENDA.map(({ sit, txt }) => {
                      const c = SIT_CFG[sit];
                      return (
                        <div key={sit}>
                          <span style={{ color: c.dot, fontWeight: 700 }}>{c.lbl}</span> — {txt}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Por equipe */}
              <div className="box">
                <div className="box-title">
                  👥 Por equipe contábil <span style={{ fontSize: 10, fontWeight: 400, color: "var(--g50)" }}>— {mesLbl}</span>
                </div>
                <table className="eq-table">
                  <thead><tr>
                    <th>Equipe</th>
                    <th className="r">Com bal.</th>
                    <th>Distribuição</th>
                    <th className="r" style={{ color: "var(--gd)" }}>OK</th>
                    <th className="r" style={{ color: "var(--blue)" }}>Parcial</th>
                    <th className="r" style={{ color: "var(--amb)" }}>Zerada</th>
                    <th className="r" style={{ color: "var(--red)" }}>Sem bal.</th>
                  </tr></thead>
                  <tbody>
                    {equipes.map((eq) => {
                      const d = eqMap[eq] || {};
                      const tot = Object.values(d).reduce((s, v) => s + v, 0);
                      const base3 = eqBase[eq] || tot;
                      const semB = base3 - tot;
                      const okN = d.ok || 0;
                      const parN = (d.parcial || 0) + (d.revisao || 0);
                      const zerN = d.zerada || 0;
                      const segs = [
                        { n: okN, c: "#00BF63" }, { n: d.revisao || 0, c: "#7C3AED" },
                        { n: d.parcial || 0, c: "#0284C7" }, { n: zerN, c: "#FA6914" },
                      ];
                      return (
                        <tr key={eq}>
                          <td style={{ fontWeight: 700, color: "var(--ch)" }}>{eq}</td>
                          <td className="r" style={{ fontWeight: 600 }}>{tot}</td>
                          <td>
                            <div className="stk">
                              {segs.map((s, i) => <div key={i} style={{ height: "100%", width: `${P(s.n, tot || 1)}%`, background: s.c }} />)}
                            </div>
                          </td>
                          <td className="r" style={{ fontWeight: 700, color: okN > 0 ? "var(--gd)" : "var(--g30)" }}>{okN}</td>
                          <td className="r" style={{ fontWeight: 700, color: parN > 0 ? "var(--blue)" : "var(--g30)" }}>{parN}</td>
                          <td className="r" style={{ fontWeight: 700, color: zerN > 0 ? "var(--amb)" : "var(--g30)" }}>{zerN}</td>
                          <td className="r" style={{ fontWeight: 700, color: semB > 0 ? "var(--red)" : "var(--g30)" }}>{semB}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── POR EMPRESA ── */}
        {tab === "empresa" && (
          <div>
            <div className="bar-t">
              <div className="sw">{searchSvg}
                <input className="si" value={q1} onChange={(e) => { setQ1(e.target.value); setP1(1); }} placeholder="Empresa, CNPJ ou grupo..." />
              </div>
              {[{ v: fEq1, set: setFEq1, opts: equipes, lbl: "Equipe" }, { v: fRe1, set: setFRe1, opts: regimes, lbl: "Regime" }].map(({ v, set, opts, lbl }) => (
                <select key={lbl} className="sel" value={v} onChange={(e) => { set(e.target.value); setP1(1); }}>
                  <option value="">Todos — {lbl}</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
              <select className="sel" value={fSit1} onChange={(e) => { setFSit1(e.target.value); setP1(1); }}>
                <option value="">Todas as situações</option>
                {SIT_ORDER.map((k) => <option key={k} value={k}>{SIT_CFG[k].lbl}</option>)}
              </select>
              <span className="cnt">{fil1.length.toLocaleString("pt-BR")} empresas</span>
            </div>
            <div className="tw"><table className="tt" style={{ minWidth: 900 }}>
              <thead><tr>
                {["Empresa","CNPJ","Grupo","Regime","Equipe Contábil","Situação","Último Balancete","OK","Dif.","Falta"].map((h, i) => (
                  <th key={h} className={i >= 7 ? "r" : ""}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {fil1.slice((p1 - 1) * PP, p1 * PP).map((r) => {
                  const rl = regLabel(r.re);
                  return (
                    <tr key={r.cn}>
                      <td><div className="tn" title={r.em}>{r.em}</div></td>
                      <td><span className="tm">{r.cn}</span></td>
                      <td><div className="tg" title={r.gr}>{r.gr || "—"}</div></td>
                      <td><span className={`chip ${regBadgeCls[rl.lbl] || ""}`}>{rl.lbl}</span></td>
                      <td><span style={{ fontSize: 11, color: "var(--g70)" }}>{ecOf(r) || "—"}</span></td>
                      <td><span className={`sit sit-${r.st}`}>{SIT_CFG[r.st]?.lbl || r.st}</span></td>
                      <td>{r.tb ? <span className="bal-ok">✅ {r.ub.replace("✅ ","").replace("❌ ","")}</span> : <span className="bal-sem">—</span>}</td>
                      <td className="r"><MN n={r.on} /></td>
                      <td className="r"><MN n={r.dn} /></td>
                      <td className="r"><MN n={r.fn} /></td>
                    </tr>
                  );
                })}
                {fil1.length === 0 && <tr><td colSpan={10} className="empty">Nenhuma empresa.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p1} total={fil1.length} pp={PP} onPage={(p) => setP1(Math.max(1, Math.min(Math.ceil(fil1.length / PP), p)))} />
          </div>
        )}

        {/* ── ZERADAS ── */}
        {tab === "zeradas" && (
          <div>
            <div className="nota nota-a">
              ⚠️ Balancete importado mas <strong>0% das contas com composição</strong> — balancete existe mas nada foi preenchido.
            </div>
            <div className="bar-t">
              <div className="sw">{searchSvg}
                <input className="si" value={q2} onChange={(e) => { setQ2(e.target.value); setP2(1); }} placeholder="Buscar empresa..." />
              </div>
              <select className="sel" value={fEq2} onChange={(e) => { setFEq2(e.target.value); setP2(1); }}>
                <option value="">Todas as equipes</option>
                {equipes.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <span className="cnt">{fil2.length} empresas</span>
            </div>
            <div className="tw"><table className="tt" style={{ minWidth: 760 }}>
              <thead><tr>
                {["Empresa","CNPJ","Grupo","Regime","Equipe Contábil","Último Balancete","Total Contas"].map((h, i) => (
                  <th key={h} className={i === 6 ? "r" : ""}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {fil2.slice((p2 - 1) * PP, p2 * PP).map((r) => {
                  const rl = regLabel(r.re);
                  return (
                    <tr key={r.cn}>
                      <td><div className="tn" title={r.em}>{r.em}</div></td>
                      <td><span className="tm">{r.cn}</span></td>
                      <td><div className="tg">{r.gr || "—"}</div></td>
                      <td><span className={`chip ${regBadgeCls[rl.lbl] || ""}`}>{rl.lbl}</span></td>
                      <td><span style={{ fontSize: 11, color: "var(--g70)" }}>{ecOf(r) || "—"}</span></td>
                      <td><span className="bal-ok">✅ {r.ub.replace("✅ ","")}</span></td>
                      <td className="r" style={{ fontWeight: 700 }}>{r.tc}</td>
                    </tr>
                  );
                })}
                {fil2.length === 0 && <tr><td colSpan={7} className="empty">Nenhuma empresa zerada no período.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p2} total={fil2.length} pp={PP} onPage={(p) => setP2(Math.max(1, Math.min(Math.ceil(fil2.length / PP), p)))} />
          </div>
        )}

        {/* ── SEM BALANCETE ── */}
        {tab === "sem" && (
          <div>
            <div className="nota nota-r">
              ❌ Empresas com <strong>tag Equipe Contábil (matriz, sem CC)</strong> sem nenhum balancete no sistema no período selecionado.
            </div>
            <div className="bar-t">
              <div className="sw">{searchSvg}
                <input className="si" value={q3} onChange={(e) => { setQ3(e.target.value); setP3(1); }} placeholder="Buscar empresa..." />
              </div>
              {[{ v: fEq3, set: setFEq3, opts: equipes, lbl: "Equipe" }, { v: fRe3, set: setFRe3, opts: regimes, lbl: "Regime" }].map(({ v, set, opts, lbl }) => (
                <select key={lbl} className="sel" value={v} onChange={(e) => { set(e.target.value); setP3(1); }}>
                  <option value="">Todos — {lbl}</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
              <span className="cnt">{fil3.length.toLocaleString("pt-BR")} empresas</span>
            </div>
            <div className="tw"><table className="tt" style={{ minWidth: 680 }}>
              <thead><tr>
                {["Empresa","CNPJ","Grupo","Regime","Equipe Contábil"].map((h) => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {fil3.slice((p3 - 1) * PP, p3 * PP).map((r) => {
                  const rl = regLabel(r.re);
                  return (
                    <tr key={r.cn}>
                      <td><div className="tn" title={r.em}>{r.em}</div></td>
                      <td><span className="tm">{r.cn}</span></td>
                      <td><div className="tg">{r.gr || "—"}</div></td>
                      <td><span className={`chip ${regBadgeCls[rl.lbl] || ""}`}>{rl.lbl}</span></td>
                      <td><span style={{ fontSize: 11, color: "var(--g70)" }}>{r.ec || "—"}</span></td>
                    </tr>
                  );
                })}
                {fil3.length === 0 && <tr><td colSpan={5} className="empty">Todas as empresas têm balancete no período.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={p3} total={fil3.length} pp={PP} onPage={(p) => setP3(Math.max(1, Math.min(Math.ceil(fil3.length / PP), p)))} />
          </div>
        )}

        {/* ── ALERTA ── */}
        {tab === "alerta" && (
          <div>
            <div className="nota nota-r">
              🚨 Empresas com <strong>tag Equipe Contábil (matriz)</strong> cujo último balancete não atende à periodicidade configurada em <strong>Base Informações Empresas → Contábil → Fechamento</strong>. Referência: <strong>{currentMes ? (ML[currentMes] || currentMes) : "—"}</strong>. Empresas <em>sem movimento</em> são desconsideradas. Regras: Mensal (todo mês), Trimestral (03/06/09/12), Semestral (06/12), Anual (12).
            </div>

            <div className="cards">
              {[
                { lbl: "Empresas em risco", v: alertRows.length, sub: `de ${alertaBaseAvaliada} avaliadas${alertaNaoClassificadas ? ` · ${alertaNaoClassificadas} sem classificação` : ""}`, cls: "cr" },
                { lbl: "Competências faltantes", v: alertRows.reduce((s, r) => s + r.faltando.length, 0), sub: "somatório", cls: "ca" },
                { lbl: "Sem classificação", v: alertRows.filter((r) => r.tipo === "Sem classificação").length, sub: "empresas", cls: "cb" },
                { lbl: "Mensal", v: alertRows.filter((r) => /mensal/i.test(r.tipo)).length, sub: "empresas", cls: "cb" },
                { lbl: "Trimestral", v: alertRows.filter((r) => /trimestral/i.test(r.tipo)).length, sub: "empresas", cls: "cb" },
                { lbl: "Semestral", v: alertRows.filter((r) => /semestral/i.test(r.tipo)).length, sub: "empresas", cls: "cb" },
                { lbl: "Anual", v: alertRows.filter((r) => /anual/i.test(r.tipo)).length, sub: "empresas", cls: "cb" },
              ].map(({ lbl, v, sub, cls }) => (
                <div key={lbl} className={`card ${cls}`}>
                  <div className="card-l">{lbl}</div>
                  <div className="card-v">{v}</div>
                  <div className="card-s">{sub}</div>
                </div>
              ))}
            </div>

            <div className="box" style={{ marginBottom: 14 }}>
              <div className="box-title">👥 Resumo por equipe contábil</div>
              <table className="eq-table">
                <thead><tr>
                  <th>Equipe</th>
                  <th className="r">Empresas em risco</th>
                  <th className="r">Competências faltantes</th>
                </tr></thead>
                <tbody>
                  {alertaPorEquipe.map(([eq, v]) => (
                    <tr key={eq}>
                      <td style={{ fontWeight: 700 }}>{eq}</td>
                      <td className="r" style={{ fontWeight: 700, color: "var(--red)" }}>{v.total}</td>
                      <td className="r" style={{ fontWeight: 700, color: "var(--amb)" }}>{v.faltas}</td>
                    </tr>
                  ))}
                  {alertaPorEquipe.length === 0 && <tr><td colSpan={3} className="empty">Sem alertas.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="bar-t">
              <div className="sw">{searchSvg}
                <input className="si" value={qA} onChange={(e) => { setQA(e.target.value); setPA(1); }} placeholder="Empresa ou CNPJ..." />
              </div>
              <select className="sel" value={fEqA} onChange={(e) => { setFEqA(e.target.value); setPA(1); }}>
                <option value="">Todas as equipes</option>
                {equipes.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select className="sel" value={fTipoA} onChange={(e) => { setFTipoA(e.target.value); setPA(1); }}>
                <option value="">Todas as periodicidades</option>
                {tiposAlerta.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <select className="sel" value={fClassA} onChange={(e) => { setFClassA(e.target.value); setPA(1); }}>
                <option value="">Todas as classificações</option>
                <option value="Classificadas">Classificadas</option>
                <option value="Sem classificação">Sem classificação</option>
              </select>
              <select className="sel" value={mesCorte} onChange={(e) => { setMesCorte(e.target.value); setPA(1); }} title="Competência de corte — só cobra competências ≤ este mês">
                <option value="">Corte automático ({ML[autoMes] || autoMes || "—"})</option>
                {MESES.map((m) => <option key={m} value={m}>Até {ML[m] || m}</option>)}
              </select>
              <span className="cnt">{alertaFiltrado.length.toLocaleString("pt-BR")} empresas · corte {ML[currentMes] || currentMes || "—"}</span>
            </div>


            <div className="tw"><table className="tt" style={{ minWidth: 900 }}>
              <thead><tr>
                {["Empresa","CNPJ","Equipe","Regime","Periodicidade","Último Bal.","Faltando"].map((h, i) => (
                  <th key={h} className={i === 6 ? "r" : ""}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {alertaFiltrado.slice((pA - 1) * PP, pA * PP).map((r) => (
                  <tr key={r.cn}>
                    <td><div className="tn" title={r.em}>{r.em}</div></td>
                    <td><span className="tm">{r.cn}</span></td>
                    <td><span style={{ fontSize: 11, color: "var(--g70)" }}>{r.ec || "—"}</span></td>
                    <td><span style={{ fontSize: 11, color: "var(--g70)" }}>{r.re || "—"}</span></td>
                    <td><span className="chip clp">{r.tipo}</span></td>
                    <td>{r.ultMb ? <span className="bal-ok">{ML[r.ultMb] || r.ultMb}</span> : <span className="bal-sem">—</span>}</td>
                    <td className="r">
                      <span style={{ fontSize: 10.5, color: "var(--red)", fontWeight: 700 }}>
                        {r.faltando.map((m) => ML[m] || m).join(", ")}
                      </span>
                    </td>
                  </tr>
                ))}
                {alertaFiltrado.length === 0 && <tr><td colSpan={7} className="empty">Nenhuma empresa em risco.</td></tr>}
              </tbody>
            </table></div>
            <Pag page={pA} total={alertaFiltrado.length} pp={PP} onPage={(p) => setPA(Math.max(1, Math.min(Math.ceil(alertaFiltrado.length / PP), p)))} />
          </div>
        )}

      </div>
    </div>
  );
}
