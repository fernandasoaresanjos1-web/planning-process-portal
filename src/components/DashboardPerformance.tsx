// DashboardPerformance.tsx
// Dashboard de Performance de Entregas, Tarefas e Processos
// Integrado com API Acessórias via tabelas Supabase:
//   acessorias_entregas · acessorias_processos

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  sincronizarPaginaEntregas,
  sincronizarPaginaProcessos,
} from "@/lib/acessorias-entregas.functions";
import { listEmpresasAtivas } from "@/lib/empresas-mensal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";



// ─── Paleta Planning Hub ───────────────────────────────────────────────────
const C = {
  brand:   "#00BF63",
  red:     "#FC6B6B",
  amber:   "#E8C547",
  bg:      "#0C0C0C",
  card:    "#111111",
  card2:   "#1A1A1A",
  border:  "#2C2C2C",
  border2: "#333333",
  text:    "#FAFAFA",
  sub:     "#CDCDCD",
  muted:   "#646464",
  dim:     "#3A3A3A",
};

// ─── Tipos ────────────────────────────────────────────────────────────────
type EmpresaBase = Awaited<ReturnType<typeof listEmpresasAtivas>>[number];

type EntregaApi = {
  id: string;
  cnpj: string;
  razao: string;
  nome_entrega: string;
  tipo: string; // 'O' obrigação | 'T' tarefa
  status: string;
  departamento: string;
  resp_entrega: string;
  resp_prazo: string;
  dt_prazo: string;
  dt_finalizacao: string;
};

type ProcessoApi = {
  id: string;
  cnpj: string;
  razao: string;
  nome_processo: string;
  status: string;
  porcentagem: number;
  departamento: string;
  gestor: string;
  dt_inicio: string;
  dt_conclusao: string;
};

type NavId =
  | "geral" | "contabil" | "fiscal" | "folha"
  | "equipe" | "clientes" | "timeline"
  | "tarefas" | "processos";


// Normalização idêntica ao tags-empresas.ts ("Equipe DP 1" / "DP - 1" → "dp 1")
const normalizeTag = (v: string) =>
  (v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\bequipe\b/gi, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function fmtCnpjView(v: string) {
  const d = (v || "").replace(/\D/g, "");


  if (d.length !== 14) return v || "—";
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

// ─── Helpers de estilo ────────────────────────────────────────────────────
const card = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  overflow: "hidden" as const,
};
const th: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: C.muted,
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: `1px solid ${C.border}`,
  background: C.card2,
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
};
const td: React.CSSProperties = {
  fontSize: 11,
  color: C.sub,
  padding: "6px 10px",
  borderBottom: `1px solid ${C.card2}`,
  verticalAlign: "middle",
};
const btn = (active?: boolean): React.CSSProperties => ({
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 600,
  padding: "5px 12px",
  borderRadius: 6,
  border: `1px solid ${active ? C.brand : C.border}`,
  background: active ? C.brand : "transparent",
  color: active ? "#0C0C0C" : C.sub,
  cursor: "pointer",
});
const inp: React.CSSProperties = {
  fontFamily: "inherit",
  fontSize: 11,
  padding: "5px 10px",
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: C.card2,
  color: C.text,
};

// ─── Helpers lógicos ──────────────────────────────────────────────────────
function statusClass(s: string) {
  const l = (s || "").toLowerCase().trim();
  // Entregues (com ou sem atraso)
  if (l.includes("antecip")) return "antecip";
  if (l.includes("pztéc") || l.includes("pztec") || l === "prazo técnico" || l === "prazo tecnico") return "prazo";
  if (l.includes("ent. atrasada") || l === "ent. atrasada") return "entAtras";
  if (l.includes("ent. justificada")) return "prazo"; // entregue com justificativa
  // Em aberto
  if (l.includes("atrasada!")) return "atras";
  if (l.includes("atraso justificado") || l.includes("pend. justificada") || l.includes("justif")) return "just";
  if (l.includes("pendente")) return "vencer";
  return "prazo";
}
function statusLabel(s: string) {
  const c = statusClass(s);
  if (c === "antecip") return "✦ Entregue antecipado";
  if (c === "prazo") return "✓ Entregue";
  if (c === "entAtras") return "⚡ Ent. com atraso";
  if (c === "atras") return "⚡ Atrasada!";
  if (c === "just") return "⚠ Justificada";
  if (c === "vencer") return "🕒 A Vencer";
  return "✓ Entregue";
}
function statusColor(cls: string) {
  if (cls === "antecip") return C.brand;
  if (cls === "prazo") return C.brand;
  if (cls === "entAtras") return C.red;
  if (cls === "atras") return C.red;
  if (cls === "just") return C.amber;
  if (cls === "vencer") return C.muted;
  return C.sub;
}
function pctColor(p: number) {
  return p >= 95 ? C.brand : p >= 80 ? C.amber : C.red;
}
function procStatusInfo(s: string) {
  const l = (s || "").toLowerCase();
  if (l === "a" || l.includes("andamento")) return { label: "Em andamento", color: C.brand };
  if (l === "c" || l.includes("conclu")) return { label: "Concluído", color: C.brand };
  if (l === "s" || l.includes("suspen")) return { label: "Suspenso", color: C.muted };
  if (l.includes("atras")) return { label: "Atrasado", color: C.red };
  return { label: s, color: C.muted };
}
function initials(n: string) {
  const p = (n || "").trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[p.length - 1][0] : (p[0] || "?").slice(0, 2);
}
const AVATAR_COLORS = ["#6366f1","#ec4899","#14b8a6","#f97316","#8b5cf6","#06b6d4","#84cc16"];

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
  const cls = statusClass(s);
  const color = cls === "vencer" ? C.muted : statusColor(cls);
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8,
      background: `${color}18`, color,
    }}>
      {statusLabel(s)}
    </span>
  );
}

