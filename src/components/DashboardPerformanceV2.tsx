// DashboardPerformanceV2.tsx — Dashboard de Performance de Entregas
// Usa listEmpresasAtivas() igual à AuditoriaCadastral para tagsMap correto

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { usePerfNav } from "@/components/HubShell";
import { listEmpresasAtivas } from "@/lib/empresas-mensal";
import {
  sincronizarPaginaEntregas,
  sincronizarPaginaProcessos,
} from "@/lib/acessorias-entregas.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";


// ─── Paleta ───────────────────────────────────────────────────────────────
const C = {
  brand: "#00BF63", red: "#FC6B6B", amber: "#E8C547",
  bg: "#0C0C0C", card: "#111111", card2: "#1A1A1A",
  border: "#2C2C2C", text: "#FAFAFA", sub: "#CDCDCD",
  muted: "#646464", dim: "#3A3A3A",
};

// ─── Tipos ────────────────────────────────────────────────────────────────
type EmpresaBase = Awaited<ReturnType<typeof listEmpresasAtivas>>[number];
type EntregaApi = {
  id: string; cnpj: string; razao: string; nome_entrega: string;
  tipo: string; status: string; departamento: string;
  resp_entrega: string; resp_prazo: string; dt_prazo: string; dt_finalizacao: string;
};
type ProcessoApi = {
  id: string; cnpj: string; razao: string; nome_processo: string;
  status: string; porcentagem: number; departamento: string;
  gestor: string; dt_inicio: string; dt_conclusao: string;
};
type NavId = "geral" | "contabil" | "fiscal" | "folha" | "clientes" | "timeline" | "tarefas" | "processos";
type MembroStat = { antecip: number; prazo: number; just: number; atras: number; entAtras: number; vencer: number; total: number };
type TagStat = {
  tag: string; dept: string; coordenador: string;
  antecip: number; prazo: number; just: number; atras: number; entAtras: number; vencer: number; total: number;
  membros: Map<string, MembroStat>;
};

// ─── Helpers de TAG — igual à auditoria ──────────────────────────────────
function parseTags(l: EmpresaBase): string[] {
  const d = (l.dados || {}) as Record<string, unknown>;
  const raw = String(d["Tags"] ?? d["tags"] ?? (l.tags || []).join(", ") ?? "").trim();
  return raw ? raw.split(",").map(t => t.trim()).filter(t => t && t !== "CX") : [];
}

function getTagDepto(tags: string[], dep: "cont" | "fisc" | "dp"): string {
  return tags.find(t => {
    if (dep === "cont") return /^equipe\s+cont[aá]bil\s+\d+$/i.test(t.trim());
    if (dep === "fisc") return /^equipe\s+fiscal\s+\d+$/i.test(t.trim());
    if (dep === "dp")   return /^equipe\s+dp\s+\d+$/i.test(t.trim());
    return false;
  }) || "";
}

function getTagDeptoFromCnpj(tagsMap: Record<string, string[]>, cnpj: string, dep: "cont" | "fisc" | "dp"): string {
  const tags = tagsMap[(cnpj || "").replace(/\D/g, "")] || [];
  return getTagDepto(tags, dep);
}

function depFromDepartamento(departamento: string): "cont" | "fisc" | "dp" {
  const d = (departamento || "").toUpperCase();
  if (d.includes("CONT")) return "cont";
  if (d.includes("FISC")) return "fisc";
  return "dp";
}

// ─── Helpers de status ───────────────────────────────────────────────────
function statusClass(s: string): keyof MembroStat {
  const l = (s || "").toLowerCase().trim();
  if (l.includes("antecip")) return "antecip";
  if (l.includes("pztéc") || l.includes("pztec") || l === "prazo técnico" || l === "prazo tecnico") return "prazo";
  if (l.includes("ent. atrasada") || l === "ent. atrasada") return "entAtras";
  if (l.includes("ent. justificada")) return "prazo";
  if (l.includes("atrasada!")) return "atras";
  if (l.includes("atraso justificado") || l.includes("pend. justificada") || l.includes("justif")) return "just";
  if (l.includes("pendente")) return "vencer";
  return "prazo";
}

function statusLabel(s: string) {
  const c = statusClass(s);
  if (c === "antecip") return "✦ Entregue antecipado";
  if (c === "prazo")   return "✓ Entregue";
  if (c === "entAtras") return "⚡ Ent. com atraso";
  if (c === "atras")   return "⚡ Atrasada!";
  if (c === "just")    return "⚠ Justificada";
  if (c === "vencer")  return "🕒 A Vencer";
  return "✓ Entregue";
}

function statusColor(c: string) {
  if (c === "antecip" || c === "prazo") return C.brand;
  if (c === "atras" || c === "entAtras") return C.red;
  if (c === "just") return C.amber;
  return C.muted;
}

function pctColor(p: number) { return p >= 95 ? C.brand : p >= 80 ? C.amber : C.red; }

function fmtCnpj(v: string) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length !== 14) return v || "—";
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

// ─── Paginação de entregas ───────────────────────────────────────────────
async function fetchAllEntregas(dtIni: string, dtFim: string) {
  const PAGE = 1000;
  let all: EntregaApi[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("acessorias_entregas")
      .select("*")
      .gte("dt_prazo", dtIni)
      .lte("dt_prazo", dtFim)
      .order("dt_prazo", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data as EntregaApi[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function procStatusInfo(s: string) {
  const l = (s || "").toLowerCase();
  if (l === "a" || l.includes("andamento")) return { label: "Em andamento", color: C.brand };
  if (l === "c" || l.includes("conclu"))    return { label: "Concluído",    color: C.brand };
  if (l === "s" || l.includes("suspen"))    return { label: "Suspenso",     color: C.muted };
  if (l.includes("atras"))                  return { label: "Atrasado",     color: C.red };
  return { label: s, color: C.muted };
}

// ─── Estilos ──────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" };
const th: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: C.muted, textAlign: "left", padding: "6px 10px", borderBottom: `1px solid ${C.border}`, background: C.card2, whiteSpace: "nowrap", position: "sticky", top: 0 };
const td: React.CSSProperties = { fontSize: 11, color: C.sub, padding: "6px 10px", borderBottom: `1px solid ${C.card2}`, verticalAlign: "middle" };
const btn = (active?: boolean): React.CSSProperties => ({ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: `1px solid ${active ? C.brand : C.border}`, background: active ? C.brand : "transparent", color: active ? "#0C0C0C" : C.sub, cursor: "pointer" });
const inp: React.CSSProperties = { fontFamily: "inherit", fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card2, color: C.text };

// ─── Sub-componentes ──────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: "10px 12px", borderTop: `2px solid ${accent || C.border}` }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const cls = String(statusClass(s));
  const color = cls === "vencer" ? C.muted : statusColor(cls);
  return <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: `${color}18`, color }}>{statusLabel(s)}</span>;
}

// ─── Componente principal ─────────────────────────────────────────────────
export default function DashboardPerformanceV2() {
  const { navId: nav, setNavId: setNav } = usePerfNav();
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [entregas, setEntregas] = useState<EntregaApi[]>([]);
  const [processos, setProcessos] = useState<ProcessoApi[]>([]);
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [razaoMap, setRazaoMap] = useState<Record<string, string>>({});
  const [grupoMap, setGrupoMap] = useState<Record<string, string>>({});
  const [coordMap, setCoordMap] = useState<Record<string, string>>({});
  const [dtIni, setDtIni] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dtFim, setDtFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [ultimaSinc, setUltimaSinc] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erroSinc, setErroSinc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [qDept, setQDept] = useState("");
  const [qCli, setQCli] = useState("");
  const [qGrupo, setQGrupo] = useState("");
  const [qProc, setQProc] = useState("");
  const [fProcStatus, setFProcStatus] = useState("");
  const [fProcDept, setFProcDept] = useState("");
  const [fTarefaEquipe, setFTarefaEquipe] = useState("");
  const [fEquipeCont, setFEquipeCont] = useState("");
  const [fEquipeFisc, setFEquipeFisc] = useState("");
  const [fEquipeFolha, setFEquipeFolha] = useState("");
  const [tlTab, setTlTab] = useState<"just" | "atras">("just");

  const [timelineData, setTimelineData] = useState<{ justRecorrentes: Array<{ cnpj: string; meses: string[]; total: number }>; atrasRecorrentes: Array<{ tag: string; dept: string; meses: string[]; total: number }> } | null>(null);
  const { isAdmin } = useAuth();

  const toggleExpand = (t: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const nomeEmp = (cnpj: string) => razaoMap[(cnpj || "").replace(/\D/g, "")] || fmtCnpj(cnpj);
  const grupoEmp = (cnpj: string) => grupoMap[(cnpj || "").replace(/\D/g, "")] || "";
  const tagFromEntrega = (e: EntregaApi) => getTagDeptoFromCnpj(tagsMap, e.cnpj, depFromDepartamento(e.departamento));

  // ── Carregar ────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Empresas — igual à auditoria cadastral
      const linhas = await listEmpresasAtivas();
      const tm: Record<string, string[]> = {};
      const gm: Record<string, string> = {};
      const rm2: Record<string, string> = {};
      linhas.forEach((l: EmpresaBase) => {
        const cnpj = (l.cnpj || "").replace(/\D/g, "");
        if (!cnpj) return;
        const tags = parseTags(l);
        if (tags.length > 0) tm[cnpj] = tags;
        const grupo = String(l.grupo || "").trim();
        if (grupo) gm[cnpj] = grupo;
        const razao = String(l.razao || "").trim();
        if (razao) rm2[cnpj] = razao;
      });
      setTagsMap(tm);
      setGrupoMap(gm);
      console.log("[V2] empresas:", linhas.length, "com TAG:", Object.keys(tm).length);

      // 2. Coordenadores por TAG
      const { data: tagsBase } = await supabase.from("tags_base").select("key, coord").not("coord", "is", null).neq("coord", "");
      const cm: Record<string, string> = {};
      ((tagsBase || []) as { key: string; coord: string }[]).forEach(t => { if (t.key && t.coord) cm[t.key] = t.coord; });
      setCoordMap(cm);

      // 3. Entregas + atrasadas em aberto
      const [ePeriodo, eAberto, { data: p }, { data: emp }] = await Promise.all([
        fetchAllEntregas(dtIni, dtFim),
        supabase.from("acessorias_entregas").select("*").or("dt_finalizacao.is.null,dt_finalizacao.eq.,dt_finalizacao.eq.0000-00-00 00:00:00").lt("dt_prazo", dtIni).range(0, 999).order("dt_prazo", { ascending: false }).then(r => r.data || []),
        supabase.from("acessorias_processos").select("*").order("dt_inicio", { ascending: false }).range(0, 999),
        supabase.from("acessorias_api_empresas").select("cnpj,razao").range(0, 2999),
      ]);

      const allE = [...(ePeriodo || []), ...(eAberto || [])];
      const e = [...new Map((allE as EntregaApi[]).map(r => [r.id, r])).values()];
      console.log("[V2] entregas:", e.length);

      const rm: Record<string, string> = { ...rm2 };
      ((emp || []) as { cnpj: string; razao: string | null }[]).forEach(r => { const k = (r.cnpj || "").replace(/\D/g, ""); if (k && r.razao) rm[k] = r.razao; });
      setRazaoMap(rm);
      setEntregas(e);
      setProcessos((p || []) as unknown as ProcessoApi[]);
      if (e.length > 0) {
        const max = e.reduce<string>((m, r) => {
          const v = String((r as unknown as Record<string, unknown>)["sincronizado_em"] ?? "");
          return v > m ? v : m;
        }, "");
        setUltimaSinc(max || null);
      }
    } catch (err) { console.error("[V2] erro:", err); }
    finally { setLoading(false); }
  }, [dtIni, dtFim]);

  useEffect(() => { void carregar(); }, [carregar]);

  // ── Sincronizar ─────────────────────────────────────────────────────────
  const syncEntregas  = useServerFn(sincronizarPaginaEntregas);
  const syncProcessos = useServerFn(sincronizarPaginaProcessos);

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true); setErroSinc(null);
    let totalGravadas = 0;
    try {
      const linhas = await listEmpresasAtivas();
      const tmap: Record<string, string[]> = {};
      linhas.forEach((l: EmpresaBase) => {
        const cnpj = (l.cnpj || "").replace(/\D/g, "");
        if (!cnpj) return;
        const tags = parseTags(l);
        if (tags.length > 0) tmap[cnpj] = tags;
      });
      const cnpjsValidos = linhas.map((l: EmpresaBase) => (l.cnpj || "").replace(/\D/g, "")).filter((c: string) => c.length >= 11 && (tmap[c] || []).length > 0);
      console.log("[V2 sync] CNPJs válidos:", cnpjsValidos.length);

      const LOTE = 5;
      let gravadasEntregas = 0;
      for (let i = 0; i < cnpjsValidos.length; i += LOTE) {
        const lote = cnpjsValidos.slice(i, i + LOTE);
        const res = await syncEntregas({ data: { dtInicial: dtIni, dtFinal: dtFim, cnpjs: lote } });
        if (!res.configurado) { setErroSinc(res.error || "Token não configurado"); break; }
        if (res.error) { setErroSinc(res.error); break; }
        totalGravadas += res.gravadas;
        gravadasEntregas += res.gravadas;
        setProgresso(`Entregas: empresa ${Math.min(i + LOTE, cnpjsValidos.length)}/${cnpjsValidos.length} · ${gravadasEntregas} gravadas`);
        await new Promise(r => setTimeout(r, 350));
      }

      for (let pagina = 1; pagina <= 100; pagina++) {
        const res = await syncProcessos({ data: { dtInicial: dtIni, dtFinal: dtFim, pagina } });
        if (!res.configurado || res.error) break;
        totalGravadas += res.gravadas;
        setProgresso(`Processos: página ${pagina} · ${totalGravadas} gravadas`);
        if (res.fim) break;
        await new Promise(r => setTimeout(r, 650));
      }
      await carregar();
    } finally { setSincronizando(false); setProgresso(null); }
  }

  async function fecharCompetencia() {
    const comp = dtIni.slice(0, 7);
    if (!confirm(`Fechar competência ${comp}?`)) return;
    await supabase.from("competencias_fechadas").upsert({ competencia: comp, fechado_em: new Date().toISOString(), fechado_por: "admin", totais_json: {} as never } as never, { onConflict: "competencia" });
    await supabase.from("acessorias_entregas").update({ fechado: true } as never).eq("competencia", comp);
    alert(`Competência ${comp} fechada!`);
  }

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const obrigacoes = useMemo(() => entregas.filter(e => e.tipo !== "T"), [entregas]);
  const tarefas    = useMemo(() => entregas.filter(e => e.tipo === "T"), [entregas]);

  const stats = useMemo(() => {
    const cnt: Record<string, number> = { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 };
    obrigacoes.forEach(e => { const c = String(statusClass(e.status)); if (c in cnt) cnt[c]++; });
    const tot = cnt.antecip + cnt.prazo + cnt.just + cnt.atras + cnt.entAtras;
    return { ...cnt, pct: tot > 0 ? Math.round((cnt.antecip + cnt.prazo) / tot * 100) : 0 } as { antecip: number; prazo: number; just: number; atras: number; entAtras: number; vencer: number; pct: number };
  }, [obrigacoes]);

  const byDept = useMemo(() => {
    const cnpjsCont = new Set(Object.entries(tagsMap).filter(([, t]) => getTagDepto(t, "cont") !== "").map(([c]) => c));
    const cnpjsFisc = new Set(Object.entries(tagsMap).filter(([, t]) => getTagDepto(t, "fisc") !== "").map(([c]) => c));
    const cnpjsDp   = new Set(Object.entries(tagsMap).filter(([, t]) => getTagDepto(t, "dp")   !== "").map(([c]) => c));

    const r: Record<string, Record<string, number>> = {
      CONTÁBIL:   { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 },
      FISCAL:     { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 },
      "FOLHA/DP": { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 },
    };

    obrigacoes.forEach(e => {
      const cnpj = (e.cnpj || "").replace(/\D/g, "");
      const c = String(statusClass(e.status));
      if (cnpjsCont.has(cnpj)) { if (c in r["CONTÁBIL"])   (r["CONTÁBIL"] as any)[c]++;   }
      if (cnpjsFisc.has(cnpj)) { if (c in r["FISCAL"])     (r["FISCAL"] as any)[c]++;     }
      if (cnpjsDp.has(cnpj))   { if (c in r["FOLHA/DP"])   (r["FOLHA/DP"] as any)[c]++;  }
    });

    return r;
  }, [obrigacoes, tagsMap]);

  const byTag = useMemo(() => {
    const m = new Map<string, TagStat>();

    obrigacoes.forEach(e => {
      const cnpj = (e.cnpj || "").replace(/\D/g, "");
      const tags = tagsMap[cnpj] || [];

      // Determinar qual TAG de equipe usar baseado nas TAGs da empresa
      // Prioridade: usar a TAG que corresponde ao departamento da obrigação
      const dep = depFromDepartamento(e.departamento);
      let tag = getTagDepto(tags, dep);

      // Se não tem TAG do depto correspondente, tentar outros deptos
      if (!tag) {
        tag = getTagDepto(tags, "cont") || getTagDepto(tags, "fisc") || getTagDepto(tags, "dp");
      }

      // Se ainda não tem TAG (empresa não está na base), ignorar
      if (!tag) return;

      if (!m.has(tag)) {
        m.set(tag, {
          tag,
          dept: e.departamento || "—",
          coordenador: coordMap[tag] || "",
          antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0, total: 0,
          membros: new Map(),
        });
      }
      const x = m.get(tag)!;
      x.total++;
      const c = statusClass(e.status) as keyof MembroStat;
      if (typeof x[c] === "number") (x[c] as number)++;
      const analista = e.resp_entrega || "";
      if (analista) {
        if (!x.membros.has(analista)) x.membros.set(analista, { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0, total: 0 });
        const mb = x.membros.get(analista)!;
        mb.total++;
        if (typeof mb[c] === "number") (mb[c] as number)++;
      }
    });

    return Array.from(m.values()).sort((a, b) => b.atras - a.atras || b.total - a.total);
  }, [obrigacoes, tagsMap, coordMap]);

  const byCliente = useMemo(() => {
    const m = new Map<string, { cnpj: string; grupo: string; antecip: number; prazo: number; just: number; atras: number; total: number }>();
    obrigacoes.forEach(e => {
      const k = (e.cnpj || "").replace(/\D/g, "") || "—";
      if (!m.has(k)) m.set(k, { cnpj: e.cnpj || "", grupo: grupoEmp(e.cnpj), antecip: 0, prazo: 0, just: 0, atras: 0, total: 0 });
      const x = m.get(k)!;
      x.total++;
      const c = String(statusClass(e.status));
      if (c === "antecip") x.antecip++; else if (c === "just") x.just++; else if (c === "atras" || c === "entAtras") x.atras++; else if (c !== "vencer") x.prazo++;
    });
    return Array.from(m.values()).map(v => ({ ...v, nome: nomeEmp(v.cnpj) })).sort((a, b) => b.atras - a.atras || b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obrigacoes, razaoMap, grupoMap]);

  const gruposUnicos = useMemo(() => Array.from(new Set(byCliente.map(c => c.grupo).filter(Boolean))).sort(), [byCliente]);
  const deptsProcessos = useMemo(() => Array.from(new Set(processos.map(p => p.departamento).filter(Boolean))).sort(), [processos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const equipesTarefas = useMemo(() => Array.from(new Set(tarefas.map(t => tagFromEntrega(t) || t.departamento || "Sem equipe"))).sort(), [tarefas, tagsMap]);

  // Timeline
  const carregarTimeline = useCallback(async () => {
    const { data } = await supabase.from("acessorias_entregas").select("cnpj, competencia, status, departamento").eq("fechado", true).not("competencia", "is", null);
    const rows = (data || []) as unknown as { cnpj: string; competencia: string; status: string; departamento: string }[];
    const justMap = new Map<string, Set<string>>();
    const justCount = new Map<string, number>();
    rows.filter(r => /justif/i.test(r.status || "")).forEach(r => {
      const k = (r.cnpj || "").replace(/\D/g, "");
      if (!justMap.has(k)) justMap.set(k, new Set());
      justMap.get(k)!.add(r.competencia);
      justCount.set(k, (justCount.get(k) || 0) + 1);
    });
    const justRecorrentes = Array.from(justMap.entries()).filter(([, m]) => m.size >= 2).map(([cnpj, meses]) => ({ cnpj, meses: Array.from(meses).sort(), total: justCount.get(cnpj) || 0 })).sort((a, b) => b.meses.length - a.meses.length);

    const atrasMap = new Map<string, { dept: string; meses: Set<string>; total: number }>();
    rows.filter(r => /atras/i.test(r.status || "")).forEach(r => {
      const tags = tagsMap[(r.cnpj || "").replace(/\D/g, "")] || [];
      const dep = depFromDepartamento(r.departamento);
      const tag = getTagDepto(tags, dep) || r.departamento || "Sem equipe";
      if (!atrasMap.has(tag)) atrasMap.set(tag, { dept: r.departamento || "—", meses: new Set(), total: 0 });
      const x = atrasMap.get(tag)!; x.meses.add(r.competencia); x.total++;
    });
    const atrasRecorrentes = Array.from(atrasMap.entries()).filter(([, v]) => v.meses.size >= 2).map(([tag, v]) => ({ tag, dept: v.dept, meses: Array.from(v.meses).sort(), total: v.total })).sort((a, b) => b.meses.length - a.meses.length);
    setTimelineData({ justRecorrentes, atrasRecorrentes });
  }, [tagsMap]);

  useEffect(() => { if (nav === "timeline") void carregarTimeline(); }, [nav, carregarTimeline]);

  // ── Render helper de aba de depto ─────────────────────────────────────────
  function renderDeptTab(navKey: "contabil" | "fiscal" | "folha") {

    const deptLabel = navKey === "contabil" ? "Contábil" : navKey === "fiscal" ? "Fiscal" : "Folha / DP";
    const depCode: "cont" | "fisc" | "dp" = navKey === "contabil" ? "cont" : navKey === "fiscal" ? "fisc" : "dp";

    // CNPJs que têm TAG do departamento
    const cnpjsDoDept = new Set(
      Object.entries(tagsMap)
        .filter(([, tags]) => getTagDepto(tags, depCode) !== "")
        .map(([cnpj]) => cnpj)
    );

    // Palavras-chave do departamento para filtrar campo departamento da API
    // Inclui todos os subdepartamentos que a API pode retornar
    const deptKeywords = depCode === "cont"
      ? ["cont", "financeiro", "declar", "gente", "gestão", "gestao", "doc"]
      : depCode === "fisc"
      ? ["fisc", "fiscal", "tributar"]
      : ["pes", "folha", "dp", "dom", "pessoal", "rh", "recursos humanos"];

    // Filtrar: CNPJ deve ter TAG do depto E campo departamento deve ser compatível
    const deptObrigs = obrigacoes.filter(e => {
      const cnpj = (e.cnpj || "").replace(/\D/g, "");
      if (!cnpjsDoDept.has(cnpj)) return false;
      const dRaw = (e.departamento || "").toLowerCase();
      return deptKeywords.some(k => dRaw.includes(k));
    });

    // Estado e setter para filtro de equipe desta aba
    const fEquipe = depCode === "cont" ? fEquipeCont : depCode === "fisc" ? fEquipeFisc : fEquipeFolha;
    const setFEquipe = depCode === "cont" ? setFEquipeCont : depCode === "fisc" ? setFEquipeFisc : setFEquipeFolha;

    // Equipes disponíveis neste departamento
    const equipesDisponiveis = Array.from(
      new Set(
        deptObrigs.map(e => {
          const cnpj = (e.cnpj || "").replace(/\D/g, "");
          const tags = tagsMap[cnpj] || [];
          return getTagDepto(tags, depCode);
        }).filter(Boolean)
      )
    ).sort();

    // Aplicar filtro de equipe na tabela de obrigações
    const deptObrigsFiltradas = fEquipe
      ? deptObrigs.filter(e => {
          const cnpj = (e.cnpj || "").replace(/\D/g, "");
          const tags = tagsMap[cnpj] || [];
          return getTagDepto(tags, depCode) === fEquipe;
        })
      : deptObrigs;


    const s: Record<string, number> = { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 };
    deptObrigs.forEach(e => { const c = String(statusClass(e.status)); if (c in s) s[c]++; });
    const tot = s.antecip + s.prazo + s.just + s.atras + s.entAtras;
    const pct = tot > 0 ? Math.round((s.antecip + s.prazo) / tot * 100) : 0;

    // Filtrar equipes pelo nome da TAG, não pelo campo dept
    const equipeDept = byTag.filter(t => {
      if (depCode === "cont") return /equipe\s+cont[aá]bil\s*\d+/i.test(t.tag) || (/equipe\s+dedicada/i.test(t.tag) && !(/equipe\s+fiscal/i.test(t.tag) || /equipe\s+dp/i.test(t.tag)));
      if (depCode === "fisc") return /equipe\s+fiscal\s*\d+/i.test(t.tag) || /equipe\s+cbf/i.test(t.tag) || /equipe\s+dedicada/i.test(t.tag);
      return /equipe\s+dp\s*\d+/i.test(t.tag) || /equipe\s+cbf/i.test(t.tag) || /equipe\s+dedicada/i.test(t.tag);
    });

    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
          <KpiCard label="Entregues"      value={s.antecip + s.prazo} accent={C.brand} sub={`${pct}%`} />
          <KpiCard label="Ent. c/ Atraso" value={s.entAtras} accent={C.red} />
          <KpiCard label="Justificadas"   value={s.just} accent={C.amber} />
          <KpiCard label="Atrasada!"      value={s.atras} accent={C.red} sub="risco imediato" />
          <KpiCard label="A Vencer"       value={s.vencer} sub="prazo futuro" />
          <KpiCard label="% Prazo"        value={`${pct}%`} accent={pctColor(pct)} sub="meta: 95%" />
        </div>

        {/* Equipes */}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Equipe {deptLabel}</div>
          {equipeDept.length === 0
            ? <div style={{ color: C.muted, fontSize: 11, textAlign: "center", padding: 20 }}>Sem dados para o período.</div>
            : equipeDept.map(t => {
              const den = t.antecip + t.prazo + t.just + t.atras + t.entAtras;
              const p = Math.round((t.antecip + t.prazo) / Math.max(1, den) * 100);
              const aberto = expanded.has(t.tag);
              return (
                <Fragment key={t.tag}>
                  <div onClick={() => toggleExpand(t.tag)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{aberto ? "▼" : "▶"} {t.tag}</div>
                      <div style={{ fontSize: 9, color: C.muted }}>{t.coordenador || "Coordenador não informado"}</div>
                      <div style={{ height: 3, background: C.dim, borderRadius: 2, overflow: "hidden", marginTop: 3, display: "flex" }}>
                        <div style={{ width: `${p}%`, background: C.brand }} />
                        <div style={{ width: `${Math.round(t.just / Math.max(1, den) * 100)}%`, background: `${C.amber}60` }} />
                        <div style={{ width: `${Math.round((t.atras + t.entAtras) / Math.max(1, den) * 100)}%`, background: C.red }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, minWidth: 50, textAlign: "right" }}>{t.total.toLocaleString("pt-BR")} obrig.</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: pctColor(p), minWidth: 40, textAlign: "right" }}>{p}%</div>
                    {t.atras > 0 && <div style={{ fontSize: 10, color: C.red }}>⚡{t.atras}</div>}
                  </div>
                  {aberto && Array.from(t.membros.entries()).sort((a, b) => b[1].atras - a[1].atras).map(([nome, m]) => {
                    const mDen = m.antecip + m.prazo + m.just + m.atras + m.entAtras;
                    const mp = Math.round((m.antecip + m.prazo) / Math.max(1, mDen) * 100);
                    return (
                      <div key={nome} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 4px 20px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: C.sub }}>↳ {nome}</div>
                          <div style={{ height: 2, background: C.dim, borderRadius: 1, overflow: "hidden", marginTop: 2, display: "flex" }}>
                            <div style={{ width: `${mp}%`, background: C.brand }} />
                            <div style={{ width: `${Math.round(m.just / Math.max(1, mDen) * 100)}%`, background: `${C.amber}60` }} />
                            <div style={{ width: `${Math.round((m.atras + m.entAtras) / Math.max(1, mDen) * 100)}%`, background: C.red }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, minWidth: 50, textAlign: "right" }}>{m.total} obrig.</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: pctColor(mp), minWidth: 40, textAlign: "right" }}>{mp}%</div>
                        {m.atras > 0 && <div style={{ fontSize: 10, color: C.red }}>⚡{m.atras}</div>}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
        </div>

        {/* Tabela de obrigações */}
        <div style={card}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 12, color: C.text, flex: 1 }}>Obrigações do período — {deptLabel}</strong>
            <select
              value={fEquipe}
              onChange={e => setFEquipe(e.target.value)}
              style={{ ...inp, maxWidth: 220 }}
            >
              <option value="">Todas as equipes</option>
              {equipesDisponiveis.map(eq => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
            <input placeholder="Buscar empresa ou obrigação..." value={qDept} onChange={e => setQDept(e.target.value)} style={{ ...inp, width: 240 }} />
          </div>

          <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Empresa</th>
                  <th style={th}>Obrigação</th>
                  <th style={th}>Responsável</th>
                  <th style={th}>Prazo</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {deptObrigsFiltradas
                  .filter(e => { if (!qDept) return true; const q = qDept.toLowerCase(); return nomeEmp(e.cnpj).toLowerCase().includes(q) || (e.nome_entrega || "").toLowerCase().includes(q); })
                  .sort((a, b) => {
                    const aA = String(statusClass(a.status)) === "atras" ? 0 : String(statusClass(a.status)) === "just" ? 1 : String(statusClass(a.status)) === "vencer" ? 3 : 2;
                    const bA = String(statusClass(b.status)) === "atras" ? 0 : String(statusClass(b.status)) === "just" ? 1 : String(statusClass(b.status)) === "vencer" ? 3 : 2;
                    return aA - bA || (a.dt_prazo || "").localeCompare(b.dt_prazo || "");
                  })
                  .slice(0, 500)
                  .map(e => {
                    const cls = String(statusClass(e.status));
                    const bg = cls === "atras" ? "#FC6B6B14" : cls === "just" ? "#E8C54714" : "transparent";
                    return (
                      <tr key={e.id} style={{ background: bg }}>
                        <td style={{ ...td, fontWeight: 600, color: cls === "atras" ? C.red : C.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeEmp(e.cnpj)}</td>
                        <td style={td}>{e.nome_entrega}</td>
                        <td style={{ ...td, color: C.muted }}>{e.resp_entrega || e.resp_prazo || "—"}</td>
                        <td style={{ ...td, color: C.muted, fontSize: 10 }}>{e.dt_prazo || "—"}</td>
                        <td style={td}><StatusBadge s={e.status} /></td>
                      </tr>
                    );
                  })}
                {deptObrigsFiltradas.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Sem obrigações no período.</td></tr>}

              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "inherit" }}>
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}

        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Performance de Entregas</div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em" }}>Planning Hub · Operacional</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {ultimaSinc && <span style={{ fontSize: 10, color: C.muted }}>Última sinc: {new Date(ultimaSinc).toLocaleString("pt-BR")}</span>}
            <input type="date" value={dtIni} onChange={e => setDtIni(e.target.value)} style={inp} />
            <span style={{ fontSize: 11, color: C.muted }}>até</span>
            <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} style={inp} />
            <button style={btn()} onClick={() => void carregar()}>🔄 Recarregar</button>
            {isAdmin && <button style={btn()} onClick={() => void fecharCompetencia()}>🔒 Fechar {dtIni.slice(0, 7)}</button>}
            <button style={btn(true)} disabled={sincronizando} onClick={() => void sincronizar()}>{sincronizando ? "⏳ Sincronizando..." : "🔗 Sincronizar API"}</button>
            {progresso && <span style={{ fontSize: 10, color: C.muted }}>{progresso}</span>}
            {erroSinc && <span style={{ fontSize: 10, color: C.red, maxWidth: 400 }}>{erroSinc}</span>}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading && <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Carregando dados...</div>}

          {!loading && entregas.length === 0 && (
            <div style={{ ...card, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>Nenhum dado encontrado para o período.</div>
              <div style={{ fontSize: 11, color: C.muted }}>Clique em "Sincronizar API" para buscar os dados do Acessórias.</div>
            </div>
          )}

          {/* RESUMO GERAL */}
          {!loading && nav === "geral" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                <KpiCard label="Entregues"          value={stats.antecip + stats.prazo} accent={C.brand} sub="no prazo técnico" />
                <KpiCard label="Ent. c/ Atraso"     value={stats.entAtras} accent={C.red} sub="baixada após prazo" />
                <KpiCard label="Justificadas"       value={stats.just} accent={C.amber} sub="prazo legal ok" />
                <KpiCard label="Atrasada! (aberto)" value={stats.atras} accent={C.red} sub="risco imediato" />
                <KpiCard label="A Vencer"           value={stats.vencer} sub="prazo futuro" />
                <KpiCard label="% Prazo Global"     value={`${stats.pct}%`} accent={pctColor(stats.pct)} sub="meta: 95%" />
              </div>

              {/* Cards de departamento */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                {[
                  { key: "CONTÁBIL", label: "Contábil", accent: "#888" },
                  { key: "FISCAL",   label: "Fiscal",   accent: C.brand },
                  { key: "FOLHA/DP", label: "Folha / DP", accent: C.amber },
                ].map(d => {
                  const v = byDept[d.key] || {};
                  const tot = (v.antecip || 0) + (v.prazo || 0) + (v.just || 0) + (v.atras || 0) + (v.entAtras || 0);
                  const p = tot > 0 ? Math.round(((v.antecip || 0) + (v.prazo || 0)) / tot * 100) : 0;
                  const pL = tot > 0 ? Math.round(((v.antecip || 0) + (v.prazo || 0) + (v.just || 0)) / tot * 100) : 0;
                  const status = p >= 95 ? "META ATINGIDA" : p >= 80 ? "ATENÇÃO" : "CRÍTICO";
                  const sc = p >= 95 ? C.brand : p >= 80 ? C.amber : C.red;
                  return (
                    <div key={d.key} style={{ ...card, borderTop: `2px solid ${d.accent}`, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{d.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: `${sc}18`, color: sc }}>{status}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                        <div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px" }}><div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>% Prazo Técnico</div><div style={{ fontSize: 16, fontWeight: 700, color: pctColor(p) }}>{p}%</div></div>
                        <div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px" }}><div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>% Prazo Legal</div><div style={{ fontSize: 16, fontWeight: 700, color: pctColor(pL) }}>{pL}%</div></div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 10 }}>
                        <span style={{ color: C.brand }}>✦ {v.antecip || 0}</span>
                        <span style={{ color: C.muted }}>· ✓ {v.prazo || 0}</span>
                        <span style={{ color: C.amber }}>· ⚠ {v.just || 0}</span>
                        <span style={{ color: C.red }}>· ⚡ {v.atras || 0}</span>
                        <span style={{ color: C.muted }}>· ⏳ {v.vencer || 0}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: C.dim, overflow: "hidden", display: "flex", marginTop: 8 }}>
                        <div style={{ width: `${p}%`, background: C.brand }} />
                        <div style={{ width: `${Math.round((v.just || 0) / Math.max(1, tot) * 100)}%`, background: `${C.amber}60` }} />
                        <div style={{ width: `${Math.round(((v.atras || 0) + (v.entAtras || 0)) / Math.max(1, tot) * 100)}%`, background: C.red }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Performance por equipe separada por departamento */}
              {["CONTÁBIL", "FISCAL", "FOLHA/DP"].map(dKey => {
                const depCode: "cont" | "fisc" | "dp" = dKey === "CONTÁBIL" ? "cont" : dKey === "FISCAL" ? "fisc" : "dp";
                const equipas = byTag.filter(t => {
                  if (depCode === "cont") return /equipe\s+cont[aá]bil\s*\d+/i.test(t.tag);
                  if (depCode === "fisc") return /equipe\s+fiscal\s*\d+/i.test(t.tag) || /equipe\s+cbf/i.test(t.tag);
                  return /equipe\s+dp\s*\d+/i.test(t.tag) || /equipe\s+cbf/i.test(t.tag);
                });
                if (equipas.length === 0) return null;
                return (
                  <div key={dKey} style={{ ...card, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                      {dKey === "CONTÁBIL" ? "Contábil" : dKey === "FISCAL" ? "Fiscal" : "Folha / DP"} — por equipe
                    </div>
                    {equipas.map(t => {
                      const den = t.antecip + t.prazo + t.just + t.atras + t.entAtras;
                      const p = Math.round((t.antecip + t.prazo) / Math.max(1, den) * 100);
                      return (
                        <div key={t.tag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.tag}</div>
                            <div style={{ fontSize: 9, color: C.muted }}>{t.coordenador || "Coordenador não informado"}</div>
                          </div>
                          <div style={{ fontSize: 10, color: C.muted, minWidth: 60, textAlign: "right" }}>{t.total.toLocaleString("pt-BR")} obrig.</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: pctColor(p), minWidth: 40, textAlign: "right" }}>{p}%</div>
                          {t.atras > 0 && <div style={{ fontSize: 10, color: C.red }}>⚡{t.atras}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* DEPTO TABS */}
          {!loading && nav === "contabil" && renderDeptTab("contabil")}
          {!loading && nav === "fiscal"   && renderDeptTab("fiscal")}
          {!loading && nav === "folha"    && renderDeptTab("folha")}

          {/* POR CLIENTE */}
          {!loading && nav === "clientes" && (
            <div style={card}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 12, color: C.text, flex: 1 }}>Por Empresa / Grupo</strong>
                <select value={qGrupo} onChange={e => setQGrupo(e.target.value)} style={{ ...inp, maxWidth: 220 }}>
                  <option value="">Todos os grupos</option>
                  {gruposUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input placeholder="Buscar empresa..." value={qCli} onChange={e => setQCli(e.target.value)} style={{ ...inp, width: 220 }} />
              </div>
              <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Grupo</th><th style={th}>Empresa</th><th style={th}>Total</th><th style={{ ...th, color: C.brand }}>✦</th><th style={{ ...th, color: C.sub }}>✓</th><th style={{ ...th, color: C.amber }}>⚠</th><th style={{ ...th, color: C.red }}>⚡</th><th style={th}>Distribuição</th></tr></thead>
                  <tbody>
                    {byCliente.filter(c => !qGrupo || c.grupo === qGrupo).filter(c => !qCli || c.nome.toLowerCase().includes(qCli.toLowerCase()) || (c.grupo || "").toLowerCase().includes(qCli.toLowerCase())).slice(0, 300).map((c, i) => {
                      const pOk = Math.round((c.antecip + c.prazo) / Math.max(1, c.total) * 100);
                      const pJ  = Math.round(c.just / Math.max(1, c.total) * 100);
                      const pAt = Math.round(c.atras / Math.max(1, c.total) * 100);
                      return (
                        <tr key={c.cnpj || c.nome} style={{ background: i % 2 === 0 ? "transparent" : C.card2 }}>
                          <td style={{ ...td, color: C.muted, fontSize: 10 }}>{c.grupo || "—"}</td>
                          <td style={{ ...td, fontWeight: 600, color: C.text, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{c.total}</td>
                          <td style={{ ...td, color: c.antecip > 0 ? C.brand : C.muted }}>{c.antecip}</td>
                          <td style={{ ...td, color: C.muted }}>{c.prazo}</td>
                          <td style={{ ...td, color: c.just > 0 ? C.amber : C.muted }}>{c.just}</td>
                          <td style={{ ...td, color: c.atras > 0 ? C.red : C.muted, fontWeight: 700 }}>{c.atras}</td>
                          <td style={{ minWidth: 120, ...td }}>
                            <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: C.dim }}>
                              <div style={{ width: `${pOk}%`, background: C.brand }} />
                              <div style={{ width: `${pJ}%`, background: `${C.amber}60` }} />
                              <div style={{ width: `${pAt}%`, background: C.red }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LINHA DO TEMPO */}
          {!loading && nav === "timeline" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn(tlTab === "just")} onClick={() => setTlTab("just")}>Justificativas recorrentes</button>
                <button style={btn(tlTab === "atras")} onClick={() => setTlTab("atras")}>Atrasos recorrentes</button>
              </div>
              {!timelineData && <div style={{ ...card, padding: 30, textAlign: "center", color: C.muted }}>Carregando...</div>}
              {timelineData && tlTab === "just" && (
                <div style={card}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                    <strong style={{ fontSize: 12, color: C.text }}>Empresas com justificativas recorrentes (2+ competências)</strong>
                  </div>
                  <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><th style={th}>Empresa</th><th style={th}>Grupo</th><th style={th}>Nº meses</th><th style={th}>Total</th><th style={th}>Meses</th></tr></thead>
                      <tbody>
                        {timelineData.justRecorrentes.length === 0
                          ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Feche ao menos 2 competências para ver recorrências.</td></tr>
                          : timelineData.justRecorrentes.map(r => (
                            <tr key={r.cnpj}>
                              <td style={{ ...td, fontWeight: 600, color: C.text }}>{nomeEmp(r.cnpj)}</td>
                              <td style={{ ...td, color: C.muted }}>{grupoEmp(r.cnpj) || "—"}</td>
                              <td style={{ ...td, fontWeight: 700, color: C.amber }}>{r.meses.length}</td>
                              <td style={td}>{r.total}</td>
                              <td style={td}>{r.meses.map(m => <span key={m} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${C.amber}22`, color: C.amber, marginRight: 4 }}>{m}</span>)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {timelineData && tlTab === "atras" && (
                <div style={card}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                    <strong style={{ fontSize: 12, color: C.text }}>Equipes com atrasos recorrentes (2+ competências)</strong>
                  </div>
                  <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><th style={th}>Equipe</th><th style={th}>Departamento</th><th style={th}>Coordenador</th><th style={th}>Nº meses</th><th style={th}>Total</th><th style={th}>Meses</th></tr></thead>
                      <tbody>
                        {timelineData.atrasRecorrentes.length === 0
                          ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Feche ao menos 2 competências para ver recorrências.</td></tr>
                          : timelineData.atrasRecorrentes.map(r => (
                            <tr key={r.tag}>
                              <td style={{ ...td, fontWeight: 600, color: C.text }}>{r.tag}</td>
                              <td style={{ ...td, color: C.muted }}>{r.dept}</td>
                              <td style={{ ...td, color: C.sub }}>{coordMap[r.tag] || "—"}</td>
                              <td style={{ ...td, fontWeight: 700, color: C.red }}>{r.meses.length}</td>
                              <td style={td}>{r.total}</td>
                              <td style={td}>{r.meses.map(m => <span key={m} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${C.red}22`, color: C.red, marginRight: 4 }}>{m}</span>)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAREFAS */}
          {!loading && nav === "tarefas" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                <KpiCard label="Total"       value={tarefas.length} />
                <KpiCard label="Concluídas"  value={tarefas.filter(t => t.dt_finalizacao && t.dt_finalizacao !== "0000-00-00 00:00:00").length} accent={C.brand} />
                <KpiCard label="Andamento"   value={tarefas.filter(t => !t.dt_finalizacao || t.dt_finalizacao === "0000-00-00 00:00:00").length} accent={C.amber} />
                <KpiCard label="% Conclusão" value={`${tarefas.length > 0 ? Math.round(tarefas.filter(t => t.dt_finalizacao && t.dt_finalizacao !== "0000-00-00 00:00:00").length / tarefas.length * 100) : 0}%`} accent={C.brand} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={fTarefaEquipe} onChange={e => setFTarefaEquipe(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
                  <option value="">Filtrar por equipe</option>
                  {equipesTarefas.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div style={card}>
                <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Empresa</th><th style={th}>Tarefa</th><th style={th}>Equipe</th><th style={th}>Departamento</th><th style={th}>Responsável</th><th style={th}>Prazo</th><th style={th}>Status</th></tr></thead>
                    <tbody>
                      {tarefas.filter(t => !fTarefaEquipe || tagFromEntrega(t) === fTarefaEquipe).slice(0, 300).map((t, i) => {
                        const concl = !!t.dt_finalizacao && t.dt_finalizacao !== "0000-00-00 00:00:00";
                        return (
                          <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : C.card2 }}>
                            <td style={{ ...td, fontWeight: 600, color: C.text }}>{nomeEmp(t.cnpj)}</td>
                            <td style={td}>{t.nome_entrega}</td>
                            <td style={{ ...td, color: C.sub, fontSize: 10 }}>{tagFromEntrega(t)}</td>
                            <td style={td}><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: C.dim, color: C.sub }}>{t.departamento}</span></td>
                            <td style={{ ...td, color: C.muted }}>{t.resp_entrega || "—"}</td>
                            <td style={{ ...td, color: C.muted, fontSize: 10 }}>{t.dt_prazo || "—"}</td>
                            <td style={td}><span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: concl ? `${C.brand}18` : `${C.amber}18`, color: concl ? C.brand : C.amber }}>{concl ? "✓ Concluída" : "⏳ Andamento"}</span></td>
                          </tr>
                        );
                      })}
                      {tarefas.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Nenhuma tarefa no período.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PROCESSOS */}
          {!loading && nav === "processos" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
                <KpiCard label="Em andamento" value={processos.filter(p => procStatusInfo(p.status).label === "Em andamento").length} accent={C.brand} />
                <KpiCard label="Concluídos"   value={processos.filter(p => procStatusInfo(p.status).label === "Concluído").length} accent={C.brand} />
                <KpiCard label="Atrasados"    value={processos.filter(p => procStatusInfo(p.status).label === "Atrasado").length} accent={C.red} />
                <KpiCard label="Suspensos"    value={processos.filter(p => procStatusInfo(p.status).label === "Suspenso").length} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Buscar processo ou empresa..." value={qProc} onChange={e => setQProc(e.target.value)} style={{ ...inp, width: 260 }} />
                <select value={fProcStatus} onChange={e => setFProcStatus(e.target.value)} style={inp}>
                  <option value="">Todos os status</option>
                  <option value="andamento">Em andamento</option>
                  <option value="concluido">Concluídos</option>
                  <option value="atrasado">Atrasados</option>
                  <option value="suspenso">Suspensos</option>
                </select>
                <select value={fProcDept} onChange={e => setFProcDept(e.target.value)} style={{ ...inp, maxWidth: 220 }}>
                  <option value="">Todos os departamentos</option>
                  {deptsProcessos.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={card}>
                <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Processo</th><th style={th}>Empresa</th><th style={th}>Departamento</th><th style={th}>Gestor</th><th style={th}>Início</th><th style={th}>Previsão</th><th style={{ ...th, minWidth: 120 }}>Progresso</th><th style={th}>Status</th></tr></thead>
                    <tbody>
                      {processos.filter(p => {
                        if (fProcDept && p.departamento !== fProcDept) return false;
                        if (qProc) { const q = qProc.toLowerCase(); if (!(p.nome_processo || "").toLowerCase().includes(q) && !nomeEmp(p.cnpj).toLowerCase().includes(q)) return false; }
                        if (fProcStatus) { const { label } = procStatusInfo(p.status); if (fProcStatus === "andamento" && !label.includes("andamento")) return false; if (fProcStatus === "concluido" && !label.includes("Concluído")) return false; if (fProcStatus === "atrasado" && !label.includes("Atrasado")) return false; if (fProcStatus === "suspenso" && !label.includes("Suspenso")) return false; }
                        return true;
                      }).slice(0, 300).map((p, i) => {
                        const { label, color } = procStatusInfo(p.status);
                        const pct = Math.min(100, Math.max(0, p.porcentagem || 0));
                        const barColor = pct >= 100 ? C.brand : pct >= 60 ? "#555555" : pct >= 30 ? C.amber : C.red;
                        return (
                          <tr key={p.id} style={{ background: i % 2 === 0 ? "transparent" : C.card2 }}>
                            <td style={{ ...td, fontWeight: 600, color: C.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome_processo}</td>
                            <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeEmp(p.cnpj)}</td>
                            <td style={td}><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: C.dim, color: C.sub }}>{p.departamento}</span></td>
                            <td style={{ ...td, color: C.muted, fontSize: 10 }}>{(p.gestor || "—").split(" ")[0]}</td>
                            <td style={{ ...td, fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{p.dt_inicio || "—"}</td>
                            <td style={{ ...td, fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{p.dt_conclusao || "—"}</td>
                            <td style={td}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ flex: 1, height: 6, background: C.dim, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: barColor }} /></div>
                                <span style={{ fontSize: 10, color: barColor, fontWeight: 700, minWidth: 30, textAlign: "right" }}>{pct}%</span>
                              </div>
                            </td>
                            <td style={td}><span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: `${color}18`, color }}>{label}</span></td>
                          </tr>
                        );
                      })}
                      {processos.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Nenhum processo. Sincronize a API para carregar.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