function DeptCard({
  title, status, prazoTec, prazoLegal,
  antecip, prazo, just, atras, vencer,
  accent,
}: {
  title: string; status: "CRÍTICO" | "ATENÇÃO" | "META ATINGIDA";
  prazoTec: number; prazoLegal: number;
  antecip: number; prazo: number; just: number; atras: number; vencer: number;
  accent: string;
}) {
  const statusColor = status === "CRÍTICO" ? C.red : status === "ATENÇÃO" ? C.amber : C.brand;
  const tot = antecip + prazo + just + atras + vencer;
  const pA = tot > 0 ? Math.round((antecip + prazo) / tot * 100) : 0;
  const pJ = tot > 0 ? Math.round(just / tot * 100) : 0;
  const pAt = tot > 0 ? Math.round(atras / tot * 100) : 0;

  return (
    <div style={{ ...card, borderTop: `2px solid ${accent}`, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: `${statusColor}18`, color: statusColor }}>{status}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
        <div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>% Prazo Técnico</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: pctColor(prazoTec) }}>{prazoTec}%</div>
        </div>
        <div style={{ background: C.bg, borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>% Prazo Legal</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: pctColor(prazoLegal) }}>{prazoLegal}%</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, fontSize: 10 }}>
        <span style={{ color: C.brand }}>✦ {antecip.toLocaleString("pt-BR")}</span>
        <span style={{ color: C.muted }}>· ✓ {prazo.toLocaleString("pt-BR")}</span>
        <span style={{ color: C.amber }}>· ⚠ {just.toLocaleString("pt-BR")}</span>
        <span style={{ color: C.red }}>· ⚡ {atras.toLocaleString("pt-BR")}</span>
        {vencer > 0 && <span style={{ color: C.muted }}>· ⏳ {vencer.toLocaleString("pt-BR")}</span>}
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.dim, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${pA}%`, background: C.brand }} />
        <div style={{ width: `${pJ}%`, background: C.dim }} />
        <div style={{ width: `${pAt}%`, background: C.red }} />
      </div>
    </div>
  );
}

function GaugeRow({ nome, dept, total, antecip, prazo, just, atras, idx }: {
  nome: string; dept: string; total: number;
  antecip: number; prazo: number; just: number; atras: number; idx: number;
}) {
  const pOk = total > 0 ? Math.round((antecip + prazo) / total * 100) : 0;
  const pJ = total > 0 ? Math.round(just / total * 100) : 0;
  const pAt = total > 0 ? Math.round(atras / total * 100) : 0;
  const cor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${cor}20`, color: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
        {initials(nome)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</div>
        <div style={{ fontSize: 9, color: C.muted }}>{dept}</div>
        <div style={{ height: 3, background: C.dim, borderRadius: 2, overflow: "hidden", marginTop: 3, display: "flex" }}>
          <div style={{ width: `${pOk}%`, background: C.brand }} />
          <div style={{ width: `${pJ}%`, background: C.amber + "60" }} />
          <div style={{ width: `${pAt}%`, background: C.red }} />
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: pctColor(Math.round((antecip + prazo) / Math.max(1, total) * 100)), minWidth: 40, textAlign: "right" }}>
        {Math.round((antecip + prazo) / Math.max(1, total) * 100)}%
      </div>
      {atras > 0 && <div style={{ fontSize: 10, color: C.red, whiteSpace: "nowrap" }}>⚡{atras}</div>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────
export default function DashboardPerformance() {
  const [nav, setNav] = useState<NavId>("geral");
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [entregas, setEntregas] = useState<EntregaApi[]>([]);
  const [processos, setProcessos] = useState<ProcessoApi[]>([]);
  const [dtIni, setDtIni] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dtFim, setDtFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [ultimaSinc, setUltimaSinc] = useState<string | null>(null);
  const [qCli, setQCli] = useState("");
  const [qGrupo, setQGrupo] = useState("");
  const [qEquipe, setQEquipe] = useState("");
  const [qProc, setQProc] = useState("");
  const [fProcStatus, setFProcStatus] = useState("");
  const [fProcDept, setFProcDept] = useState("");
  const [qDept, setQDept] = useState("");
  const [fTarefaEquipe, setFTarefaEquipe] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [razaoMap, setRazaoMap] = useState<Record<string, string>>({});
  const [grupoMap, setGrupoMap] = useState<Record<string, string>>({});
  const [coordMap, setCoordMap] = useState<Record<string, string>>({});
  const [tlTab, setTlTab] = useState<"just" | "atras">("just");
  const [timelineData, setTimelineData] = useState<{
    justRecorrentes: Array<{ cnpj: string; meses: string[]; total: number }>;
    atrasRecorrentes: Array<{ tag: string; dept: string; meses: string[]; total: number }>;
  } | null>(null);
  const { isAdmin } = useAuth();

  const toggleExpand = (t: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(t)) n.delete(t); else n.add(t);
    return n;
  });
  const nomeEmp = (cnpj: string) => razaoMap[(cnpj || "").replace(/\D/g, "")] || fmtCnpjView(cnpj);
  const grupoEmp = (cnpj: string) => grupoMap[(cnpj || "").replace(/\D/g, "")] || "";

  // ── Carregar do Supabase ──────────────────────────────────────────────
  // ── Base de empresas válidas (mesmo universo da Base Info Empresas) ──
  const [empresasValidas, setEmpresasValidas] = useState<Set<string>>(new Set());
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});

  // Helper idêntico ao getTagDepto da Base Info Empresas
  function getTagDepto(cnpj: string, dep: "dp" | "cont" | "fisc"): string {
    const tags = tagsMap[(cnpj || "").replace(/\D/g, "")] || [];
    return tags.find((t) => {
      if (dep === "dp")   return /equipe\s+dp\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t);
      if (dep === "cont") return /equipe\s+cont[aá]bil\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t);
      if (dep === "fisc") return /equipe\s+fiscal\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t);
      return false;
    }) || "";
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // Carregar empresas igual à auditoria cadastral
      const linhas = await listEmpresasAtivas();

      // Montar tagsMap igual à auditoria — tags como array de strings
      const tm: Record<string, string[]> = {};
      const gm2: Record<string, string> = {};
      const rm2: Record<string, string> = {};

      linhas.forEach((l: EmpresaBase) => {
        const d = (l.dados || {}) as Record<string, unknown>;
        const cnpjRaw = String(l.cnpj || d["CNPJ"] || d["CPF/CNPJ"] || "").replace(/\D/g, "");
        if (!cnpjRaw) return;

        // TAGs: mesmo parsing da auditoria
        const tagsRaw = String(
          (d["Tags"] ?? d["tags"] ?? (l.tags || []).join(", ")) || ""
        ).trim();
        const tags = tagsRaw
          ? tagsRaw.split(",").map((t: string) => t.trim()).filter((t: string) => t && t !== "CX")
          : [];

        if (tags.length > 0) tm[cnpjRaw] = tags;

        // Grupo
        const grupo = String(l.grupo ?? d["Grupo de Empresas"] ?? "").trim();
        if (grupo) gm2[cnpjRaw] = grupo;

        // Razão
        const razao = String(l.razao ?? d["Razão social"] ?? d["Razao social"] ?? "").trim();
        if (razao) rm2[cnpjRaw] = razao;
      });

      setEmpresasValidas(new Set(Object.keys(tm)));
      setTagsMap(tm);
      setGrupoMap(gm2);

      // 1b. Coordenadores por TAG (tags_base) — usar só key
      const { data: tagsBase } = await supabase
        .from("tags_base")
        .select("key, coord")
        .not("coord", "is", null)
        .neq("coord", "");
      const cm: Record<string, string> = {};
      ((tagsBase || []) as { key: string; coord: string }[]).forEach(t => {
        const k = normalizeTag(String(t.key ?? ""));
        if (k && t.coord) cm[k] = t.coord;
      });
      setCoordMap(cm);

      // 2. Carregar entregas do período + atrasadas em aberto de períodos anteriores,
      //    processos (todos) e nomes de empresas da API
      const [{ data: ePeriodo }, { data: eAberto }, { data: p }, { data: emp }] = await Promise.all([
        supabase.from("acessorias_entregas")
          .select("*")
          .gte("dt_prazo", dtIni)
          .lte("dt_prazo", dtFim)
          .limit(50000)
          .order("dt_prazo", { ascending: false }),
        supabase.from("acessorias_entregas")
          .select("*")
          .or("dt_finalizacao.is.null,dt_finalizacao.eq.,dt_finalizacao.eq.0000-00-00 00:00:00")
          .lt("dt_prazo", dtIni)
          .limit(50000)
          .order("dt_prazo", { ascending: false }),
        supabase.from("acessorias_processos")
          .select("*")
          .order("dt_inicio", { ascending: false }),
        supabase.from("acessorias_api_empresas").select("cnpj,razao"),
      ]);

      const allEntregas = [...(ePeriodo || []), ...(eAberto || [])];
      const e = [...new Map((allEntregas as EntregaApi[]).map(r => [r.id, r])).values()];

      // Complementar razaoMap com dados da API (prioridade maior)
      const rm: Record<string, string> = { ...rm2 };
      ((emp || []) as { cnpj: string; razao: string | null }[]).forEach(r => {
        const k = (r.cnpj || "").replace(/\D/g, "");
        if (k && r.razao) rm[k] = r.razao;
      });
      setRazaoMap(rm);


      setEntregas(e);
      setProcessos((p || []) as ProcessoApi[]);


      if ((e || []).length > 0) {
        const maxSinc = ((e || []) as { sincronizado_em?: string }[]).reduce<string>(
          (m, r) => ((r.sincronizado_em ?? "") > m ? (r.sincronizado_em ?? "") : m), ""
        );
        setUltimaSinc(maxSinc);
      }


    } catch (err) {
      console.error("Erro ao carregar:", err);
    } finally {
      setLoading(false);
    }
  }, [dtIni, dtFim]);

  useEffect(() => { void carregar(); }, [carregar]);

  // ── Sincronizar via server functions ─────────────────────────────────
  const syncEntregas  = useServerFn(sincronizarPaginaEntregas);
  const syncProcessos = useServerFn(sincronizarPaginaProcessos);

  const [progresso, setProgresso] = useState<{ tipo: string; pagina: number; gravadas: number; detalhe?: string } | null>(null);
  const [erroSinc, setErroSinc] = useState<string | null>(null);

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    setErroSinc(null);
    let totalGravadas = 0;
    let gravadasEntregas = 0;
    let diagEntregas = "";

    try {
      // 1. Entregas/Tarefas: consulta por empresa, em lotes de 5 CNPJs
      const linhasSync = await listEmpresasAtivas();
      const tmap: Record<string, string[]> = {};
      linhasSync.forEach((l: EmpresaBase) => {
        const d = (l.dados || {}) as Record<string, unknown>;
        const cnpjRaw = String(l.cnpj || d["CNPJ"] || d["CPF/CNPJ"] || "").replace(/\D/g, "");
        if (!cnpjRaw) return;
        const tagsRaw = String((d["Tags"] ?? d["tags"] ?? (l.tags || []).join(", ")) || "").trim();
        const tags = tagsRaw
          ? tagsRaw.split(",").map((t: string) => t.trim()).filter((t: string) => t && t !== "CX")
          : [];
        if (tags.length > 0) tmap[cnpjRaw] = tags;
      });
      const todos = linhasSync
        .map((l: EmpresaBase) => String(l.cnpj || "").replace(/\D/g, ""))
        .filter((c: string) => c.length >= 11);
      const comTag = todos.filter((c: string) => (tmap[c] || []).length > 0);
      // Fallback: se o cruzamento de TAGs falhar, sincroniza todas as empresas
      const cnpjsValidos = comTag.length > 0 ? comTag : todos;
      console.log("[sync] empresas:", linhasSync.length, "com TAG:", comTag.length, "a sincronizar:", cnpjsValidos.length, cnpjsValidos.slice(0, 3));


      if (cnpjsValidos.length === 0) {
        setErroSinc("Nenhum CNPJ encontrado na Base Info Empresas para sincronizar. Atualize a base de empresas antes de sincronizar.");
      }

      const LOTE = 5;
      for (let i = 0; i < cnpjsValidos.length; i += LOTE) {
        const lote = cnpjsValidos.slice(i, i + LOTE);
        const res = await syncEntregas({ data: { dtInicial: dtIni, dtFinal: dtFim, cnpjs: lote } });
        if (!res.configurado) { setErroSinc(res.error || "Token não configurado"); break; }
        if (res.error) { setErroSinc(res.error); break; }
        totalGravadas += res.gravadas;
        gravadasEntregas += res.gravadas;
        if (res.debug) diagEntregas = `HTTP ${res.debug.http} · corpo ${res.debug.bodyLen} bytes`;
        setProgresso({
          tipo: "Entregas", pagina: 0, gravadas: gravadasEntregas,
          detalhe: `empresa ${Math.min(i + LOTE, cnpjsValidos.length)}/${cnpjsValidos.length} · ${gravadasEntregas} gravadas`,
        });
        // Rate limit 100 req/min
        await new Promise(r => setTimeout(r, 350));
      }

      if (gravadasEntregas === 0 && diagEntregas) {
        setErroSinc(`A API não retornou entregas/tarefas no período ${dtIni} a ${dtFim} (${diagEntregas}). Verifique se o token tem permissão no módulo Entregas do Acessórias.`);
      }

      // 2. Sincronizar Processos em loop paginado
      for (let pagina = 1; pagina <= 100; pagina++) {
        const res = await syncProcessos({ data: { dtInicial: dtIni, dtFinal: dtFim, pagina } });
        if (!res.configurado || res.error) break;
        totalGravadas += res.gravadas;
        setProgresso({ tipo: "Processos", pagina, gravadas: totalGravadas });
        if (res.fim) break;
        await new Promise(r => setTimeout(r, 650));
      }

      // 3. Recarregar dados do banco
      await carregar();
    } finally {
      setSincronizando(false);
      setProgresso(null);
    }
  }

  // ── Cálculos derivados ────────────────────────────────────────────────
  const obrigacoes = useMemo(() => entregas.filter(e => e.tipo !== "T"), [entregas]);
  const tarefas    = useMemo(() => entregas.filter(e => e.tipo === "T"), [entregas]);

  const stats = useMemo(() => {
    const cnt = { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 };
    obrigacoes.forEach(e => {
      const c = statusClass(e.status);
      if (c === "antecip") cnt.antecip++;
      else if (c === "prazo") cnt.prazo++;
      else if (c === "just") cnt.just++;
      else if (c === "atras") cnt.atras++;
      else if (c === "entAtras") cnt.entAtras++;
      else if (c === "vencer") cnt.vencer++;
    });
    const totFechados = cnt.antecip + cnt.prazo + cnt.just + cnt.atras + cnt.entAtras;
    const pct = totFechados > 0 ? Math.round((cnt.antecip + cnt.prazo) / totFechados * 100) : 0;
    return { ...cnt, tot: totFechados + cnt.vencer, pct };
  }, [obrigacoes]);

  const byDept = useMemo(() => {
    type DeptStat = { antecip: number; prazo: number; just: number; atras: number; entAtras: number; vencer: number };
    const result: Record<string, DeptStat> = {
      "CONTÁBIL": { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 },
      "FISCAL":   { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 },
      "FOLHA/DP": { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 },
    };

    obrigacoes.forEach(e => {
      const cnpjD = (e.cnpj || "").replace(/\D/g, "");
      const tgs = tagsMap[cnpjD] || [];
      const hasCont = !!tgs.find(t => /equipe\s+cont/i.test(t) || /equipe\s+dedicada/i.test(t));
      const hasFisc = !!tgs.find(t => /equipe\s+fiscal/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t));
      const hasDp   = !!tgs.find(t => /equipe\s+dp/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t));
      const dRaw = (e.departamento || "").toUpperCase();
      const key = (hasCont && dRaw.includes("CONT")) ? "CONTÁBIL"
        : (hasFisc && dRaw.includes("FISC")) ? "FISCAL"
        : (hasDp && (dRaw.includes("PES") || dRaw.includes("FOLHA") || dRaw.includes("DP"))) ? "FOLHA/DP"
        : dRaw.includes("CONT") ? "CONTÁBIL"
        : dRaw.includes("FISC") ? "FISCAL"
        : "FOLHA/DP";
      const c = statusClass(e.status) as keyof DeptStat;
      if (result[key] && c in result[key]) result[key][c]++;
    });
    return result;
  }, [obrigacoes, tagsMap]);


  const byEquipe = useMemo(() => {
    const m = new Map<string, { dept: string; equipe: string; antecip: number; prazo: number; just: number; atras: number; total: number }>();
    obrigacoes.forEach(e => {
      const r = e.resp_entrega || e.resp_prazo || "—";
      if (!r || r === "—") return;
      // Detectar equipe via tagsMap (mesmo padrão da Base Info Empresas)
      const cnpjDigits = (e.cnpj || "").replace(/\D/g, "");
      const deptUpper = (e.departamento || "").toUpperCase();
      const dep = deptUpper.includes("CONT") ? "cont" : deptUpper.includes("FISC") ? "fisc" : "dp";
      const equipe = getTagDepto(e.cnpj, dep) || e.departamento || "—";
      if (!m.has(r)) m.set(r, { dept: e.departamento, equipe, antecip: 0, prazo: 0, just: 0, atras: 0, total: 0 });
      const x = m.get(r)!;
      x.total++;
      const c = statusClass(e.status);
      if (c !== "vencer") x[c === "prazo" ? "prazo" : c === "antecip" ? "antecip" : c === "just" ? "just" : "atras"]++;
    });
    return Array.from(m.entries())
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.atras - a.atras || a.nome.localeCompare(b.nome));
  }, [obrigacoes, tagsMap]);

  const byCliente = useMemo(() => {
    const m = new Map<string, { cnpj: string; grupo: string; antecip: number; prazo: number; just: number; atras: number; total: number }>();
    obrigacoes.forEach(e => {
      const k = (e.cnpj || "").replace(/\D/g, "") || e.razao || "—";
      if (!m.has(k)) m.set(k, { cnpj: e.cnpj || "", grupo: grupoEmp(e.cnpj), antecip: 0, prazo: 0, just: 0, atras: 0, total: 0 });
      const x = m.get(k)!;
      x.total++;
      const c = statusClass(e.status);
      x[c === "prazo" ? "prazo" : c === "antecip" ? "antecip" : c === "just" ? "just" : "atras"]++;
    });
    return Array.from(m.values())
      .map(v => ({ ...v, nome: nomeEmp(v.cnpj) }))
      .sort((a, b) => b.atras - a.atras || b.total - a.total);
  }, [obrigacoes, razaoMap, grupoMap]);

  const gruposUnicos = useMemo(
    () => Array.from(new Set(byCliente.map(c => c.grupo).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [byCliente],
  );

  type MembroStat = { antecip: number; prazo: number; just: number; atras: number; entAtras: number; vencer: number; total: number };
  type TagStat = {
    tag: string; dept: string; coordenador: string;
    antecip: number; prazo: number; just: number; atras: number; entAtras: number; vencer: number; total: number;
    membros: Map<string, MembroStat>;
  };

  const byTag = useMemo(() => {
    const m = new Map<string, TagStat>();
    obrigacoes.forEach(e => {
      const dUp = (e.departamento || "").toUpperCase();
      const dep: "cont" | "fisc" | "dp" = dUp.includes("CONT") ? "cont" : dUp.includes("FISC") ? "fisc" : "dp";
      const tag = getTagDepto(e.cnpj, dep) || e.departamento || "Sem equipe";
      if (!m.has(tag)) {
        m.set(tag, {
          tag, dept: e.departamento || "—",
          coordenador: coordMap[normalizeTag(tag)] || "",
          antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0, total: 0, membros: new Map(),
        });
      }

      const x = m.get(tag)!;
      x.total++;
      const key = statusClass(e.status) as keyof MembroStat;
      if (key in x) (x[key] as number)++;

      // Analista: só quem entregou (resp_entrega preenchido)
      const analista = e.resp_entrega || "";
      if (analista) {
        if (!x.membros.has(analista)) x.membros.set(analista, { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0, total: 0 });
        const mb = x.membros.get(analista)!;
        mb.total++;
        if (key in mb) (mb[key] as number)++;
      }
    });
    return Array.from(m.values()).sort((a, b) => b.atras - a.atras || b.total - a.total);
  }, [obrigacoes, tagsMap, coordMap]);

  const vencer = useMemo(() =>
    obrigacoes.filter(e => !e.dt_finalizacao || e.dt_finalizacao === "0000-00-00 00:00:00")
      .sort((a, b) => (a.dt_prazo || "").localeCompare(b.dt_prazo || ""))
  , [obrigacoes]);

  // Todos os processos do banco — filtros (depto, status, busca) aplicados na tabela
  const processosPeriodo = useMemo(() => processos, [processos]);


  const deptsProcessos = useMemo(
    () => Array.from(new Set(processos.map(p => p.departamento).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [processos],
  );

  const equipesTarefas = useMemo(() => {
    const s = new Set<string>();
    tarefas.forEach(t => {
      const dUp = (t.departamento || "").toUpperCase();
      const dep: "cont" | "fisc" | "dp" = dUp.includes("CONT") ? "cont" : dUp.includes("FISC") ? "fisc" : "dp";
      s.add(getTagDepto(t.cnpj, dep) || t.departamento || "Sem equipe");
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [tarefas, tagsMap]);

  const tagTarefa = (t: EntregaApi) => {
    const dUp = (t.departamento || "").toUpperCase();
    const dep: "cont" | "fisc" | "dp" = dUp.includes("CONT") ? "cont" : dUp.includes("FISC") ? "fisc" : "dp";
    return getTagDepto(t.cnpj, dep) || t.departamento || "Sem equipe";
  };

  // ── Fechar competência (admin) ────────────────────────────────────────
  async function fecharCompetencia() {
    const comp = dtIni.slice(0, 7);
    if (!confirm(`Fechar competência ${comp}? Isso impedirá novas sincronizações para este mês.`)) return;

    const totais: Record<string, unknown> = {};
    (["CONTÁBIL", "FISCAL", "FOLHA/DP"] as const).forEach(dep => {
      totais[dep] = byDept[dep] || { antecip: 0, prazo: 0, just: 0, atras: 0 };
    });
    totais.byTag = byTag.map(t => ({
      tag: t.tag, dept: t.dept, coordenador: t.coordenador,
      antecip: t.antecip, prazo: t.prazo, just: t.just, atras: t.atras, total: t.total,
    }));

    const { error: e1 } = await supabase.from("competencias_fechadas").upsert({
      competencia: comp,
      fechado_em: new Date().toISOString(),
      fechado_por: "admin",
      totais_json: totais as never,
    }, { onConflict: "competencia" });
    if (e1) { alert("Erro ao fechar: " + e1.message); return; }

    const { error: e2 } = await supabase.from("acessorias_entregas")
      .update({ fechado: true })
      .eq("competencia", comp);
    if (e2) { alert("Erro ao marcar fechado: " + e2.message); return; }

    alert(`Competência ${comp} fechada com sucesso!`);
  }

  // ── Linha do Tempo (competências fechadas) ───────────────────────────
  const carregarTimeline = useCallback(async () => {
    const { data } = await supabase
      .from("acessorias_entregas")
      .select("cnpj, competencia, status, departamento")
      .eq("fechado", true)
      .not("competencia", "is", null);

    const rows = (data || []) as { cnpj: string; competencia: string; status: string; departamento: string }[];

    const justMap = new Map<string, Set<string>>();
    const justCount = new Map<string, number>();
    rows.filter(r => /justif/i.test(r.status || "")).forEach(r => {
      const k = (r.cnpj || "").replace(/\D/g, "");
      if (!justMap.has(k)) justMap.set(k, new Set());
      justMap.get(k)!.add(r.competencia);
      justCount.set(k, (justCount.get(k) || 0) + 1);
    });
    const justRecorrentes = Array.from(justMap.entries())
      .filter(([, meses]) => meses.size >= 2)
      .map(([cnpj, meses]) => ({ cnpj, meses: Array.from(meses).sort(), total: justCount.get(cnpj) || 0 }))
      .sort((a, b) => b.meses.length - a.meses.length || b.total - a.total);

    const atrasMap = new Map<string, { dept: string; meses: Set<string>; total: number }>();
    rows.filter(r => /atras/i.test(r.status || "")).forEach(r => {
      const dUp = (r.departamento || "").toUpperCase();
      const dep: "cont" | "fisc" | "dp" = dUp.includes("CONT") ? "cont" : dUp.includes("FISC") ? "fisc" : "dp";
      const tag = getTagDepto(r.cnpj, dep) || r.departamento || "Sem equipe";
      if (!atrasMap.has(tag)) atrasMap.set(tag, { dept: r.departamento || "—", meses: new Set(), total: 0 });
      const x = atrasMap.get(tag)!;
      x.meses.add(r.competencia);
      x.total++;
    });
    const atrasRecorrentes = Array.from(atrasMap.entries())
      .filter(([, v]) => v.meses.size >= 2)
      .map(([tag, v]) => ({ tag, dept: v.dept, meses: Array.from(v.meses).sort(), total: v.total }))
      .sort((a, b) => b.meses.length - a.meses.length || b.total - a.total);

    setTimelineData({ justRecorrentes, atrasRecorrentes });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsMap]);

  useEffect(() => { if (nav === "timeline") void carregarTimeline(); }, [nav, carregarTimeline]);



  // ── Nav lateral ───────────────────────────────────────────────────────
  const navItems: Array<{ id: NavId; label: string; group?: string }> = [
    { id: "geral",     label: "Resumo Geral",    group: "Visão Geral" },
    { id: "contabil",  label: "Contábil",         group: "Departamentos" },
    { id: "fiscal",    label: "Fiscal" },
    { id: "folha",     label: "Folha / DP" },
    { id: "equipe",    label: "Por Equipe",        group: "Análises" },
    { id: "clientes",  label: "Por Cliente" },
    { id: "timeline",  label: "Linha do Tempo" },
    { id: "tarefas",   label: "Tarefas",           group: "Tarefas e Processos" },
    { id: "processos", label: "Processos" },
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "inherit" }}>

      {/* Sidebar */}
      <aside style={{ width: 180, background: C.card, borderRight: `1px solid ${C.border}`, flexShrink: 0, padding: "10px 0", display: "flex", flexDirection: "column" }}>
        {navItems.map((item, i) => (
          <div key={item.id}>
            {item.group && (
              <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: ".07em", padding: i === 0 ? "8px 14px 3px" : "14px 14px 3px", fontWeight: 600 }}>
                {item.group}
              </div>
            )}
            <div
              onClick={() => setNav(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 14px",
                cursor: "pointer", fontSize: 11, fontWeight: 500,
                borderLeft: `2px solid ${nav === item.id ? C.brand : "transparent"}`,
                background: nav === item.id ? `${C.brand}14` : "transparent",
                color: nav === item.id ? C.brand : C.sub,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: nav === item.id ? C.brand : C.dim, flexShrink: 0 }} />
              {item.label}
            </div>
          </div>
        ))}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Performance de Entregas</div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em" }}>Planning Hub · Operacional</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {ultimaSinc && (
              <span style={{ fontSize: 10, color: C.muted }}>
                Última sinc: {new Date(ultimaSinc).toLocaleString("pt-BR")}
              </span>
            )}
            <input type="date" value={dtIni} onChange={e => setDtIni(e.target.value)} style={inp} />
            <span style={{ fontSize: 11, color: C.muted }}>até</span>
            <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} style={inp} />
            <button style={btn()} onClick={() => void carregar()}>🔄 Recarregar</button>
            {isAdmin && (
              <button style={btn()} onClick={() => void fecharCompetencia()}>
                🔒 Fechar {dtIni.slice(0, 7)}
              </button>
            )}

            <button style={btn(true)} disabled={sincronizando} onClick={() => void sincronizar()}>
              {sincronizando ? "⏳ Sincronizando..." : "🔗 Sincronizar API"}
            </button>
            {progresso && (
              <span style={{ fontSize: 10, color: C.muted }}>
                {progresso.tipo}: {progresso.detalhe ?? `página ${progresso.pagina} · ${progresso.gravadas} gravadas`}
              </span>
            )}
            {erroSinc && (
              <span style={{ fontSize: 10, color: "#f87171", maxWidth: 420 }}>{erroSinc}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

          {loading && (
            <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 13 }}>
              Carregando dados...
            </div>
          )}

          {!loading && entregas.length === 0 && (
            <div style={{ ...card, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
              <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>Nenhum dado encontrado para o período selecionado.</div>
              <div style={{ fontSize: 11, color: C.muted }}>Clique em "Sincronizar API" para buscar os dados do Acessórias.</div>
            </div>
          )}

          {/* ── RESUMO GERAL ── */}
          {!loading && nav === "geral" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
                <KpiCard label="Entregues"         value={stats.antecip + stats.prazo} accent={C.brand} sub="no prazo técnico" />
                <KpiCard label="Ent. c/ Atraso"    value={stats.entAtras} accent={C.red} sub="baixada após prazo" />
                <KpiCard label="Justificadas"      value={stats.just} accent={C.amber} sub="prazo legal ok" />
                <KpiCard label="Atrasada! (aberto)" value={stats.atras} accent={C.red} sub="risco imediato" />
                <KpiCard label="A Vencer"          value={stats.vencer} sub="prazo futuro" />
                <KpiCard label="% Prazo Global"    value={`${stats.pct}%`} accent={pctColor(stats.pct)} sub="meta: 95%" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
                {([
                  { key: "CONTÁBIL", title: "Contábil", accent: "#444444" },
                  { key: "FISCAL",   title: "Fiscal",   accent: C.brand },
                  { key: "FOLHA/DP", title: "Folha / DP", accent: C.amber },
                ] as const).map(d => {
                  const v = byDept[d.key] || { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 };
                  const total = v.antecip + v.prazo + v.just + v.atras + v.entAtras; // excluir vencer
                  const prazoTec = Math.round((v.antecip + v.prazo) / Math.max(1, total) * 100);
                  const prazoLegal = Math.round((v.antecip + v.prazo + v.just) / Math.max(1, total) * 100);
                  const status: "CRÍTICO" | "ATENÇÃO" | "META ATINGIDA" =
                    prazoTec >= 95 ? "META ATINGIDA" : prazoTec >= 80 ? "ATENÇÃO" : "CRÍTICO";
                  return (
                    <DeptCard key={d.key} title={d.title} status={status} accent={d.accent}
                      prazoTec={prazoTec} prazoLegal={prazoLegal}
                      antecip={v.antecip} prazo={v.prazo} just={v.just} atras={v.atras + v.entAtras} vencer={v.vencer} />
                  );
                })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
                <div style={{ ...card, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Performance por Equipe</div>
                  {byTag.length === 0
                    ? <div style={{ color: C.muted, fontSize: 11, textAlign: "center", padding: 20 }}>Sem dados para o período.</div>
                    : byTag.slice(0, 12).map(t => {
                      const den = t.antecip + t.prazo + t.just + t.atras + t.entAtras;
                      const pct = Math.round((t.antecip + t.prazo) / Math.max(1, den) * 100);
                      return (
                        <div key={t.tag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.tag}</div>
                            <div style={{ fontSize: 9, color: C.muted }}>{t.coordenador || "Coordenador não informado"}</div>
                          </div>
                          <div style={{ fontSize: 10, color: C.muted, minWidth: 60, textAlign: "right" }}>{t.total.toLocaleString("pt-BR")} obrig.</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: pctColor(pct), minWidth: 42, textAlign: "right" }}>{pct}%</div>
                        </div>
                      );
                    })}
                </div>

                <div style={{ ...card, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Status das Entregas</div>
                  {[
                    { label: "✦ Entregue antecipado", val: stats.antecip,  color: C.brand, sub: "antes do prazo técnico" },
                    { label: "✓ Entregue",            val: stats.prazo,    color: C.brand, sub: "dentro do prazo técnico" },
                    { label: "⚡ Ent. com atraso",     val: stats.entAtras, color: C.red,   sub: "baixada após o prazo" },
                    { label: "⚠ Justificada",         val: stats.just,     color: C.amber, sub: "prazo legal ok" },
                    { label: "⚡ Atrasada! (aberto)",  val: stats.atras,    color: C.red,   sub: "prazo vencido" },
                    { label: "🕒 A Vencer",            val: stats.vencer,   color: C.muted, sub: "monitorar" },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 10, color: item.color, marginTop: 1, flexShrink: 0 }}>●</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: item.color }}>{item.label}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{item.sub}</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.val.toLocaleString("pt-BR")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── POR EQUIPE (expansível por TAG) ── */}
          {!loading && nav === "equipe" && (
            <div style={card}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 12, color: C.text }}>Performance por Equipe</strong>
                <input placeholder="Buscar equipe ou analista..." value={qEquipe} onChange={e => setQEquipe(e.target.value)} style={{ ...inp, width: 220 }} />
              </div>
              <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Equipe / Analista</th>
                      <th style={th}>Coordenador / Depto</th>
                      <th style={th}>Volume</th>
                      <th style={{ ...th, color: C.brand }}>✦ Antecip</th>
                      <th style={{ ...th, color: C.sub }}>✓ Prazo</th>
                      <th style={{ ...th, color: C.amber }}>⚠ Just</th>
                      <th style={{ ...th, color: C.red }}>⚡ Atras!</th>
                      <th style={{ ...th, color: C.muted }}>🕒 Vencer</th>
                      <th style={th}>Distribuição</th>
                      <th style={th}>% NP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTag
                      .filter(t => {
                        if (!qEquipe) return true;
                        const q = qEquipe.toLowerCase();
                        return t.tag.toLowerCase().includes(q)
                          || Array.from(t.membros.keys()).some(n => n.toLowerCase().includes(q));
                      })
                      .map(t => {
                        const den = t.antecip + t.prazo + t.just + t.atras + t.entAtras;
                        const pct = Math.round((t.antecip + t.prazo) / Math.max(1, den) * 100);
                        const pOk = pct;
                        const pJ  = Math.round(t.just / Math.max(1, den) * 100);
                        const pAt = Math.round((t.atras + t.entAtras) / Math.max(1, den) * 100);
                        const aberto = expanded.has(t.tag);
                        const membros = Array.from(t.membros.entries()).sort((a, b) => b[1].atras - a[1].atras || b[1].total - a[1].total);
                        return (
                          <Fragment key={t.tag}>
                            <tr onClick={() => toggleExpand(t.tag)} style={{ cursor: "pointer", background: C.card2 }}>
                              <td style={{ ...td, fontWeight: 700, color: C.text }}>{aberto ? "▼" : "▶"} {t.tag}</td>
                              <td style={{ ...td, color: C.muted, fontSize: 10 }}>{t.coordenador || t.dept}</td>
                              <td style={{ ...td, color: C.sub, fontWeight: 600 }}>{t.total.toLocaleString("pt-BR")}</td>
                              <td style={{ ...td, color: t.antecip > 0 ? C.brand : C.muted, fontWeight: 600 }}>{t.antecip}</td>
                              <td style={{ ...td, color: C.muted }}>{t.prazo}</td>
                              <td style={{ ...td, color: t.just > 0 ? C.amber : C.muted, fontWeight: 600 }}>{t.just}</td>
                              <td style={{ ...td, color: t.atras > 0 ? C.red : C.muted, fontWeight: 700 }}>{t.atras}</td>
                              <td style={{ ...td, color: C.muted }}>{t.vencer || 0}</td>
                              <td style={{ ...td, minWidth: 120 }}>
                                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: C.dim }}>
                                  <div style={{ width: `${pOk}%`, background: C.brand }} />
                                  <div style={{ width: `${pJ}%`, background: `${C.amber}60` }} />
                                  <div style={{ width: `${pAt}%`, background: C.red }} />
                                </div>
                              </td>
                              <td style={{ ...td, fontWeight: 700, color: pctColor(pct) }}>{pct}%</td>
                            </tr>
                            {aberto && membros.map(([nome, m]) => {
                              const mDen = m.antecip + m.prazo + m.just + m.atras + m.entAtras;
                              const mp  = Math.round((m.antecip + m.prazo) / Math.max(1, mDen) * 100);
                              const mJ  = Math.round(m.just / Math.max(1, mDen) * 100);
                              const mAt = Math.round((m.atras + m.entAtras) / Math.max(1, mDen) * 100);
                              return (
                                <tr key={`${t.tag}-${nome}`} style={{ background: C.bg }}>
                                  <td style={{ ...td, paddingLeft: 28, color: C.sub }}>↳ {nome}</td>
                                  <td style={{ ...td, color: C.muted, fontSize: 10 }}>{t.dept}</td>
                                  <td style={{ ...td, color: C.muted }}>{m.total.toLocaleString("pt-BR")}</td>
                                  <td style={{ ...td, color: m.antecip > 0 ? C.brand : C.muted }}>{m.antecip}</td>
                                  <td style={{ ...td, color: C.muted }}>{m.prazo}</td>
                                  <td style={{ ...td, color: m.just > 0 ? C.amber : C.muted }}>{m.just}</td>
                                  <td style={{ ...td, color: m.atras > 0 ? C.red : C.muted, fontWeight: 700 }}>{m.atras}</td>
                                  <td style={{ ...td, color: C.muted }}>—</td>
                                  <td style={{ ...td, minWidth: 120 }}>
                                    <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", background: C.dim }}>
                                      <div style={{ width: `${mp}%`, background: C.brand }} />
                                      <div style={{ width: `${mJ}%`, background: `${C.amber}60` }} />
                                      <div style={{ width: `${mAt}%`, background: C.red }} />
                                    </div>
                                  </td>
                                  <td style={{ ...td, fontWeight: 700, color: pctColor(mp) }}>{mp}%</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    {byTag.length === 0 && (
                      <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Sem dados para o período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── POR EMPRESA / GRUPO ── */}
          {!loading && nav === "clientes" && (
            <div style={card}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 12, color: C.text, flex: 1 }}>Por Empresa / Grupo</strong>
                <select value={qGrupo} onChange={e => setQGrupo(e.target.value)} style={{ ...inp, maxWidth: 220 }}>
                  <option value="">Todos os grupos</option>
                  {gruposUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input placeholder="Buscar empresa ou grupo..." value={qCli} onChange={e => setQCli(e.target.value)} style={{ ...inp, width: 240 }} />
              </div>
              <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Grupo</th>
                      <th style={th}>Empresa</th>
                      <th style={th}>Total</th>
                      <th style={{ ...th, color: C.brand }}>✦</th>
                      <th style={{ ...th, color: C.sub }}>✓</th>
                      <th style={{ ...th, color: C.amber }}>⚠</th>
                      <th style={{ ...th, color: C.red }}>⚡</th>
                      <th style={th}>Distribuição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCliente
                      .filter(c => !qGrupo || c.grupo === qGrupo)
                      .filter(c => {
                        if (!qCli) return true;
                        const q = qCli.toLowerCase();
                        return c.nome.toLowerCase().includes(q) || (c.grupo || "").toLowerCase().includes(q);
                      })
                      .slice(0, 300)
                      .map((c, i) => {
                        const pOk = Math.round((c.antecip + c.prazo) / Math.max(1, c.total) * 100);
                        const pJ  = Math.round(c.just / Math.max(1, c.total) * 100);
                        const pAt = Math.round(c.atras / Math.max(1, c.total) * 100);
                        return (
                          <tr key={c.cnpj || c.nome} style={{ background: i % 2 === 0 ? "transparent" : C.card2 }}>
                            <td style={{ ...td, color: C.muted, fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.grupo || "—"}</td>
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


          {/* ── TAREFAS ── */}
          {!loading && nav === "tarefas" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
                <KpiCard label="Total tarefas"  value={tarefas.length} />
                <KpiCard label="Concluídas"     value={tarefas.filter(t => t.dt_finalizacao && t.dt_finalizacao !== "0000-00-00 00:00:00").length} accent={C.brand} />
                <KpiCard label="Em andamento"   value={tarefas.filter(t => !t.dt_finalizacao || t.dt_finalizacao === "0000-00-00 00:00:00").length} accent={C.amber} />
                <KpiCard label="% Conclusão"
                  value={`${tarefas.length > 0 ? Math.round(tarefas.filter(t => t.dt_finalizacao && t.dt_finalizacao !== "0000-00-00 00:00:00").length / tarefas.length * 100) : 0}%`}
                  accent={C.brand} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={fTarefaEquipe} onChange={e => setFTarefaEquipe(e.target.value)} style={{ ...inp, maxWidth: 240 }}>
                  <option value="">Filtrar por equipe</option>
                  {equipesTarefas.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div style={card}>
                <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Empresa</th>
                        <th style={th}>Tarefa</th>
                        <th style={th}>Equipe</th>
                        <th style={th}>Departamento</th>
                        <th style={th}>Responsável</th>
                        <th style={th}>Prazo</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tarefas
                        .filter(t => !fTarefaEquipe || tagTarefa(t) === fTarefaEquipe)
                        .slice(0, 300)
                        .map((t, i) => {
                        const concl = !!t.dt_finalizacao && t.dt_finalizacao !== "0000-00-00 00:00:00";
                        return (
                          <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : C.card2 }}>
                            <td style={{ ...td, fontWeight: 600, color: C.text }}>{nomeEmp(t.cnpj)}</td>
                            <td style={td}>{t.nome_entrega}</td>
                            <td style={{ ...td, color: C.sub, fontSize: 10 }}>{tagTarefa(t)}</td>
                            <td style={td}><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: C.dim, color: C.sub }}>{t.departamento}</span></td>
                            <td style={{ ...td, color: C.muted }}>{t.resp_entrega || "—"}</td>
                            <td style={{ ...td, color: C.muted, fontSize: 10 }}>{t.dt_prazo || "—"}</td>
                            <td style={td}>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: concl ? `${C.brand}18` : `${C.amber}18`, color: concl ? C.brand : C.amber }}>
                                {concl ? "✓ Concluída" : "⏳ Andamento"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {tarefas.length === 0 && (
                        <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Nenhuma tarefa no período. Sincronize a API para carregar.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── PROCESSOS ── */}
          {!loading && nav === "processos" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
                <KpiCard label="Em andamento" value={processosPeriodo.filter(p => procStatusInfo(p.status).label === "Em andamento").length} accent={C.brand} />
                <KpiCard label="Concluídos"   value={processosPeriodo.filter(p => procStatusInfo(p.status).label === "Concluído").length} accent={C.brand} />
                <KpiCard label="Atrasados"    value={processosPeriodo.filter(p => procStatusInfo(p.status).label === "Atrasado").length} accent={C.red} />
                <KpiCard label="Suspensos"    value={processosPeriodo.filter(p => procStatusInfo(p.status).label === "Suspenso").length} />
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
                  <option value="">Filtrar por departamento</option>
                  {deptsProcessos.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={card}>
                <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Processo</th>
                        <th style={th}>Empresa</th>
                        <th style={th}>Departamento</th>
                        <th style={th}>Gestor</th>
                        <th style={th}>Início</th>
                        <th style={th}>Previsão</th>
                        <th style={{ ...th, minWidth: 120 }}>Progresso</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processosPeriodo
                        .filter(p => {
                          if (fProcDept && p.departamento !== fProcDept) return false;
                          if (qProc) {
                            const q = qProc.toLowerCase();
                            if (!(p.nome_processo || "").toLowerCase().includes(q) && !nomeEmp(p.cnpj).toLowerCase().includes(q)) return false;
                          }
                          if (fProcStatus) {
                            const { label } = procStatusInfo(p.status);
                            if (fProcStatus === "andamento" && !label.includes("andamento")) return false;
                            if (fProcStatus === "concluido" && !label.includes("Concluído")) return false;
                            if (fProcStatus === "atrasado" && !label.includes("Atrasado")) return false;
                            if (fProcStatus === "suspenso" && !label.includes("Suspenso")) return false;
                          }
                          return true;
                        })
                        .slice(0, 300)
                        .map((p, i) => {
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
                                  <div style={{ flex: 1, height: 6, background: C.dim, borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontSize: 10, color: barColor, fontWeight: 700, minWidth: 30, textAlign: "right" }}>{pct}%</span>
                                </div>
                              </td>
                              <td style={td}>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: `${color}18`, color }}>{label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      {processosPeriodo.length === 0 && (
                        <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Nenhum processo no período. Sincronize a API para carregar.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── ABAS DE DEPT (Contábil / Fiscal / Folha) ── */}
          {!loading && (nav === "contabil" || nav === "fiscal" || nav === "folha") && (() => {
            const deptKey = nav === "contabil" ? "CONTÁBIL" : nav === "fiscal" ? "FISCAL" : "FOLHA/DP";
            const deptLabel = nav === "contabil" ? "Contábil" : nav === "fiscal" ? "Fiscal" : "Folha / DP";
            const deptObrigs = obrigacoes.filter(e => {
              const cnpjD = (e.cnpj || "").replace(/\D/g, "");
              const tgs = tagsMap[cnpjD] || [];
              const hasCont = !!tgs.find(t => /equipe\s+cont/i.test(t) || /equipe\s+dedicada/i.test(t));
              const hasFisc = !!tgs.find(t => /equipe\s+fiscal/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t));
              const hasDp   = !!tgs.find(t => /equipe\s+dp/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t));
              const dRaw = (e.departamento || "").toUpperCase();

              if (nav === "contabil") {
                if (hasCont) return true;
                if (!hasFisc && !hasDp && dRaw.includes("CONT")) return true;
                return false;
              }
              if (nav === "fiscal") {
                if (hasFisc && !hasCont) return true;
                if (!hasCont && !hasDp && dRaw.includes("FISC")) return true;
                return false;
              }
              if (hasDp && !hasCont && !hasFisc) return true;
              if (!hasCont && !hasFisc && (dRaw.includes("PES") || dRaw.includes("FOLHA") || dRaw.includes("DP"))) return true;
              return false;
            });

            const s = { antecip: 0, prazo: 0, just: 0, atras: 0, entAtras: 0, vencer: 0 };
            deptObrigs.forEach(e => {
              const c = statusClass(e.status) as keyof typeof s;
              if (c in s) s[c]++;
            });
            const tot = s.antecip + s.prazo + s.just + s.atras + s.entAtras; // excluir vencer
            const pct = tot > 0 ? Math.round((s.antecip + s.prazo) / tot * 100) : 0;
            const equipeDept = byEquipe.filter(e => {
              const d = (e.dept || "").toUpperCase();
              if (nav === "contabil") return d.includes("CONT");
              if (nav === "fiscal")   return d.includes("FISC");
              return d.includes("PES") || d.includes("FOLHA") || d.includes("DP");
            });

            return (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
                  <KpiCard label="Entregues"      value={s.antecip + s.prazo} accent={C.brand} sub={`${tot > 0 ? Math.round((s.antecip + s.prazo) / tot * 100) : 0}%`} />
                  <KpiCard label="Ent. c/ Atraso" value={s.entAtras || 0} accent={C.red} />
                  <KpiCard label="Justificadas"   value={s.just} accent={C.amber} sub={`${tot > 0 ? Math.round(s.just / tot * 100) : 0}%`} />
                  <KpiCard label="Atrasada!"      value={s.atras} accent={C.red} sub="risco imediato" />
                  <KpiCard label="A Vencer"       value={s.vencer || 0} sub="prazo futuro" />
                  <KpiCard label="% Prazo"        value={`${pct}%`} accent={pctColor(pct)} sub="meta: 95%" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
                  <div style={{ ...card, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Equipe {deptLabel}</div>
                    {equipeDept.length === 0
                      ? <div style={{ color: C.muted, fontSize: 11, textAlign: "center", padding: 20 }}>Sem dados para o período.</div>
                      : equipeDept.map((e, i) => (
                        <GaugeRow key={e.nome} idx={i} nome={e.nome} dept={e.dept}
                          total={e.total} antecip={e.antecip} prazo={e.prazo} just={e.just} atras={e.atras} />
                      ))
                    }
                  </div>
                  <div style={{ ...card, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>Distribuição {deptLabel}</div>
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: C.dim, marginBottom: 12 }}>
                      {tot > 0 && <>
                        <div style={{ width: `${Math.round((s.antecip + s.prazo) / tot * 100)}%`, background: C.brand }} />
                        <div style={{ width: `${Math.round(s.just / tot * 100)}%`, background: C.dim }} />
                        <div style={{ width: `${Math.round((s.atras + s.entAtras) / tot * 100)}%`, background: C.red }} />
                      </>}
                    </div>
                    {[
                      { l: "Entregues no prazo", v: s.antecip + s.prazo, c: C.brand },
                      { l: "Ent. com atraso",    v: s.entAtras || 0,     c: C.red },
                      { l: "Justificadas",       v: s.just,              c: C.amber },
                      { l: "Atrasadas!",         v: s.atras,             c: C.red },
                      { l: "A Vencer",           v: s.vencer || 0,       c: C.muted },
                      { l: "Total",              v: tot + (s.vencer || 0), c: C.text },
                    ].map(item => (
                      <div key={item.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                        <span style={{ color: C.muted }}>{item.l}</span>
                        <span style={{ fontWeight: 700, color: item.c }}>{item.v.toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={card}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 12, color: C.text, flex: 1 }}>Obrigações do período — {deptLabel}</strong>
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
                          <th style={th}>Prazo Legal</th>
                          <th style={th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptObrigs
                          .filter(e => {
                            if (!qDept) return true;
                            const q = qDept.toLowerCase();
                            return nomeEmp(e.cnpj).toLowerCase().includes(q) || (e.nome_entrega || "").toLowerCase().includes(q);
                          })
                          .slice()
                          .sort((a, b) => {
                            const aA = statusClass(a.status) === "atras" ? 0 : 1;
                            const bA = statusClass(b.status) === "atras" ? 0 : 1;
                            if (aA !== bA) return aA - bA;
                            return (a.dt_prazo || "").localeCompare(b.dt_prazo || "");
                          })
                          .slice(0, 400)
                          .map(e => {
                            const cls = statusClass(e.status);
                            const bg = cls === "atras" ? "#FC6B6B14" : cls === "just" ? "#E8C54714" : "transparent";
                            const cor = cls === "atras" ? C.red : cls === "just" ? C.amber : C.sub;
                            return (
                              <tr key={e.id} style={{ background: bg }}>
                                <td style={{ ...td, fontWeight: 600, color: cls === "atras" ? C.red : C.text, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeEmp(e.cnpj)}</td>
                                <td style={{ ...td, color: cor }}>{e.nome_entrega}</td>
                                <td style={{ ...td, color: C.muted }}>{e.resp_entrega || e.resp_prazo || "—"}</td>
                                <td style={{ ...td, color: cor, fontSize: 10, whiteSpace: "nowrap" }}>{e.dt_prazo || "—"}</td>
                                <td style={{ ...td, color: C.muted, fontSize: 10, whiteSpace: "nowrap" }}>{e.dt_finalizacao && e.dt_finalizacao !== "0000-00-00 00:00:00" ? e.dt_finalizacao.slice(0, 10) : "—"}</td>
                                <td style={td}><StatusBadge s={e.status} /></td>
                              </tr>
                            );
                          })}
                        {deptObrigs.length === 0 && (
                          <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>Sem obrigações no período.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            );
          })()}

          {/* ── TIMELINE ── */}
          {!loading && nav === "timeline" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button style={btn(tlTab === "just")} onClick={() => setTlTab("just")}>Justificativas recorrentes</button>
                <button style={btn(tlTab === "atras")} onClick={() => setTlTab("atras")}>Atrasos recorrentes</button>
                <span style={{ fontSize: 10, color: C.muted }}>Base: competências fechadas</span>
              </div>

              {!timelineData && (
                <div style={{ ...card, padding: 30, textAlign: "center", color: C.muted, fontSize: 11 }}>Carregando histórico...</div>
              )}

              {timelineData && tlTab === "just" && (
                <div style={card}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 12, color: C.text, flex: 1 }}>Empresas com justificativas recorrentes (2+ competências)</strong>
                    <input placeholder="Buscar empresa..." value={qCli} onChange={e => setQCli(e.target.value)} style={{ ...inp, width: 220 }} />
                    <select value={qGrupo} onChange={e => setQGrupo(e.target.value)} style={{ ...inp, width: 180 }}>
                      <option value="">Todos os grupos</option>
                      {gruposUnicos.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Empresa</th>
                          <th style={th}>Grupo</th>
                          <th style={th}>Nº meses</th>
                          <th style={th}>Total justificativas</th>
                          <th style={th}>Meses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timelineData.justRecorrentes
                          .filter(r => !qCli || nomeEmp(r.cnpj).toLowerCase().includes(qCli.toLowerCase()))
                          .filter(r => !qGrupo || grupoEmp(r.cnpj) === qGrupo)
                          .map(r => (
                            <tr key={r.cnpj}>
                              <td style={{ ...td, fontWeight: 600, color: C.text, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeEmp(r.cnpj)}</td>
                              <td style={{ ...td, color: C.muted }}>{grupoEmp(r.cnpj) || "—"}</td>
                              <td style={{ ...td, fontWeight: 700, color: C.amber }}>{r.meses.length}</td>
                              <td style={td}>{r.total}</td>
                              <td style={td}>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {r.meses.map(m => (
                                    <span key={m} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${C.amber}22`, color: C.amber }}>{m}</span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        {timelineData.justRecorrentes.length === 0 && (
                          <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>
                            Feche ao menos 2 competências para ver recorrências.
                          </td></tr>
                        )}
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
                      <thead>
                        <tr>
                          <th style={th}>Equipe (TAG)</th>
                          <th style={th}>Departamento</th>
                          <th style={th}>Coordenador</th>
                          <th style={th}>Nº meses</th>
                          <th style={th}>Total atrasadas</th>
                          <th style={th}>Meses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timelineData.atrasRecorrentes.map(r => (
                          <tr key={r.tag}>
                            <td style={{ ...td, fontWeight: 600, color: C.text }}>{r.tag}</td>
                            <td style={{ ...td, color: C.muted }}>{r.dept}</td>
                            <td style={{ ...td, color: C.sub }}>{coordMap[normalizeTag(r.tag)] || "—"}</td>
                            <td style={{ ...td, fontWeight: 700, color: C.red }}>{r.meses.length}</td>
                            <td style={td}>{r.total}</td>
                            <td style={td}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {r.meses.map(m => (
                                  <span key={m} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${C.red}22`, color: C.red }}>{m}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {timelineData.atrasRecorrentes.length === 0 && (
                          <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: C.muted, padding: 30 }}>
                            Feche ao menos 2 competências para ver recorrências.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
      </main>
    </div>
  );
}
