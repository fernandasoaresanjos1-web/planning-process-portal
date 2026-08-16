// PainelOKR.tsx
// Cole em src/components/PainelOKR.tsx
// Requer: Supabase configurado no projeto (src/integrations/supabase/client.ts)
// Uso: <PainelOKR />

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Marco { id: number; titulo: string; concluido: boolean; }
interface Atividade {
  id: number; krId: number; titulo: string; responsavel: string;
  produto: string; prazo: string; tags: string[]; marcos: Marco[];
  criadoEm: string; concluidoEm: string | null;
  validacao?: boolean; obs?: string; implRef?: string;
}
interface KR { id: number; okrId: number; titulo: string; meta: number; unidade: string; atividades: Atividade[]; }
interface OKR { id: number; titulo: string; descricao: string; periodo: string; dono: string; status: string; criadoEm: string; krs: KR[]; }
interface Pessoa { nome: string; foto: string; }
interface TriagemItem {
  id: number; titulo: string; descricao: string; obs: string; prioridade: string;
  prazo: string; produto: string; okrId: number | null; okrTitulo: string;
  criadoEm: string; responsavelSugerido?: string; implRef?: string;
}
interface Sistema {
  id: number; nome: string; responsavel: string; inicio: string; fim: string;
  fases: { id: number; nome: string; sistemaId: number }[];
  modulos: { id: number; nome: string; sistemaId: number }[];
  matriz: Record<string, string>;
  comentarios?: Record<string, string>;
  planos?: Record<string, { texto: string; done: boolean }[]>;
  _open?: boolean;
}
interface NextIds {
  okr: number; kr: number; atv: number; marco: number; tri: number;
  sis: number; fase: number; mod: number;
}

type TabId = "okrs" | "gestao" | "triagem" | "implantacao" | "config";
type TagKey = "urgente" | "importante" | "aguardando" | "revisao";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const TAG_DEFS: Record<TagKey, { label: string; bg: string; cor: string }> = {
  urgente:    { label: "Urgente",    bg: "#FEE2E2", cor: "#DC2626" },
  importante: { label: "Importante", bg: "#FFF3E0", cor: "#FA6914" },
  aguardando: { label: "Aguardando", bg: "#DDF6FF", cor: "#0284C7" },
  revisao:    { label: "Revisão",    bg: "#F5F3FF", cor: "#7C3AED" },
};

const CELL_STATES = ["na", "iniciar", "andamento", "aprovacao", "concluido"] as const;

const C = {
  green: "#0AE18C", greenDark: "#00BF63", greenLt: "#EAFBF4",
  black: "#0C0C0C", charcoal: "#1A1A1A", ink: "#2C2C2C",
  gray70: "#4A4A4A", gray50: "#646464", gray30: "#CDCDCD",
  gray10: "#E8E8E8", gray05: "#F2F2F2", white: "#FFFFFF", border: "#E2E2E2",
  red: "#DC2626", redLt: "#FEE2E2",
  amber: "#FA6914", amberLt: "#FFF3E0",
  blue: "#14C8FA", blueLt: "#DDF6FF",
  purple: "#7C3AED", purpleLt: "#F5F3FF",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function uid() { return Date.now() * 1000 + (Math.random() * 999 | 0); }
function fmtData(d: string) { if (!d) return "—"; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
function progressoAtv(a: Atividade) { const ms = a.marcos || []; if (!ms.length) return 0; return Math.round(ms.filter(m => m.concluido).length / ms.length * 100); }
function statusAtv(a: Atividade): "concluido" | "validacao" | "andamento" | "nao_iniciado" {
  const p = progressoAtv(a);
  if (p === 100) return "concluido";
  if (a.validacao && p < 100) return "validacao";
  if (p > 0) return "andamento";
  return "nao_iniciado";
}
function progressoKr(kr: KR) { const atvs = kr.atividades || []; if (!atvs.length) return 0; return Math.round(atvs.reduce((s, a) => s + progressoAtv(a), 0) / atvs.length); }
function progressoOkr(okr: OKR) { const krs = okr.krs || []; if (!krs.length) return 0; return Math.round(krs.reduce((s, kr) => s + progressoKr(kr), 0) / krs.length); }
function corPct(p: number) { if (p >= 80) return C.greenDark; if (p >= 40) return C.amber; return C.red; }
function isAtrasada(a: Atividade) { if (!a.prazo) return false; if (progressoAtv(a) >= 100) return false; const h = new Date(); h.setHours(0, 0, 0, 0); return new Date(a.prazo) < h; }
function nomePessoa(p: Pessoa | string) { return typeof p === "string" ? p : (p?.nome || ""); }
function todasAtividades(okrs: OKR[]) {
  const out: (Atividade & { okrTitulo: string; okrId: number; krTitulo: string; krId: number })[] = [];
  okrs.forEach(o => (o.krs || []).forEach(kr => (kr.atividades || []).forEach(a => out.push({ ...a, okrTitulo: o.titulo, okrId: o.id, krTitulo: kr.titulo, krId: kr.id }))));
  return out;
}
function findKr(okrs: OKR[], krId: number) {
  for (const o of okrs) { const kr = (o.krs || []).find(k => k.id === krId); if (kr) return { kr, okr: o }; }
  return null;
}
function findAtv(okrs: OKR[], atvId: number) {
  for (const o of okrs) for (const kr of (o.krs || [])) { const a = (kr.atividades || []).find(x => x.id === atvId); if (a) return { atv: a, kr, okr: o }; }
  return null;
}
function statusImplCell(s: Sistema, okrs: OKR[], triagem: TriagemItem[], fid: number, mid: number): string {
  const implRef = `${s.id}_${fid}_${mid}`;
  let atvVinc: Atividade | null = null;
  okrs.forEach(o => (o.krs || []).forEach(kr => (kr.atividades || []).forEach(a => { if (a.implRef === implRef) atvVinc = a; })));
  if (atvVinc) {
    const sa = statusAtv(atvVinc);
    if (sa === "concluido") return "concluido";
    if (sa === "validacao") return "aprovacao";
    if (sa === "andamento") return "andamento";
    return "iniciar";
  }
  if (triagem.find(t => t.implRef === implRef)) return "iniciar";
  return (s.matriz || {})[`${fid}_${mid}`] || "na";
}
function sistemaProgresso(s: Sistema, okrs: OKR[], triagem: TriagemItem[]) {
  const fases = s.fases || []; const mods = s.modulos || [];
  let aplicavel = 0, conc = 0;
  fases.forEach(f => mods.forEach(m => { const v = statusImplCell(s, okrs, triagem, f.id, m.id); if (v !== "na") { aplicavel++; if (v === "concluido") conc++; } }));
  return aplicavel ? Math.round(conc / aplicavel * 100) : 0;
}

function defaultSeed(): { okrs: OKR[]; pessoas: Pessoa[]; produtos: string[]; triagem: TriagemItem[]; sistemas: Sistema[]; nextIds: NextIds } {
  const hoje = new Date(); const ano = hoje.getFullYear(); const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return {
    pessoas: [{ nome: "Ana Souza", foto: "" }, { nome: "Bruno Lima", foto: "" }, { nome: "Carla Mendes", foto: "" }, { nome: "Diego Alves", foto: "" }],
    produtos: ["Acessórias Web", "Agilizza", "App Mobile", "Infraestrutura"],
    triagem: [],
    sistemas: [{
      id: 1, nome: "Implantação de Sistemas", responsavel: "Ana Souza", inicio: `${ano}-01-01`, fim: `${ano}-12-31`,
      fases: [{ id: 1, nome: "Fase Inicial", sistemaId: 1 }, { id: 2, nome: "Configurações", sistemaId: 1 }, { id: 3, nome: "Análise", sistemaId: 1 }, { id: 4, nome: "Baixa nas Operações", sistemaId: 1 }, { id: 5, nome: "Treinamentos", sistemaId: 1 }, { id: 6, nome: "Validação", sistemaId: 1 }],
      modulos: [{ id: 1, nome: "Cadastros", sistemaId: 1 }, { id: 2, nome: "Obrigações", sistemaId: 1 }, { id: 3, nome: "Tarefas", sistemaId: 1 }, { id: 4, nome: "Gestão de Processos", sistemaId: 1 }, { id: 5, nome: "Gestão de Chamados", sistemaId: 1 }],
      matriz: {}, _open: true,
    }],
    okrs: [
      { id: 1, titulo: "Melhorar qualidade do cadastro", descricao: "Reduzir inconsistências identificadas na auditoria", periodo: `T2 ${ano}`, dono: "Ana Souza", status: "ativo", criadoEm: `${ano}-${mes}-01`, krs: [{ id: 1, okrId: 1, titulo: "Reduzir empresas sem IE", meta: 50, unidade: "empresas", atividades: [{ id: 1, krId: 1, titulo: "Mapear empresas com CNAE obrigatório sem IE", responsavel: "Ana Souza", produto: "Acessórias Web", prazo: `${ano}-${mes}-15`, tags: ["urgente"], criadoEm: `${ano}-${mes}-01`, concluidoEm: null, marcos: [{ id: 1, titulo: "Levantar lista no sistema", concluido: true }, { id: 2, titulo: "Classificar por CNAE", concluido: true }, { id: 3, titulo: "Exportar relatório", concluido: false }] }, { id: 2, krId: 1, titulo: "Abrir inscrições estaduais pendentes", responsavel: "Bruno Lima", produto: "Acessórias Web", prazo: `${ano}-${mes}-30`, tags: ["importante"], criadoEm: `${ano}-${mes}-05`, concluidoEm: null, marcos: [{ id: 4, titulo: "Contato com clientes", concluido: false }, { id: 5, titulo: "Abertura no portal SEFAZ", concluido: false }] }] }] },
      { id: 2, titulo: "Aumentar cobertura do Agilizza", descricao: "Garantir que todas as empresas estejam cadastradas", periodo: `T2 ${ano}`, dono: "Diego Alves", status: "ativo", criadoEm: `${ano}-${mes}-03`, krs: [{ id: 3, okrId: 2, titulo: "Cadastrar empresas pendentes", meta: 189, unidade: "empresas", atividades: [{ id: 3, krId: 3, titulo: "Importar lista DP/Contábil faltantes", responsavel: "Diego Alves", produto: "Agilizza", prazo: `${ano}-${mes}-10`, tags: ["urgente", "importante"], criadoEm: `${ano}-${mes}-03`, concluidoEm: null, marcos: [{ id: 9, titulo: "Extrair lista do cruzamento", concluido: true }, { id: 10, titulo: "Validar CNPJs", concluido: false }, { id: 11, titulo: "Cadastrar no Agilizza", concluido: false }] }] }] },
    ],
    nextIds: { okr: 3, kr: 4, atv: 4, marco: 12, tri: 1, sis: 2, fase: 7, mod: 6 },
  };
}

// ─── SUPABASE ────────────────────────────────────────────────────────────────

async function loadFromSupabase() {
  const { data, error } = await supabase.from("okr_painel").select("*").eq("id", "global").single();
  if (error || !data) return null;
  return {
    okrs: (data.okrs as unknown as OKR[]) || [],
    pessoas: (data.pessoas as unknown as Pessoa[]) || [],
    produtos: (data.produtos as unknown as string[]) || [],
    triagem: (data.triagem as unknown as TriagemItem[]) || [],
    sistemas: (data.sistemas as unknown as Sistema[]) || [],
    nextIds: (data.next_ids as unknown as NextIds) || { okr: 1, kr: 1, atv: 1, marco: 1, tri: 1, sis: 1, fase: 1, mod: 1 },
    updatedAt: data.updated_at as string,
  };
}

async function saveToSupabase(state: { okrs: OKR[]; pessoas: Pessoa[]; produtos: string[]; triagem: TriagemItem[]; sistemas: Sistema[]; nextIds: NextIds }) {
  const { error } = await supabase.from("okr_painel").upsert({
    id: "global",
    okrs: state.okrs as unknown as object,
    pessoas: state.pessoas as unknown as object,
    produtos: state.produtos as unknown as object,
    triagem: state.triagem as unknown as object,
    sistemas: state.sistemas as unknown as object,
    next_ids: state.nextIds as unknown as object,
    updated_at: new Date().toISOString(),
  } as never);
  if (error) throw error;
}

// ─── UI COMPONENTS ───────────────────────────────────────────────────────────

function IcBtn({ onClick, title, danger, children }: { onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: danger ? "#DC2626" : "#646464", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{children}</button>;
}


function StatCard({ type, title, sub, value }: { type: "warn" | "ok" | "amb" | "all"; title: string; sub: string; value: number | string }) {
  const s = { warn: { b: "#fca5a5", bg: C.redLt, ic: C.red, n: C.red }, ok: { b: "#6ee7b7", bg: C.greenLt, ic: C.greenDark, n: C.greenDark }, amb: { b: "#fed7aa", bg: C.amberLt, ic: C.amber, n: C.amber }, all: { b: C.border, bg: C.gray05, ic: C.gray50, n: C.charcoal } }[type];
  return (
    <div style={{ background: C.white, border: `1px solid ${s.b}`, borderRadius: 12, overflow: "hidden", minWidth: 130, flex: 1 }}>
      <div style={{ padding: "10px 13px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={s.ic} strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: C.charcoal }}>{title}</div><div style={{ fontSize: 10, color: C.gray50 }}>{sub}</div></div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, padding: "9px 13px", color: s.n }}>{value}</div>
    </div>
  );
}

function TagChip({ tag }: { tag: string }) {
  const d = TAG_DEFS[tag as TagKey];
  if (d) return <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 12, background: d.bg, color: d.cor }}>{d.label}</span>;
  return <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 12, background: C.gray10, color: C.gray70 }}>{tag}</span>;
}

function Avatar({ nome, size = 32, pessoas }: { nome: string; size?: number; pessoas: Pessoa[] }) {
  const p = pessoas.find(x => nomePessoa(x) === nome);
  const foto = p?.foto;
  if (foto) return <img src={foto} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt={nome} />;
  const ini = nome ? nome.split(" ").slice(0, 2).map(x => x[0]?.toUpperCase() || "").join("") : "?";
  return <div style={{ width: size, height: size, borderRadius: "50%", background: C.greenLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: (size / 2.6 | 0), fontWeight: 800, color: C.greenDark, flexShrink: 0 }}>{ini}</div>;
}

function ProgressBar({ pct, height = 6 }: { pct: number; height?: number }) {
  return <div style={{ height, borderRadius: height / 2, background: C.gray10, overflow: "hidden", flex: 1 }}>
    <div style={{ width: `${pct}%`, height: "100%", background: corPct(pct), borderRadius: height / 2, transition: "width .3s" }} />
  </div>;
}

function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  if (!open) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: C.white, borderRadius: 16, width: 720, maxWidth: "96vw", maxHeight: "90vh", overflowY: "auto", padding: "24px 26px", boxShadow: "0 4px 20px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.charcoal }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.gray50 }}>✕</button>
        </div>
        {children}
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>{footer}</div>}
      </div>
    </div>
  );
}

function FI({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 600, color: C.gray70 }}>{label}</label>
    {children}
  </div>;
}

const fi: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontFamily: "inherit", fontSize: 12, color: C.ink, outline: "none", background: C.white };

function BtnPri({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "8px 18px", borderRadius: 8, border: "none", background: disabled ? C.gray10 : C.green, color: disabled ? C.gray50 : C.black, cursor: disabled ? "default" : "pointer" }}>{children}</button>;
}
function BtnSec({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ink, cursor: "pointer" }}>{children}</button>;
}

function CellBadge({ st }: { st: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    na:        { label: "—",               bg: "#F4F4F5",  color: "#D4D4D8" },
    iniciar:   { label: "▶ Iniciar",        bg: C.blueLt,   color: "#0284C7" },
    andamento: { label: "⏳ Em andamento",  bg: C.amberLt,  color: C.amber },
    aprovacao: { label: "🔵 Ag. aprovação", bg: C.purpleLt, color: C.purple },
    concluido: { label: "✔ Concluído",      bg: C.greenLt,  color: C.greenDark },
  };
  const s = map[st] || map.na;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function PainelOKR() {
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [produtos, setProdutos] = useState<string[]>([]);
  const [triagem, setTriagem] = useState<TriagemItem[]>([]);
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [nextIds, setNextIds] = useState<NextIds>({ okr: 1, kr: 1, atv: 1, marco: 1, tri: 1, sis: 1, fase: 1, mod: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("okrs");
  const [toast, setToast] = useState({ msg: "", show: false });
  const toastRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stateRef = useRef({ okrs, pessoas, produtos, triagem, sistemas, nextIds });
  const pendingSave = useRef<Partial<{ okrs: OKR[]; pessoas: Pessoa[]; produtos: string[]; triagem: TriagemItem[]; sistemas: Sistema[]; nextIds: NextIds }>>({});

  // Kanban filters
  const [searchKan, setSearchKan] = useState(""); const [filtPessoa, setFiltPessoa] = useState(""); const [filtProduto, setFiltProduto] = useState(""); const [filtOkrKan, setFiltOkrKan] = useState(""); const [filtTag, setFiltTag] = useState("");
  // OKRs
  const [searchOkr, setSearchOkr] = useState(""); const [filtPeriodo, setFiltPeriodo] = useState(""); const [filtStatus, setFiltStatus] = useState("");
  // Implantacao
  const [filtImplSis, setFiltImplSis] = useState(""); const [filtImplSt, setFiltImplSt] = useState("");
  // Expanded
  const [expandedOkrs, setExpandedOkrs] = useState<Record<number, boolean>>({});
  const [expandedKrs, setExpandedKrs] = useState<Record<number, boolean>>({});
  // Detail modal
  const [detailAtvId, setDetailAtvId] = useState<number | null>(null);
  const [novoMarco, setNovoMarco] = useState("");
  // Modals
  const [modalOkr, setModalOkr] = useState(false); const [editOkrData, setEditOkrData] = useState<OKR | null>(null);
  const [fOkrTitulo, setFOkrTitulo] = useState(""); const [fOkrDesc, setFOkrDesc] = useState(""); const [fOkrPeriodo, setFOkrPeriodo] = useState(""); const [fOkrDono, setFOkrDono] = useState(""); const [fOkrStatus, setFOkrStatus] = useState("ativo");
  const [modalKr, setModalKr] = useState(false); const [krOkrId, setKrOkrId] = useState(0); const [fKrTitulo, setFKrTitulo] = useState(""); const [fKrMeta, setFKrMeta] = useState(""); const [fKrUnidade, setFKrUnidade] = useState(""); const [editKrId, setEditKrId] = useState<number | null>(null);
  const [modalAtv, setModalAtv] = useState(false); const [fAtvTitulo, setFAtvTitulo] = useState(""); const [fAtvResp, setFAtvResp] = useState(""); const [fAtvProduto, setFAtvProduto] = useState(""); const [fAtvPrazo, setFAtvPrazo] = useState(""); const [fAtvKrId, setFAtvKrId] = useState(0); const [editAtvId, setEditAtvId] = useState<number | null>(null);
  const [modalTriagem, setModalTriagem] = useState(false); const [editTriId, setEditTriId] = useState<number | null>(null);
  const [fTriTitulo, setFTriTitulo] = useState(""); const [fTriDesc, setFTriDesc] = useState(""); const [fTriObs, setFTriObs] = useState(""); const [fTriPrazo, setFTriPrazo] = useState(""); const [fTriPri, setFTriPri] = useState("media"); const [fTriOkrId, setFTriOkrId] = useState(""); const [fTriProduto, setFTriProduto] = useState("");
  const [modalDeleg, setModalDeleg] = useState(false); const [delegTriId, setDelegTriId] = useState<number | null>(null); const [fDelResp, setFDelResp] = useState(""); const [fDelKrId, setFDelKrId] = useState(""); const [fDelPrazo, setFDelPrazo] = useState("");
  const [modalItem, setModalItem] = useState(false); const [itemTipo, setItemTipo] = useState<"pessoa" | "produto">("pessoa"); const [fItemNome, setFItemNome] = useState("");
  const [modalSis, setModalSis] = useState(false); const [editSisId, setEditSisId] = useState<number | null>(null); const [fSisNome, setFSisNome] = useState(""); const [fSisResp, setFSisResp] = useState(""); const [fSisInicio, setFSisInicio] = useState(""); const [fSisFim, setFSisFim] = useState("");
  const [modalFase, setModalFase] = useState(false); const [faseSisId, setFaseSisId] = useState(0); const [fFaseNome, setFFaseNome] = useState(""); const [editFaseId, setEditFaseId] = useState<number | null>(null);
  const [modalMod, setModalMod] = useState(false); const [modSisId, setModSisId] = useState(0); const [fModNome, setFModNome] = useState(""); const [editModId, setEditModId] = useState<number | null>(null);
  const [modalIniciar, setModalIniciar] = useState(false); const [iniciarCtx, setIniciarCtx] = useState<{ sid: number; fid: number; mid: number; titulo: string } | null>(null);
  const [fIniTitulo, setFIniTitulo] = useState(""); const [fIniDesc, setFIniDesc] = useState(""); const [fIniPrazo, setFIniPrazo] = useState(""); const [fIniPri, setFIniPri] = useState("media"); const [fIniResp, setFIniResp] = useState(""); const [fIniProduto, setFIniProduto] = useState("");
  const [modalComt, setModalComt] = useState(false); const [comtCtx, setComtCtx] = useState<{ sid: number; fid: number; mid: number } | null>(null); const [fComtTexto, setFComtTexto] = useState("");
  const [openPlanos, setOpenPlanos] = useState<Set<string>>(() => new Set());

  const showToast = useCallback((msg: string) => {
    setToast({ msg, show: true });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  }, []);

  useEffect(() => {
    stateRef.current = { okrs, pessoas, produtos, triagem, sistemas, nextIds };
  }, [okrs, pessoas, produtos, triagem, sistemas, nextIds]);

  // ── LOAD ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await loadFromSupabase();
      if (data && (data.okrs.length > 0 || data.pessoas.length > 0)) {
        setOkrs(data.okrs); setPessoas(data.pessoas); setProdutos(data.produtos);
        setTriagem(data.triagem); setSistemas(data.sistemas); setNextIds(data.nextIds);
        setLastSaved(data.updatedAt);
      } else {
        const seed = defaultSeed();
        setOkrs(seed.okrs); setPessoas(seed.pessoas); setProdutos(seed.produtos);
        setTriagem(seed.triagem); setSistemas(seed.sistemas); setNextIds(seed.nextIds);
        await saveToSupabase(seed);
      }
      setLoading(false);
    })();
  }, []);

  // ── SAVE (debounced, shared) ──
  const saveState = useCallback((newState: { okrs?: OKR[]; pessoas?: Pessoa[]; produtos?: string[]; triagem?: TriagemItem[]; sistemas?: Sistema[]; nextIds?: NextIds }) => {
    pendingSave.current = { ...pendingSave.current, ...newState };
    clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(async () => {
      const merged = { ...stateRef.current, ...pendingSave.current };
      pendingSave.current = {};
      setSaving(true);
      try {
        await saveToSupabase(merged);
        setLastSaved(new Date().toISOString());
      } catch (error) {
        console.error("Erro ao salvar OKR", error);
        showToast("⚠ Não foi possível salvar no banco.");
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [showToast]);

  const updOkrs = useCallback((v: OKR[]) => { setOkrs(v); saveState({ okrs: v }); }, [saveState]);
  const updTriagem = useCallback((v: TriagemItem[]) => { setTriagem(v); saveState({ triagem: v }); }, [saveState]);
  const updSistemas = useCallback((v: Sistema[]) => { setSistemas(v); saveState({ sistemas: v }); }, [saveState]);
  const updPessoas = useCallback((v: Pessoa[]) => { setPessoas(v); saveState({ pessoas: v }); }, [saveState]);
  const updProdutos = useCallback((v: string[]) => { setProdutos(v); saveState({ produtos: v }); }, [saveState]);

  // helpers that also update nextIds
  function nextId(field: keyof NextIds): number {
    const currentIds = stateRef.current.nextIds;
    const v = currentIds[field];
    const newIds = { ...currentIds, [field]: v + 1 };
    stateRef.current = { ...stateRef.current, nextIds: newIds };
    setNextIds(newIds);
    saveState({ nextIds: newIds });
    return v;
  }

  // ── OKR CRUD ──
  const openAddOkr = () => { setFOkrTitulo(""); setFOkrDesc(""); setFOkrPeriodo(""); setFOkrDono(""); setFOkrStatus("ativo"); setEditOkrData(null); setModalOkr(true); };
  const openEditOkr = (o: OKR) => { setFOkrTitulo(o.titulo); setFOkrDesc(o.descricao || ""); setFOkrPeriodo(o.periodo || ""); setFOkrDono(o.dono || ""); setFOkrStatus(o.status || "ativo"); setEditOkrData(o); setModalOkr(true); };
  const saveOkr = () => {
    if (!fOkrTitulo.trim() || !fOkrPeriodo.trim()) { alert("Preencha título e período."); return; }
    const data = { titulo: fOkrTitulo, descricao: fOkrDesc, periodo: fOkrPeriodo, dono: fOkrDono, status: fOkrStatus };
    let v: OKR[];
    if (editOkrData) { v = okrs.map(o => o.id === editOkrData.id ? { ...o, ...data } : o); }
    else { const id = nextId("okr"); v = [...okrs, { id, krs: [], criadoEm: new Date().toISOString().slice(0, 10), ...data }]; }
    updOkrs(v); setModalOkr(false); showToast("Objetivo salvo!");
  };
  const deleteOkr = (id: number) => { if (!confirm("Excluir este objetivo?")) return; updOkrs(okrs.filter(o => o.id !== id)); showToast("Excluído"); };

  // ── KR CRUD ──
  const openAddKr = (okrId: number) => { setKrOkrId(okrId); setFKrTitulo(""); setFKrMeta(""); setFKrUnidade(""); setEditKrId(null); setModalKr(true); };
  const openEditKr = (okrId: number, kr: KR) => { setKrOkrId(okrId); setFKrTitulo(kr.titulo); setFKrMeta(String(kr.meta ?? "")); setFKrUnidade(kr.unidade || ""); setEditKrId(kr.id); setModalKr(true); };
  const saveKr = () => {
    if (!fKrTitulo.trim() || isNaN(parseFloat(fKrMeta))) { alert("Preencha título e meta."); return; }
    const id = editKrId ?? nextId("kr");
    const v = okrs.map(o => o.id === krOkrId ? { ...o, krs: editKrId ? (o.krs || []).map(k => k.id === editKrId ? { ...k, titulo: fKrTitulo, meta: parseFloat(fKrMeta), unidade: fKrUnidade } : k) : [...(o.krs || []), { id, okrId: krOkrId, titulo: fKrTitulo, meta: parseFloat(fKrMeta), unidade: fKrUnidade, atividades: [] }] } : o);
    updOkrs(v); setModalKr(false); showToast("Key Result salvo!");
  };
  const deleteKr = (krId: number, okrId: number) => { if (!confirm("Excluir este KR?")) return; updOkrs(okrs.map(o => o.id === okrId ? { ...o, krs: (o.krs || []).filter(k => k.id !== krId) } : o)); showToast("Excluído"); };

  // ── ATV CRUD ──
  const openAddAtv = (krId: number) => { setFAtvKrId(krId); setFAtvTitulo(""); setFAtvResp(pessoas[0] ? nomePessoa(pessoas[0]) : ""); setFAtvProduto(produtos[0] || ""); setFAtvPrazo(""); setEditAtvId(null); setModalAtv(true); };
  const saveAtv = () => {
    if (!fAtvTitulo.trim()) { alert("Preencha o título."); return; }
    const res = findKr(okrs, fAtvKrId); if (!res) { alert("KR não encontrado."); return; }
    let v: OKR[];
    if (editAtvId !== null) {
      // Localiza a atividade atual para preservar campos não editados no formulário
      let atvAtual: Atividade | null = null;
      okrs.forEach(o => (o.krs || []).forEach(k => (k.atividades || []).forEach(a => { if (a.id === editAtvId) atvAtual = a; })));
      const atvAtualizada: Atividade = {
        ...(atvAtual as unknown as Atividade),
        id: editAtvId,
        krId: fAtvKrId,
        titulo: fAtvTitulo,
        responsavel: fAtvResp,
        produto: fAtvProduto,
        prazo: fAtvPrazo,
      };
      // Remove de qualquer KR anterior e reinsere no KR selecionado (permite trocar de KR)
      v = okrs.map(o => ({
        ...o,
        krs: (o.krs || []).map(k => {
          const semEla = (k.atividades || []).filter(a => a.id !== editAtvId);
          if (k.id === fAtvKrId) return { ...k, atividades: [...semEla, atvAtualizada] };
          return { ...k, atividades: semEla };
        }),
      }));
      showToast("Atividade atualizada!");
    } else {
      const id = nextId("atv");
      v = okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => k.id === fAtvKrId ? { ...k, atividades: [...(k.atividades || []), { id, krId: fAtvKrId, titulo: fAtvTitulo, responsavel: fAtvResp, produto: fAtvProduto, prazo: fAtvPrazo, tags: [], marcos: [], criadoEm: new Date().toISOString().slice(0, 10), concluidoEm: null }] } : k) }));
      showToast("Atividade adicionada!");
    }
    updOkrs(v); setModalAtv(false); setEditAtvId(null);
  };

  const deleteAtv = (atvId: number) => { if (!confirm("Excluir esta atividade?")) return; updOkrs(okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).filter(a => a.id !== atvId) })) }))); setDetailAtvId(null); showToast("Excluído"); };

  // ── MARCOS ──
  const toggleMarco = (atvId: number, marcoId: number, checked: boolean) => {
    const v = okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).map(a => { if (a.id !== atvId) return a; const ms = (a.marcos || []).map(m => m.id === marcoId ? { ...m, concluido: checked } : m); const pct = ms.filter(m => m.concluido).length / Math.max(ms.length, 1) * 100; return { ...a, marcos: ms, concluidoEm: pct === 100 ? new Date().toISOString().slice(0, 10) : null }; }) })) }));
    updOkrs(v);
  };
  const addMarco = () => {
    if (!novoMarco.trim() || detailAtvId === null) return;
    const id = nextId("marco");
    updOkrs(okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).map(a => a.id === detailAtvId ? { ...a, marcos: [...(a.marcos || []), { id, titulo: novoMarco.trim(), concluido: false }], concluidoEm: null } : a) })) })));
    setNovoMarco("");
  };
  const deleteMarco = (atvId: number, marcoId: number) => { updOkrs(okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).map(a => a.id === atvId ? { ...a, marcos: (a.marcos || []).filter(m => m.id !== marcoId) } : a) })) }))); };
  const toggleTag = (tag: string) => {
    if (detailAtvId === null) return;
    updOkrs(okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).map(a => { if (a.id !== detailAtvId) return a; const tags = [...(a.tags || [])]; const idx = tags.indexOf(tag); if (idx >= 0) tags.splice(idx, 1); else tags.push(tag); return { ...a, tags }; }) })) })));
  };
  const moverValidacao = () => {
    if (detailAtvId === null) return;
    updOkrs(okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).map(a => a.id === detailAtvId ? { ...a, validacao: !a.validacao } : a) })) })));
  };
  const quickVal = (atvId: number) => { updOkrs(okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => ({ ...k, atividades: (k.atividades || []).map(a => a.id === atvId ? { ...a, validacao: !a.validacao } : a) })) }))); };

  // ── TRIAGEM ──
  const openAddTriagem = () => { setFTriTitulo(""); setFTriDesc(""); setFTriObs(""); setFTriPrazo(""); setFTriPri("media"); setFTriOkrId(""); setFTriProduto(""); setEditTriId(null); setModalTriagem(true); };
  const openEditTriagem = (id: number) => { const t = triagem.find(x => x.id === id); if (!t) return; setFTriTitulo(t.titulo); setFTriDesc(t.descricao || ""); setFTriObs(t.obs || ""); setFTriPrazo(t.prazo || ""); setFTriPri(t.prioridade || "media"); setFTriOkrId(String(t.okrId || "")); setFTriProduto(t.produto || ""); setEditTriId(id); setModalTriagem(true); };
  const saveTriagem = () => {
    if (!fTriTitulo.trim()) { alert("Preencha o título."); return; }
    const okrId = fTriOkrId ? parseInt(fTriOkrId) : null;
    const o = okrId ? okrs.find(x => x.id === okrId) : null;
    const data = { titulo: fTriTitulo, descricao: fTriDesc, obs: fTriObs, prioridade: fTriPri, prazo: fTriPrazo, produto: fTriProduto, okrId, okrTitulo: o?.titulo || "", criadoEm: new Date().toISOString().slice(0, 10) };
    let v: TriagemItem[];
    if (editTriId !== null) { v = triagem.map(x => x.id === editTriId ? { ...x, ...data } : x); showToast("Tarefa atualizada!"); }
    else { const id = nextId("tri"); v = [...triagem, { id, ...data }]; showToast("Adicionada à fila!"); }
    updTriagem(v); setModalTriagem(false);
  };
  const delegarParaKanban = (id: number) => {
    const t = triagem.find(x => x.id === id); if (!t) return;
    setDelegTriId(id); setFDelResp(t.responsavelSugerido || ""); setFDelKrId(""); setFDelPrazo(t.prazo || "");
    setModalDeleg(true);
  };
  const confirmarDelegacao = () => {
    if (!fDelResp) { alert("Selecione o responsável."); return; }
    if (!fDelKrId) { alert("Selecione o Key Result."); return; }
    const t = triagem.find(x => x.id === delegTriId); if (!t) return;
    const res = findKr(okrs, parseInt(fDelKrId)); if (!res) { alert("KR não encontrado."); return; }
    const kr = res.kr;
    const id = nextId("atv");
    const newOkrs = okrs.map(o => ({ ...o, krs: (o.krs || []).map(k => k.id === kr.id ? { ...k, atividades: [...(k.atividades || []), { id, krId: kr.id, titulo: t.titulo, responsavel: fDelResp, produto: t.produto || "", prazo: fDelPrazo || t.prazo || "", tags: [], marcos: [{ id: nextId("marco"), titulo: "Conclusão", concluido: false }], criadoEm: t.criadoEm || new Date().toISOString().slice(0, 10), concluidoEm: null, obs: t.obs || "", implRef: t.implRef || "" }] } : k) }));
    const newTri = triagem.filter(x => x.id !== delegTriId);
    setOkrs(newOkrs); setTriagem(newTri);
    saveState({ okrs: newOkrs, triagem: newTri });
    setModalDeleg(false); showToast("✔ Delegada para o Kanban!");
  };

  // ── PESSOAS/PRODUTOS ──
  const saveItem = () => {
    if (!fItemNome.trim()) { alert("Preencha o nome."); return; }
    if (itemTipo === "pessoa") { if (!pessoas.find(p => nomePessoa(p) === fItemNome)) updPessoas([...pessoas, { nome: fItemNome, foto: "" }]); }
    else { if (!produtos.includes(fItemNome)) updProdutos([...produtos, fItemNome]); }
    setModalItem(false); showToast("Adicionado!");
  };
  const uploadFoto = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const v = [...pessoas]; v[idx] = { ...v[idx], foto: e.target?.result as string };
      updPessoas(v); showToast("Foto atualizada!");
    };
    reader.readAsDataURL(file);
  };

  // ── SISTEMAS ──
  const saveSis = () => {
    if (!fSisNome.trim()) { alert("Preencha o nome."); return; }
    let v: Sistema[];
    if (editSisId !== null) { v = sistemas.map(s => s.id === editSisId ? { ...s, nome: fSisNome, responsavel: fSisResp, inicio: fSisInicio, fim: fSisFim } : s); showToast("Sistema atualizado!"); }
    else { const id = nextId("sis"); v = [...sistemas, { id, nome: fSisNome, responsavel: fSisResp, inicio: fSisInicio, fim: fSisFim, fases: [], modulos: [], matriz: {}, _open: true }]; showToast("Sistema criado!"); }
    updSistemas(v); setModalSis(false);
  };
  const saveFase = () => {
    if (!fFaseNome.trim()) { alert("Preencha o nome."); return; }
    if (editFaseId != null) {
      updSistemas(sistemas.map(s => s.id === faseSisId ? { ...s, fases: (s.fases || []).map(f => f.id === editFaseId ? { ...f, nome: fFaseNome } : f) } : s));
      setModalFase(false); setEditFaseId(null); showToast("Fase atualizada!");
      return;
    }
    const id = nextId("fase");
    updSistemas(sistemas.map(s => s.id === faseSisId ? { ...s, fases: [...(s.fases || []), { id, nome: fFaseNome, sistemaId: faseSisId }] } : s));
    setModalFase(false); showToast("Fase adicionada!");
  };
  const saveMod = () => {
    if (!fModNome.trim()) { alert("Preencha o nome."); return; }
    if (editModId != null) {
      updSistemas(sistemas.map(s => s.id === modSisId ? { ...s, modulos: (s.modulos || []).map(m => m.id === editModId ? { ...m, nome: fModNome } : m) } : s));
      setModalMod(false); setEditModId(null); showToast("Módulo atualizado!");
      return;
    }
    const id = nextId("mod");
    updSistemas(sistemas.map(s => s.id === modSisId ? { ...s, modulos: [...(s.modulos || []), { id, nome: fModNome, sistemaId: modSisId }] } : s));
    setModalMod(false); showToast("Módulo adicionado!");
  };
  const cycleCell = (sid: number, fid: number, mid: number) => {
    const s = sistemas.find(x => x.id === sid); if (!s) return;
    const implRef = `${sid}_${fid}_${mid}`;
    const trVinc = triagem.find(t => t.implRef === implRef);
    
    const cur = (s.matriz || {})[`${fid}_${mid}`] || "na";
    // Se ainda não há tarefa na Triagem para esta célula, abre modal para criar
    if (!trVinc) {
      const titulo = `${s.nome} – ${(s.fases || []).find(f => f.id === fid)?.nome || ""} · ${(s.modulos || []).find(m => m.id === mid)?.nome || ""}`;
      setIniciarCtx({ sid, fid, mid, titulo });
      setFIniTitulo(titulo); setFIniDesc(""); setFIniPrazo(""); setFIniPri("media"); setFIniResp(""); setFIniProduto("");
      setModalIniciar(true);
      return;
    }
    if (trVinc) { if (!confirm("Remover da triagem e voltar para —?")) return; updTriagem(triagem.filter(t => t.implRef !== implRef)); }
    updSistemas(sistemas.map(s2 => s2.id === sid ? { ...s2, matriz: { ...(s2.matriz || {}), [`${fid}_${mid}`]: cur === "na" ? "iniciar" : "na" } } : s2));
  };
  const confirmarIniciar = () => {
    if (!fIniTitulo.trim() || !iniciarCtx) { alert("Preencha o título."); return; }
    const { sid, fid, mid } = iniciarCtx;
    const implRef = `${sid}_${fid}_${mid}`;
    const id = nextId("tri");
    const newTri = [...triagem, { id, titulo: fIniTitulo, descricao: fIniDesc, obs: "Originado da Implantação de Processos", prioridade: fIniPri, prazo: fIniPrazo, produto: fIniProduto, responsavelSugerido: fIniResp, okrId: null, okrTitulo: "", criadoEm: new Date().toISOString().slice(0, 10), implRef }];
    const newSis = sistemas.map(s => s.id === sid ? { ...s, matriz: { ...(s.matriz || {}), [`${fid}_${mid}`]: "iniciar" } } : s);
    setTriagem(newTri); setSistemas(newSis);
    saveState({ triagem: newTri, sistemas: newSis });
    setModalIniciar(false); showToast("✔ Tarefa criada na Fila de Triagem!");
  };
  const saveComt = () => {
    if (!comtCtx) return;
    const { sid, fid, mid } = comtCtx;
    updSistemas(sistemas.map(s => s.id === sid ? { ...s, comentarios: { ...(s.comentarios || {}), [`${fid}_${mid}`]: fComtTexto } } : s));
    setModalComt(false); showToast(fComtTexto ? "Comentário salvo!" : "Comentário removido");
  };

  // ── DERIVED ──
  const atvs = useMemo(() => todasAtividades(okrs), [okrs]);
  const filteredAtvs = useMemo(() => {
    const q = searchKan.toLowerCase();
    return atvs.filter(a => {
      if (q && !a.titulo.toLowerCase().includes(q) && !(a.responsavel || "").toLowerCase().includes(q)) return false;
      if (filtPessoa && a.responsavel !== filtPessoa) return false;
      if (filtProduto && a.produto !== filtProduto) return false;
      if (filtOkrKan && a.okrId !== parseInt(filtOkrKan)) return false;
      if (filtTag && !(a.tags || []).includes(filtTag)) return false;
      return true;
    });
  }, [atvs, searchKan, filtPessoa, filtProduto, filtOkrKan, filtTag]);

  const kanbanCols = useMemo(() => {
    const visivel = filteredAtvs.filter(a => statusAtv(a) !== "concluido");
    return {
      naoIniciado: visivel.filter(a => statusAtv(a) === "nao_iniciado"),
      andamento: visivel.filter(a => statusAtv(a) === "andamento"),
      validacao: visivel.filter(a => statusAtv(a) === "validacao"),
      concluidas: filteredAtvs.filter(a => statusAtv(a) === "concluido"),
    };
  }, [filteredAtvs]);

  const filteredOkrs = useMemo(() => {
    const q = searchOkr.toLowerCase();
    return okrs.filter(o => {
      if (q && !o.titulo.toLowerCase().includes(q)) return false;
      if (filtPeriodo && o.periodo !== filtPeriodo) return false;
      if (filtStatus && o.status !== filtStatus) return false;
      return true;
    });
  }, [okrs, searchOkr, filtPeriodo, filtStatus]);

  const periodos = useMemo(() => [...new Set(okrs.map(o => o.periodo).filter(Boolean))], [okrs]);

  const triagemOrdenada = useMemo(() => {
    const ord: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
    return [...triagem].sort((a, b) => (ord[a.prioridade] || 1) - (ord[b.prioridade] || 1) || (a.prazo < b.prazo ? -1 : 1));
  }, [triagem]);

  const detailAtv = useMemo(() => detailAtvId !== null ? findAtv(okrs, detailAtvId) : null, [okrs, detailAtvId]);

  // ── TOPBAR / TABS ──
  const TH: React.CSSProperties = { fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "10px 16px", border: "none", background: "none", cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -2, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
  const tabs: [TabId, string, number][] = [
    ["okrs", "OKRs", okrs.length],
    ["implantacao", "Implantação", sistemas.length],
    ["triagem", "Fila de Triagem", triagem.length],
    ["gestao", "Gestão", filteredAtvs.filter(a => statusAtv(a) !== "concluido").length],
    ["config", "Configuração", pessoas.length + produtos.length],
  ];

  if (loading) return (
    <div style={{ fontFamily: "'Poppins',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, color: C.gray50 }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${C.gray10}`, borderTopColor: C.green, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Carregando dados do banco...</span>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Poppins',sans-serif", background: "#FAFAFA", minHeight: "100vh", fontSize: 14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* TOPBAR */}
      <div style={{ background: C.black, height: 54, display: "flex", alignItems: "center", padding: "0 22px", gap: 10, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ width: 30, height: 30, background: C.green, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: C.black }}>P</div>
        <strong style={{ color: "#fff", fontSize: 13 }}>Painel OKR</strong>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,.4)" }}>
            <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.2)", borderTopColor: C.green, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            Salvando...
          </div>}
          {lastSaved && !saving && <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>Salvo {new Date(lastSaved).toLocaleString("pt-BR")}</span>}
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: C.white, borderBottom: `2px solid ${C.border}`, display: "flex", padding: "0 22px", overflowX: "auto", alignItems: "center" }}>
        {tabs.map(([id, label, badge]) => {
          const act = activeTab === id;
          return <button key={id} onClick={() => setActiveTab(id)} style={{ ...TH, color: act ? C.greenDark : C.gray50, borderBottomColor: act ? C.green : "transparent" }}>
            {label}
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 12, background: act ? C.greenLt : C.gray10, color: act ? C.greenDark : C.gray50 }}>{badge}</span>
          </button>;
        })}
        <div style={{ flex: 1 }} />
        <button onClick={() => { setActiveTab("gestao"); (() => { if (!okrs.length) { showToast("Crie um Objetivo primeiro."); return; } const primeiroKr = okrs.flatMap(o => o.krs || [])[0]; if (!primeiroKr) { showToast("Crie um Key Result primeiro."); return; } setFAtvKrId(primeiroKr.id); setFAtvTitulo(""); setFAtvResp(pessoas[0] ? nomePessoa(pessoas[0]) : ""); setFAtvProduto(produtos[0] || ""); setFAtvPrazo(""); setEditAtvId(null); setModalAtv(true); })(); }}
          style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: "none", background: C.green, color: C.black, cursor: "pointer", margin: "6px 0" }}>
          + Nova Atividade
        </button>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "22px 22px 80px" }}>

        {/* ══ ABA: OKRs ══ */}
        {activeTab === "okrs" && <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 340 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", opacity: .4, pointerEvents: "none" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input value={searchOkr} onChange={e => setSearchOkr(e.target.value)} placeholder="Buscar objetivo..." style={{ width: "100%", fontFamily: "inherit", fontSize: 12, padding: "8px 10px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }} />
            </div>
            <select value={filtPeriodo} onChange={e => setFiltPeriodo(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }}>
              <option value="">Todos os períodos</option>
              {periodos.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={filtStatus} onChange={e => setFiltStatus(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }}>
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option><option value="concluido">Concluído</option><option value="pausado">Pausado</option>
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={openAddOkr} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", background: C.green, color: C.black, cursor: "pointer" }}>+ Novo Objetivo</button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard type="all" title="Total de OKRs" sub="" value={okrs.length} />
            <StatCard type="ok" title="Progresso médio" sub="" value={okrs.length ? `${Math.round(okrs.reduce((s, o) => s + progressoOkr(o), 0) / okrs.length)}%` : "0%"} />
            <StatCard type="amb" title="Em andamento" sub="" value={atvs.filter(a => statusAtv(a) === "andamento").length} />
            <StatCard type="warn" title="Atrasadas" sub="" value={atvs.filter(isAtrasada).length} />
          </div>

          {/* Resumo: por pessoa × centro de processo e atividades por centro */}
          {(() => {
            const abertas = atvs.filter(a => statusAtv(a) !== "concluido");
            const porPessoa = new Map<string, { total: number; abertas: number; centros: Map<string, number> }>();
            const porCentro = new Map<string, { total: number; abertas: number; concluidas: number; pessoas: Set<string> }>();
            for (const a of atvs) {
              const resp = (a.responsavel || "—").trim() || "—";
              const centro = (a.produto || "Sem centro").trim() || "Sem centro";
              const aberta = statusAtv(a) !== "concluido";
              if (!porPessoa.has(resp)) porPessoa.set(resp, { total: 0, abertas: 0, centros: new Map() });
              const p = porPessoa.get(resp)!;
              p.total++; if (aberta) p.abertas++;
              p.centros.set(centro, (p.centros.get(centro) || 0) + 1);
              if (!porCentro.has(centro)) porCentro.set(centro, { total: 0, abertas: 0, concluidas: 0, pessoas: new Set() });
              const c = porCentro.get(centro)!;
              c.total++; if (aberta) c.abertas++; else c.concluidas++; c.pessoas.add(resp);
            }
            const pessoasArr = [...porPessoa.entries()].sort((a, b) => b[1].abertas - a[1].abertas || b[1].total - a[1].total);
            const centrosArr = [...porCentro.entries()].sort((a, b) => b[1].total - a[1].total);
            if (!atvs.length) return null;
            const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: C.gray50, textTransform: "uppercase", letterSpacing: ".05em", borderBottom: `1px solid ${C.border}` };
            const td: React.CSSProperties = { padding: "8px 12px", fontSize: 12, color: C.ink, borderBottom: `1px solid ${C.border}` };
            const chip = (txt: string) => <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: C.greenLt, color: C.greenDark, marginRight: 4, marginBottom: 2 }}>{txt}</span>;
            return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: C.charcoal, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: ".05em" }}>Por pessoa · centros de processo</div>
                <div style={{ maxHeight: 320, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Pessoa</th><th style={th}>Centros</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, textAlign: "right", color: C.amber }}>Abertas</th></tr></thead>
                    <tbody>
                      {pessoasArr.map(([nome, info]) => <tr key={nome}>
                        <td style={{ ...td, fontWeight: 600, color: C.charcoal, whiteSpace: "nowrap" }}>{nome}</td>
                        <td style={td}>{[...info.centros.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => chip(`${c} ${n}`))}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{info.total}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: info.abertas ? C.amber : C.gray30 }}>{info.abertas}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: C.charcoal, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: ".05em" }}>Atividades por centro de processo</div>
                <div style={{ maxHeight: 320, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Centro</th><th style={{ ...th, textAlign: "right" }}>Pessoas</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, textAlign: "right", color: C.amber }}>Abertas</th><th style={{ ...th, textAlign: "right", color: C.greenDark }}>Concl.</th></tr></thead>
                    <tbody>
                      {centrosArr.map(([nome, info]) => <tr key={nome}>
                        <td style={{ ...td, fontWeight: 600, color: C.charcoal }}>{nome}</td>
                        <td style={{ ...td, textAlign: "right" }}>{info.pessoas.size}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{info.total}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: info.abertas ? C.amber : C.gray30 }}>{info.abertas}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: info.concluidas ? C.greenDark : C.gray30 }}>{info.concluidas}</td>
                      </tr>)}
                      <tr><td style={{ ...td, fontWeight: 700, color: C.charcoal }}>Total</td><td style={{ ...td, textAlign: "right" }}>{new Set(atvs.map(a => (a.responsavel || "—"))).size}</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{atvs.length}</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: C.amber }}>{abertas.length}</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: C.greenDark }}>{atvs.length - abertas.length}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>;
          })()}

          {!filteredOkrs.length ? <div style={{ padding: 40, textAlign: "center", color: C.gray30 }}>Nenhum objetivo. Clique em + Novo Objetivo.</div> :
            filteredOkrs.map(o => {
              const pct = progressoOkr(o); const isOpen = expandedOkrs[o.id];
              return <div key={o.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
                <div onClick={() => setExpandedOkrs(prev => ({ ...prev, [o.id]: !prev[o.id] }))} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.charcoal, marginBottom: 4 }}>{o.titulo}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: C.gray50 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 20, background: o.status === "ativo" ? C.greenLt : C.gray10, color: o.status === "ativo" ? C.greenDark : C.gray50, fontWeight: 600, fontSize: 10 }}>{o.status}</span>
                      <span>{o.periodo}</span><span>·</span><span>{o.dono || "—"}</span><span>·</span><span>{(o.krs || []).length} KR(s)</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
                    <div style={{ flex: 1, height: 7, background: C.gray10, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: 7, background: corPct(pct), borderRadius: 4, width: `${pct}%` }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: corPct(pct), minWidth: 35 }}>{pct}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <IcBtn onClick={() => openEditOkr(o)} title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></IcBtn>
                    <IcBtn onClick={() => deleteOkr(o.id)} title="Excluir" danger><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg></IcBtn>
                  </div>
                </div>
                {isOpen && <div style={{ borderTop: `1px solid ${C.border}`, padding: "0 18px 14px" }}>
                  {o.descricao && <div style={{ fontSize: 12, color: C.gray50, padding: "10px 0 4px" }}>{o.descricao}</div>}
                  {(o.krs || []).map(kr => {
                    const kpct = progressoKr(kr); const kOpen = expandedKrs[kr.id];
                    const atual = Math.round((kpct / 100) * (kr.meta || 0));
                    return <div key={kr.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 10, overflow: "hidden" }}>
                      <div onClick={() => setExpandedKrs(prev => ({ ...prev, [kr.id]: !prev[kr.id] }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: kOpen ? C.gray05 : "transparent" }}>
                        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.charcoal }}>{kr.titulo}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: corPct(kpct) }}>{atual}/{kr.meta} {kr.unidade}</span>
                        <div style={{ width: 70, height: 6, background: C.gray10, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${kpct}%`, height: 6, background: corPct(kpct) }} /></div>
                        <div style={{ display: "flex", gap: 3 }} onClick={e => e.stopPropagation()}>
                          <IcBtn onClick={() => openEditKr(o.id, kr)} title="Editar KR"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></IcBtn>
                          <IcBtn onClick={() => deleteKr(kr.id, o.id)} title="Excluir KR" danger><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg></IcBtn>
                        </div>
                      </div>
                      {kOpen && <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px" }}>
                        {(kr.atividades || []).map(a => {
                          const ap = progressoAtv(a); const at = isAtrasada(a);
                          return <div key={a.id} onClick={() => setDetailAtvId(a.id)} style={{ display: "grid", gridTemplateColumns: "1fr auto auto 120px auto", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}`, alignItems: "center", cursor: "pointer" }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: C.ink }}>{a.titulo}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><Avatar nome={a.responsavel} size={20} pessoas={pessoas} /><span style={{ fontSize: 10, color: C.gray70 }}>{a.responsavel || "—"}</span></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, width: 100 }}><ProgressBar pct={ap} /><span style={{ fontSize: 10, fontWeight: 700, color: corPct(ap) }}>{ap}%</span></div>
                            <span style={{ fontSize: 10, color: at ? C.red : C.gray30 }}>{at ? "⚠ " : ""}{fmtData(a.prazo)}</span>
                          </div>;
                        })}
                        <button onClick={() => openAddAtv(kr.id)} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 600, padding: "5px 10px", borderRadius: 6, border: `1px dashed ${C.border}`, background: "transparent", color: C.gray50, cursor: "pointer", marginTop: 6 }}>+ Adicionar Atividade</button>
                      </div>}
                    </div>;
                  })}
                  <button onClick={() => openAddKr(o.id)} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 600, padding: "5px 10px", borderRadius: 6, border: `1px dashed ${C.border}`, background: "transparent", color: C.gray50, cursor: "pointer", marginTop: 10 }}>+ Adicionar Key Result</button>
                </div>}
              </div>;
            })}
        </div>}

        {/* ══ ABA: GESTÃO (KANBAN) ══ */}
        {activeTab === "gestao" && <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", opacity: .4, pointerEvents: "none" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input value={searchKan} onChange={e => setSearchKan(e.target.value)} placeholder="Buscar atividade..." style={{ width: "100%", fontFamily: "inherit", fontSize: 12, padding: "8px 10px 8px 32px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }} />
            </div>
            {[{ id: "filtPessoa", value: filtPessoa, set: setFiltPessoa, opt: pessoas.map(p => nomePessoa(p)), label: "Todas as pessoas" }, { id: "filtProduto", value: filtProduto, set: setFiltProduto, opt: produtos, label: "Todos os produtos" }].map(f => (
              <select key={f.id} value={f.value} onChange={e => f.set(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }}>
                <option value="">{f.label}</option>
                {f.opt.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            <select value={filtOkrKan} onChange={e => setFiltOkrKan(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }}>
              <option value="">Todos os OKRs</option>
              {okrs.map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}
            </select>
            <select value={filtTag} onChange={e => setFiltTag(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }}>
              <option value="">Todas as tags</option>
              {Object.entries(TAG_DEFS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {([["naoIniciado", "Não iniciado", C.gray50], ["andamento", "Em andamento", C.amber], ["validacao", "Validação", "#0284C7"], ["concluidas", "Concluídas", C.greenDark]] as [keyof typeof kanbanCols, string, string][]).map(([col, label, cor]) => (
              <div key={col} style={{ background: C.gray05, borderRadius: 14, padding: "0 0 8px" }}>
                <div style={{ padding: "12px 14px 8px", fontWeight: 700, fontSize: 12, color: cor, borderBottom: `2px solid ${cor}22` }}>
                  {label} <span style={{ fontWeight: 600, color: C.gray50 }}>({kanbanCols[col].length})</span>
                </div>
                <div style={{ padding: "8px 8px 0" }}>
                  {!kanbanCols[col].length ? <div style={{ padding: "20px 8px", textAlign: "center", fontSize: 11, color: C.gray30 }}>Nenhuma</div> :
                    kanbanCols[col].map(a => {
                      const pct = progressoAtv(a); const at = isAtrasada(a); const isDone = col === "concluidas";
                      return <div key={a.id} onClick={() => setDetailAtvId(a.id)} style={{ background: C.white, border: `1px solid ${isDone ? "#6ee7b7" : C.border}`, borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer", opacity: isDone ? .8 : 1 }}>
                        {(a.tags || []).length > 0 && <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>{(a.tags || []).map((t, i) => <TagChip key={i} tag={t} />)}</div>}
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.charcoal, marginBottom: 3, lineHeight: 1.35 }}>{a.titulo}</div>
                        <div style={{ fontSize: 10, color: C.gray50, marginBottom: 8 }}>{a.okrTitulo}</div>
                        {(a.marcos || []).length > 0 && <><div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}><ProgressBar pct={pct} /><span style={{ fontSize: 10, fontWeight: 700, color: corPct(pct) }}>{pct}%</span></div><div style={{ fontSize: 10, color: C.gray50, marginBottom: 8 }}>{(a.marcos || []).filter(m => m.concluido).length}/{(a.marcos || []).length} marcos</div></>}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><Avatar nome={a.responsavel} size={20} pessoas={pessoas} /><span style={{ fontSize: 10, color: C.gray70 }}>{a.responsavel || "—"}</span></div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {a.produto && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: C.purpleLt, color: C.purple }}>{a.produto}</span>}
                            {!isDone && (statusAtv(a) === "andamento" || statusAtv(a) === "validacao") && <button onClick={e => { e.stopPropagation(); quickVal(a.id); }} style={{ fontFamily: "inherit", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, border: `1.5px solid ${C.blue}`, background: C.blueLt, color: "#0284C7", cursor: "pointer" }}>{a.validacao ? "↩" : "→ Val."}</button>}
                            {isDone ? <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: C.greenLt, color: C.greenDark }}>✔ Concluída</span> : <span style={{ fontSize: 10, color: at ? C.red : C.gray30 }}>{at ? "⚠ " : ""}{fmtData(a.prazo)}</span>}
                          </div>
                        </div>
                      </div>;
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>}

        {/* ══ ABA: TRIAGEM ══ */}
        {activeTab === "triagem" && <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.charcoal, flex: 1 }}>Fila de Triagem</div>
            <button onClick={openAddTriagem} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", background: C.green, color: C.black, cursor: "pointer" }}>+ Planejar Tarefa</button>
          </div>
          {!triagemOrdenada.length ? <div style={{ padding: 40, textAlign: "center", color: C.gray30 }}>✅ Nenhuma tarefa aguardando delegação</div> :
            triagemOrdenada.map(t => {
              const at = t.prazo && new Date(t.prazo) < new Date();
              const priColors = { alta: { bg: C.redLt, c: C.red }, media: { bg: C.amberLt, c: C.amber }, baixa: { bg: C.greenLt, c: C.greenDark } }[t.prioridade || "media"] || { bg: C.gray10, c: C.gray50 };
              return <div key={t.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "grid", gridTemplateColumns: "1fr 180px 130px 90px 130px auto", gap: 12, alignItems: "center" }}>
                <div><div style={{ fontWeight: 600, fontSize: 12, color: C.charcoal }}>{t.titulo}</div>{t.descricao && <div style={{ fontSize: 11, color: C.gray50, marginTop: 2 }}>{t.descricao}</div>}</div>
                <div style={{ fontSize: 11, color: C.gray70 }}>{t.okrTitulo || <span style={{ color: C.gray30 }}>—</span>}</div>
                <div>{t.produto && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: C.purpleLt, color: C.purple }}>{t.produto}</span>}</div>
                <div><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: priColors.bg, color: priColors.c }}>{t.prioridade}</span></div>
                <div style={{ fontSize: 11, color: at ? C.red : C.gray70 }}>{at ? "⚠ " : ""}{fmtData(t.prazo)}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => delegarParaKanban(t.id)} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "none", background: C.greenLt, color: C.greenDark, cursor: "pointer" }}>▶ Delegar</button>
                  <IcBtn onClick={() => openEditTriagem(t.id)} title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></IcBtn>
                  <IcBtn onClick={() => { if (!confirm("Remover esta tarefa?")) return; updTriagem(triagem.filter(x => x.id !== t.id)); }} title="Remover" danger><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg></IcBtn>
                </div>
              </div>;
            })}
        </div>}


        {/* ══ ABA: IMPLANTAÇÃO ══ */}
        {activeTab === "implantacao" && <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={filtImplSis} onChange={e => setFiltImplSis(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none", minWidth: 200 }}>
              <option value="">Todos os sistemas</option>
              {sistemas.map(s => <option key={s.id} value={String(s.id)}>{s.nome}</option>)}
            </select>
            <select value={filtImplSt} onChange={e => setFiltImplSt(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 10, outline: "none" }}>
              <option value="">Todos os status</option>
              <option value="nao_iniciado">Não iniciado</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluido">Concluído</option>
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setEditSisId(null); setFSisNome(""); setFSisResp(""); setFSisInicio(""); setFSisFim(""); setModalSis(true); }} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", background: C.green, color: C.black, cursor: "pointer" }}>+ Novo Sistema</button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <StatCard type="all" title="Sistemas" sub="Total" value={sistemas.length} />
            <StatCard type="ok" title="Concluídos" sub="100%" value={sistemas.filter(s => sistemaProgresso(s, okrs, triagem) === 100).length} />
            <StatCard type="amb" title="Em andamento" sub="Parcial" value={sistemas.filter(s => { const p = sistemaProgresso(s, okrs, triagem); return p > 0 && p < 100; }).length} />
            <StatCard type="warn" title="Não iniciados" sub="0%" value={sistemas.filter(s => sistemaProgresso(s, okrs, triagem) === 0).length} />
          </div>
          {sistemas
            .filter(s => {
              if (filtImplSis && s.id !== parseInt(filtImplSis)) return false;
              if (filtImplSt) { const p = sistemaProgresso(s, okrs, triagem); if (filtImplSt === "concluido" && p !== 100) return false; if (filtImplSt === "em_andamento" && !(p > 0 && p < 100)) return false; if (filtImplSt === "nao_iniciado" && p !== 0) return false; }
              return true;
            })
            .map(s => {
              const pct = sistemaProgresso(s, okrs, triagem); const cor = corPct(pct); const isOpen = s._open;
              return <div key={s.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
                {/* Sistema header */}
                <div onClick={() => updSistemas(sistemas.map(x => x.id === s.id ? { ...x, _open: !x._open } : x))} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.charcoal }}>{s.nome}</div>
                    <div style={{ fontSize: 11, color: C.gray50, marginTop: 3 }}>
                      {s.responsavel && `👤 ${s.responsavel}`}{s.inicio && ` · 📅 ${fmtData(s.inicio)} → ${fmtData(s.fim)}`} · {(s.fases || []).length} fases · {(s.modulos || []).length} módulos
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
                    <div style={{ flex: 1, height: 7, background: C.gray10, borderRadius: 4, overflow: "hidden" }}><div style={{ height: 7, background: cor, borderRadius: 4, width: `${pct}%` }} /></div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>{pct}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                    <IcBtn onClick={() => { setEditSisId(s.id); setFSisNome(s.nome); setFSisResp(s.responsavel || ""); setFSisInicio(s.inicio || ""); setFSisFim(s.fim || ""); setModalSis(true); }} title="Editar">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </IcBtn>
                    <IcBtn onClick={() => { if (!confirm("Excluir este sistema e toda a sua estrutura?")) return; updSistemas(sistemas.filter(x => x.id !== s.id)); }} title="Excluir" danger>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </IcBtn>
                  </div>
                </div>
                {/* Sistema body */}
                {isOpen && <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {(s.fases || []).length && (s.modulos || []).length ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", minWidth: 600, width: "100%" }}>
                        <thead>
                          <tr style={{ background: C.gray05 }}>
                            <th style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, color: C.gray50, textAlign: "left", whiteSpace: "nowrap", minWidth: 130 }}>Fase \ Módulo</th>
                            {(s.modulos || []).map(m => (
                              <th key={m.id} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: C.charcoal, textAlign: "center", whiteSpace: "nowrap" }}>
                                {m.nome}
                                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 2 }}>
                                  <button onClick={() => { setModSisId(s.id); setEditModId(m.id); setFModNome(m.nome); setModalMod(true); }} style={{ fontSize: 9, background: "none", border: "none", color: C.gray50, cursor: "pointer" }} title="Editar módulo">✎</button>
                                  <button onClick={() => { if (!confirm(`Remover módulo "${m.nome}"?`)) return; updSistemas(sistemas.map(x => x.id === s.id ? { ...x, modulos: (x.modulos || []).filter(mx => mx.id !== m.id) } : x)); }} style={{ fontSize: 9, background: "none", border: "none", color: C.gray30, cursor: "pointer" }} title="Remover módulo">✕</button>
                                </div>
                              </th>
                            ))}
                            <th style={{ width: 70 }}>
                              <button onClick={() => { setModSisId(s.id); setEditModId(null); setFModNome(""); setModalMod(true); }} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 700, background: "none", border: `1px dashed ${C.border}`, color: C.greenDark, cursor: "pointer", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" }}>+ Módulo</button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(s.fases || []).map(f => {
                            const planoRowId = `plano-${s.id}-${f.id}`;
                            return <React.Fragment key={f.id}>
                              <tr style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: C.charcoal, whiteSpace: "nowrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {f.nome}
                                    <button onClick={() => { const pid = planoRowId; setOpenPlanos(prev => { const s2 = new Set(prev); if (s2.has(pid)) s2.delete(pid); else s2.add(pid); return s2; }); }} style={{ fontSize: 9, background: "none", border: "none", color: C.gray50, cursor: "pointer", padding: "1px 4px", borderRadius: 4 }} title="Plano de ações">≡</button>
                                    <button onClick={() => { setFaseSisId(s.id); setEditFaseId(f.id); setFFaseNome(f.nome); setModalFase(true); }} style={{ fontSize: 9, background: "none", border: "none", color: C.gray50, cursor: "pointer", padding: "1px 4px" }} title="Editar fase">✎</button>
                                    <button onClick={() => { if (!confirm(`Remover fase "${f.nome}"?`)) return; updSistemas(sistemas.map(x => x.id === s.id ? { ...x, fases: (x.fases || []).filter(fx => fx.id !== f.id) } : x)); }} style={{ fontSize: 9, background: "none", border: "none", color: C.gray30, cursor: "pointer", marginLeft: "auto" }} title="Remover fase">✕</button>
                                  </div>
                                </td>
                                {(s.modulos || []).map(m => {
                                  const st = statusImplCell(s, okrs, triagem, f.id, m.id);
                                  const key = `${f.id}_${m.id}`;
                                  const hasComt = !!((s.comentarios || {})[key] || "").trim();
                                  const cellColors: Record<string, { bg: string; color: string; label: string }> = {
                                    na:        { bg: "#F4F4F5",  color: "#D4D4D8",   label: "—" },
                                    iniciar:   { bg: C.blueLt,   color: "#0284C7",   label: "▶ Iniciar" },
                                    andamento: { bg: C.amberLt,  color: C.amber,     label: "⏳ Em and." },
                                    aprovacao: { bg: C.purpleLt, color: C.purple,    label: "🔵 Aprovação" },
                                    concluido: { bg: C.greenLt,  color: C.greenDark, label: "✔ Concluído" },
                                  };
                                  const cs = cellColors[st] || cellColors.na;
                                  return <td key={m.id} style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                                      <span onClick={() => cycleCell(s.id, f.id, m.id)} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: cs.bg, color: cs.color, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>{cs.label}</span>
                                      <button onClick={() => { setComtCtx({ sid: s.id, fid: f.id, mid: m.id }); setFComtTexto((s.comentarios || {})[key] || ""); setModalComt(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: hasComt ? C.amber : C.gray30, fontSize: 14, padding: 0, lineHeight: 1 }} title={hasComt ? "Ver comentário" : "Adicionar comentário"}>💬</button>
                                    </div>
                                  </td>;
                                })}
                                <td />
                              </tr>
                              {/* Plano de ações expandível por fase */}
                              {openPlanos.has(planoRowId) && <tr>
                                <td colSpan={(s.modulos || []).length + 2} style={{ padding: 0 }}>
                                  <div style={{ background: "rgba(0,0,0,.02)", borderTop: `1px solid ${C.border}`, padding: "10px 14px" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${(s.modulos || []).length}, 1fr)`, gap: 10 }}>
                                      {(s.modulos || []).map(m => {
                                        const planoKey = `plano_${s.id}_${f.id}_${m.id}`;
                                        const itens = (s.planos || {})[planoKey] || [];
                                        const done = itens.filter((i: { done: boolean }) => i.done).length;
                                        return <div key={m.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                                          <div style={{ fontSize: 10, fontWeight: 700, color: C.charcoal, marginBottom: 6 }}>{m.nome} {itens.length > 0 && <span style={{ color: corPct(itens.length ? Math.round(done / itens.length * 100) : 0) }}>{done}/{itens.length}</span>}</div>
                                          {itens.map((item: { texto: string; done: boolean }, idx: number) => (
                                            <label key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, cursor: "pointer" }}>
                                              <input type="checkbox" checked={item.done} onChange={e => {
                                                const newSis = sistemas.map(sx => { if (sx.id !== s.id) return sx; const newPlanos = { ...(sx.planos || {}) }; const arr = [...(newPlanos[planoKey] || [])]; arr[idx] = { ...arr[idx], done: e.target.checked }; newPlanos[planoKey] = arr; return { ...sx, planos: newPlanos }; });
                                                updSistemas(newSis);
                                              }} />
                                              <span style={{ fontSize: 11, textDecoration: item.done ? "line-through" : "none", color: item.done ? C.gray30 : C.ink, flex: 1 }}>{item.texto}</span>
                                              <button onClick={() => {
                                                const newSis = sistemas.map(sx => { if (sx.id !== s.id) return sx; const newPlanos = { ...(sx.planos || {}) }; const arr = [...(newPlanos[planoKey] || [])]; arr.splice(idx, 1); newPlanos[planoKey] = arr; return { ...sx, planos: newPlanos }; });
                                                updSistemas(newSis);
                                              }} style={{ background: "none", border: "none", color: C.gray30, cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
                                            </label>
                                          ))}
                                          <input placeholder="+ Ação (Enter)" style={{ width: "100%", fontFamily: "inherit", fontSize: 11, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6, outline: "none", marginTop: 4 }}
                                            onKeyDown={e => {
                                              if (e.key !== "Enter") return;
                                              const txt = (e.target as HTMLInputElement).value.trim(); if (!txt) return;
                                              const newSis = sistemas.map(sx => { if (sx.id !== s.id) return sx; const newPlanos = { ...(sx.planos || {}) }; newPlanos[planoKey] = [...(newPlanos[planoKey] || []), { texto: txt, done: false }]; return { ...sx, planos: newPlanos }; });
                                              updSistemas(newSis);
                                              (e.target as HTMLInputElement).value = "";
                                            }} />
                                        </div>;
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>}
                            </React.Fragment>;
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <div style={{ padding: "20px 18px", color: C.gray50, fontSize: 12 }}>Adicione fases e módulos para montar a matriz.</div>}
                  {/* Footer actions */}
                  <div style={{ display: "flex", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => { setFaseSisId(s.id); setEditFaseId(null); setFFaseNome(""); setModalFase(true); }} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>+ Fase</button>
                    <button onClick={() => { setModSisId(s.id); setEditModId(null); setFModNome(""); setModalMod(true); }} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>+ Módulo</button>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", fontSize: 10, color: C.gray50 }}>
                      <span>Clique para avançar:</span>
                      {([["na","—","#F4F4F5","#D4D4D8"],["iniciar","▶ Iniciar",C.blueLt,"#0284C7"],["andamento","⏳ Em and.",C.amberLt,C.amber],["aprovacao","🔵 Aprovação",C.purpleLt,C.purple],["concluido","✔ Concluído",C.greenLt,C.greenDark]] as [string,string,string,string][]).map(([,label,bg,color]) => (
                        <span key={label} style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 12, background: bg, color }}>{label}</span>
                      ))}
                    </div>
                  </div>
                </div>}
              </div>;
            })}
        </div>}

        {/* ══ ABA: CONFIGURAÇÃO ══ */}
        {activeTab === "config" && <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {([
              { title: "Pessoas", sub: "Responsáveis pelas atividades", tipo: "pessoa" as const, items: pessoas.map(p => nomePessoa(p)) },
              { title: "Produtos / Centros de Custo", sub: "Categorias de atividades e sistemas", tipo: "produto" as const, items: produtos },
            ] as const).map(({ title, sub, tipo, items }) => (
              <div key={tipo} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div><div style={{ fontSize: 13, fontWeight: 800, color: C.charcoal }}>{title}</div><div style={{ fontSize: 10, color: C.gray50 }}>{sub}</div></div>
                  <button onClick={() => { setItemTipo(tipo); setFItemNome(""); setModalItem(true); }} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "none", background: C.green, color: C.black, cursor: "pointer" }}>+ Adicionar</button>
                </div>
                <div style={{ padding: "8px 14px" }}>
                  {!items.length
                    ? <div style={{ padding: "14px 0", color: C.gray30, fontSize: 11 }}>Nenhum cadastrado</div>
                    : items.map((item, i) => {
                      const p = tipo === "pessoa" ? pessoas[i] : null;
                      return <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                        {tipo === "pessoa" ? (
                          <label style={{ cursor: "pointer" }} title="Clique para alterar foto">
                            {p?.foto
                              ? <img src={p.foto} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} alt={item} />
                              : <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.greenLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: C.greenDark }}>{item.charAt(0)}</div>}
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && uploadFoto(i, e.target.files[0])} />
                          </label>
                        ) : <div style={{ width: 28, height: 28, borderRadius: 7, background: C.purpleLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.purple }}>{item.charAt(0)}</div>}
                        <span style={{ flex: 1, fontSize: 12 }}>{item}</span>
                        <IcBtn onClick={() => {
                          if (tipo === "pessoa") updPessoas(pessoas.filter((_, j) => j !== i));
                          else updProdutos(produtos.filter((_, j) => j !== i));
                          showToast("Removido");
                        }} title="Remover" danger>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg>
                        </IcBtn>
                      </div>;
                    })}
                </div>
              </div>
            ))}
          </div>

          {/* Backup */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, marginTop: 16, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.charcoal, marginBottom: 4 }}>Backup e Restauração</div>
            <div style={{ fontSize: 11, color: C.gray50, marginBottom: 12 }}>Exporta OKRs, pessoas, produtos, triagem e implantações em JSON.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => {
                const d = { okrs, pessoas, produtos, triagem, sistemas, nextIds, exportadoEm: new Date().toISOString() };
                const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `painel_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
                showToast("Backup exportado!");
              }} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>⬇ Exportar JSON</button>
              <label style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>
                ⬆ Importar JSON
                <input type="file" accept=".json" style={{ display: "none" }} onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    try {
                      const d = JSON.parse(ev.target?.result as string);
                      if (!confirm(`Importar dados de '${file.name}'? Os dados atuais serão substituídos.`)) return;
                      setOkrs(d.okrs || []); setPessoas(d.pessoas || []); setProdutos(d.produtos || []);
                      setTriagem(d.triagem || []); setSistemas(d.sistemas || []); const importedNextIds = d.nextIds || d.next_ids || nextIds;
                      setNextIds(importedNextIds);
                      saveState({ okrs: d.okrs || [], pessoas: d.pessoas || [], produtos: d.produtos || [], triagem: d.triagem || [], sistemas: d.sistemas || [], nextIds: importedNextIds });
                      showToast("✔ Dados importados com sucesso!");
                    } catch { alert("Arquivo inválido."); }
                  };
                  reader.readAsText(file);
                }} />
              </label>
            </div>
          </div>
        </div>}

      </div>{/* fim maxWidth wrapper */}

      {/* ══ MODAIS ══ */}

      {/* OKR */}
      <Modal open={modalOkr} onClose={() => setModalOkr(false)} title={editOkrData ? "Editar Objetivo" : "Novo Objetivo"}
        footer={<><BtnSec onClick={() => setModalOkr(false)}>Cancelar</BtnSec><BtnPri onClick={saveOkr}>Salvar Objetivo</BtnPri></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <FI label="Título *"><input style={fi} value={fOkrTitulo} onChange={e => setFOkrTitulo(e.target.value)} placeholder="Ex: Aumentar eficiência operacional" /></FI>
          <FI label="Descrição"><input style={fi} value={fOkrDesc} onChange={e => setFOkrDesc(e.target.value)} placeholder="Por que este objetivo importa" /></FI>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Período *"><input style={fi} value={fOkrPeriodo} onChange={e => setFOkrPeriodo(e.target.value)} placeholder="Ex: T2 2026" /></FI>
            <FI label="Dono"><input style={fi} value={fOkrDono} onChange={e => setFOkrDono(e.target.value)} placeholder="Responsável geral" /></FI>
          </div>
          <FI label="Status"><select style={fi} value={fOkrStatus} onChange={e => setFOkrStatus(e.target.value)}><option value="ativo">Ativo</option><option value="concluido">Concluído</option><option value="pausado">Pausado</option></select></FI>
        </div>
      </Modal>

      {/* KR */}
      <Modal open={modalKr} onClose={() => setModalKr(false)} title={editKrId !== null ? "Editar Key Result" : "Novo Key Result"}
        footer={<><BtnSec onClick={() => setModalKr(false)}>Cancelar</BtnSec><BtnPri onClick={saveKr}>Salvar Key Result</BtnPri></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <FI label="Título *"><input style={fi} value={fKrTitulo} onChange={e => setFKrTitulo(e.target.value)} placeholder="Ex: Reduzir tempo médio de atendimento" /></FI>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Meta *"><input style={fi} type="number" value={fKrMeta} onChange={e => setFKrMeta(e.target.value)} placeholder="100" /></FI>
            <FI label="Unidade"><input style={fi} value={fKrUnidade} onChange={e => setFKrUnidade(e.target.value)} placeholder="%, dias, R$" /></FI>
          </div>
        </div>
      </Modal>

      {/* ATIVIDADE */}
      <Modal open={modalAtv} onClose={() => setModalAtv(false)} title={editAtvId !== null ? "Editar Atividade" : "Nova Atividade"}
        footer={<><BtnSec onClick={() => setModalAtv(false)}>Cancelar</BtnSec><BtnPri onClick={saveAtv}>Salvar Atividade</BtnPri></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <FI label="Key Result *">
            <select style={fi} value={fAtvKrId} onChange={e => setFAtvKrId(parseInt(e.target.value))}>
              {okrs.map(o => (o.krs || []).map(kr => <option key={kr.id} value={kr.id}>{o.titulo} › {kr.titulo}</option>))}
            </select>
          </FI>
          <FI label="Título *"><input style={fi} value={fAtvTitulo} onChange={e => setFAtvTitulo(e.target.value)} placeholder="Ex: Implementar automação no processo X" /></FI>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Responsável *"><select style={fi} value={fAtvResp} onChange={e => setFAtvResp(e.target.value)}>{pessoas.map(p => <option key={nomePessoa(p)}>{nomePessoa(p)}</option>)}</select></FI>
            <FI label="Produto"><select style={fi} value={fAtvProduto} onChange={e => setFAtvProduto(e.target.value)}><option value="">— Nenhum —</option>{produtos.map(p => <option key={p}>{p}</option>)}</select></FI>
          </div>
          <FI label="Prazo"><input style={fi} type="date" value={fAtvPrazo} onChange={e => setFAtvPrazo(e.target.value)} /></FI>
        </div>
      </Modal>

      {/* DETALHE ATIVIDADE */}
      {detailAtv && <Modal open={!!detailAtvId} onClose={() => setDetailAtvId(null)} title="Detalhe da Atividade"
        footer={<>
          <button onClick={() => { setFAtvKrId(detailAtv.kr.id); setFAtvTitulo(detailAtv.atv.titulo); setFAtvResp(detailAtv.atv.responsavel); setFAtvProduto(detailAtv.atv.produto); setFAtvPrazo(detailAtv.atv.prazo); setEditAtvId(detailAtv.atv.id); setDetailAtvId(null); setModalAtv(true); }} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" }}>Editar</button>
          <button onClick={() => deleteAtv(detailAtv.atv.id)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: `1px solid #fca5a5`, background: C.redLt, color: C.red, cursor: "pointer" }}>Excluir</button>
          <BtnSec onClick={() => setDetailAtvId(null)}>Fechar</BtnSec>
        </>}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, marginBottom: 4 }}>{detailAtv.atv.titulo}</div>
          <div style={{ fontSize: 11, color: C.gray50, marginBottom: 14 }}>{detailAtv.okr.titulo} › {detailAtv.kr.titulo}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <ProgressBar pct={progressoAtv(detailAtv.atv)} height={8} />
            <span style={{ fontSize: 16, fontWeight: 800, color: corPct(progressoAtv(detailAtv.atv)), minWidth: 40 }}>{progressoAtv(detailAtv.atv)}%</span>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar nome={detailAtv.atv.responsavel} size={24} pessoas={pessoas} /><span style={{ fontSize: 12 }}>{detailAtv.atv.responsavel || "—"}</span></div>
            {detailAtv.atv.produto && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: C.purpleLt, color: C.purple }}>{detailAtv.atv.produto}</span>}
            <span style={{ fontSize: 11, color: isAtrasada(detailAtv.atv) ? C.red : C.gray50 }}>{isAtrasada(detailAtv.atv) ? "⚠ " : "📅 "}{fmtData(detailAtv.atv.prazo)}</span>
          </div>
          {/* Tags */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.gray50, marginBottom: 6 }}>Tags</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(TAG_DEFS).map(([k, v]) => {
                const ativo = (detailAtv.atv.tags || []).includes(k);
                return <button key={k} onClick={() => toggleTag(k)} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${ativo ? v.cor : C.border}`, background: ativo ? v.bg : C.white, color: ativo ? v.cor : C.gray50, cursor: "pointer" }}>{v.label}</button>;
              })}
            </div>
          </div>
          {/* Botão validação */}
          {statusAtv(detailAtv.atv) !== "concluido" && (
            <button onClick={moverValidacao} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${detailAtv.atv.validacao ? C.amber : C.blue}`, background: detailAtv.atv.validacao ? C.amberLt : C.blueLt, color: detailAtv.atv.validacao ? C.amber : "#0284C7", cursor: "pointer", marginBottom: 14 }}>
              {detailAtv.atv.validacao ? "↩ Voltar p/ Andamento" : "→ Mover p/ Validação"}
            </button>
          )}
          {/* Marcos */}
          <div style={{ fontSize: 11, fontWeight: 600, color: C.gray50, marginBottom: 8 }}>Marcos</div>
          {!(detailAtv.atv.marcos || []).length && <div style={{ fontSize: 11, color: C.gray30, marginBottom: 10 }}>Nenhum marco</div>}
          {(detailAtv.atv.marcos || []).map(m => (
            <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <input type="checkbox" checked={m.concluido} onChange={e => toggleMarco(detailAtv.atv.id, m.id, e.target.checked)} />
              <span style={{ flex: 1, fontSize: 12, textDecoration: m.concluido ? "line-through" : "none", color: m.concluido ? C.gray30 : C.ink }}>{m.titulo}</span>
              <button onClick={e => { e.preventDefault(); deleteMarco(detailAtv.atv.id, m.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.gray30, fontSize: 12 }}>✕</button>
            </label>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input value={novoMarco} onChange={e => setNovoMarco(e.target.value)} onKeyDown={e => e.key === "Enter" && addMarco()} placeholder="Novo marco..." style={{ ...fi, flex: 1 }} />
            <BtnPri onClick={addMarco}>+</BtnPri>
          </div>
        </div>
      </Modal>}

      {/* TRIAGEM */}
      <Modal open={modalTriagem} onClose={() => setModalTriagem(false)} title={editTriId !== null ? "Editar Tarefa" : "Planejar Tarefa"}
        footer={<><BtnSec onClick={() => setModalTriagem(false)}>Cancelar</BtnSec><BtnPri onClick={saveTriagem}>Salvar na Fila</BtnPri></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <FI label="Título *"><input style={fi} value={fTriTitulo} onChange={e => setFTriTitulo(e.target.value)} placeholder="Ex: Revisar processos de onboarding" /></FI>
          <FI label="Descrição"><input style={fi} value={fTriDesc} onChange={e => setFTriDesc(e.target.value)} placeholder="Detalhes para o executor" /></FI>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Objetivo (OKR)"><select style={fi} value={fTriOkrId} onChange={e => setFTriOkrId(e.target.value)}><option value="">— Nenhum OKR —</option>{okrs.map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}</select></FI>
            <FI label="Produto"><select style={fi} value={fTriProduto} onChange={e => setFTriProduto(e.target.value)}><option value="">— Nenhum —</option>{produtos.map(p => <option key={p} value={p}>{p}</option>)}</select></FI>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Prioridade"><select style={fi} value={fTriPri} onChange={e => setFTriPri(e.target.value)}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></FI>
            <FI label="Prazo Estimado"><input style={fi} type="date" value={fTriPrazo} onChange={e => setFTriPrazo(e.target.value)} /></FI>
          </div>
          <FI label="Observação"><input style={fi} value={fTriObs} onChange={e => setFTriObs(e.target.value)} placeholder="Instruções, dependências, contexto..." /></FI>
        </div>
      </Modal>

      {/* DELEGAÇÃO */}
      <Modal open={modalDeleg} onClose={() => setModalDeleg(false)} title="Delegar para o Kanban"
        footer={<><BtnSec onClick={() => setModalDeleg(false)}>Cancelar</BtnSec><BtnPri onClick={confirmarDelegacao}>▶ Enviar ao Board</BtnPri></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: "10px 14px", background: C.greenLt, borderRadius: 10, fontSize: 12, fontWeight: 600, color: C.greenDark }}>{triagem.find(x => x.id === delegTriId)?.titulo}</div>
          <FI label="Responsável *"><select style={fi} value={fDelResp} onChange={e => setFDelResp(e.target.value)}><option value="">— Selecione —</option>{pessoas.map(p => <option key={nomePessoa(p)}>{nomePessoa(p)}</option>)}</select></FI>
          <FI label="Key Result *">
            <select style={fi} value={fDelKrId} onChange={e => setFDelKrId(e.target.value)}>
              <option value="">— Selecione o Key Result —</option>
              {okrs.map(o => (o.krs || []).map(kr => <option key={kr.id} value={kr.id}>{o.titulo} › {kr.titulo}</option>))}
            </select>
          </FI>
          <FI label="Prazo"><input style={fi} type="date" value={fDelPrazo} onChange={e => setFDelPrazo(e.target.value)} /></FI>
        </div>
      </Modal>

      {/* PESSOA / PRODUTO */}
      <Modal open={modalItem} onClose={() => setModalItem(false)} title={itemTipo === "pessoa" ? "Adicionar Pessoa" : "Adicionar Produto"}
        footer={<><BtnSec onClick={() => setModalItem(false)}>Cancelar</BtnSec><BtnPri onClick={saveItem}>Adicionar</BtnPri></>}>
        <FI label={itemTipo === "pessoa" ? "Nome da Pessoa" : "Produto / Centro de Custo"}>
          <input style={fi} value={fItemNome} onChange={e => setFItemNome(e.target.value)} onKeyDown={e => e.key === "Enter" && saveItem()} placeholder={itemTipo === "pessoa" ? "Ex: Ana Souza" : "Ex: Acessórias Web"} autoFocus />
        </FI>
      </Modal>

      {/* SISTEMA */}
      <Modal open={modalSis} onClose={() => setModalSis(false)} title={editSisId !== null ? "Editar Sistema" : "Novo Sistema"}
        footer={<><BtnSec onClick={() => setModalSis(false)}>Cancelar</BtnSec><BtnPri onClick={saveSis}>Salvar</BtnPri></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <FI label="Nome *"><input style={fi} value={fSisNome} onChange={e => setFSisNome(e.target.value)} placeholder="Ex: Implantação Acessórias Web" /></FI>
          <FI label="Responsável"><select style={fi} value={fSisResp} onChange={e => setFSisResp(e.target.value)}><option value="">— Nenhum —</option>{pessoas.map(p => <option key={nomePessoa(p)}>{nomePessoa(p)}</option>)}</select></FI>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Início"><input style={fi} type="date" value={fSisInicio} onChange={e => setFSisInicio(e.target.value)} /></FI>
            <FI label="Fim"><input style={fi} type="date" value={fSisFim} onChange={e => setFSisFim(e.target.value)} /></FI>
          </div>
        </div>
      </Modal>

      {/* FASE */}
      <Modal open={modalFase} onClose={() => { setModalFase(false); setEditFaseId(null); }} title={editFaseId != null ? "Editar Fase" : "Adicionar Fase"}
        footer={<><BtnSec onClick={() => { setModalFase(false); setEditFaseId(null); }}>Cancelar</BtnSec><BtnPri onClick={saveFase}>{editFaseId != null ? "Salvar" : "Adicionar"}</BtnPri></>}>
        <FI label="Nome da Fase *"><input style={fi} value={fFaseNome} onChange={e => setFFaseNome(e.target.value)} onKeyDown={e => e.key === "Enter" && saveFase()} placeholder="Ex: Configurações" autoFocus /></FI>
      </Modal>

      {/* MÓDULO */}
      <Modal open={modalMod} onClose={() => { setModalMod(false); setEditModId(null); }} title={editModId != null ? "Editar Módulo" : "Adicionar Módulo"}
        footer={<><BtnSec onClick={() => { setModalMod(false); setEditModId(null); }}>Cancelar</BtnSec><BtnPri onClick={saveMod}>{editModId != null ? "Salvar" : "Adicionar"}</BtnPri></>}>
        <FI label="Nome do Módulo *"><input style={fi} value={fModNome} onChange={e => setFModNome(e.target.value)} onKeyDown={e => e.key === "Enter" && saveMod()} placeholder="Ex: Cadastros" autoFocus /></FI>
      </Modal>

      {/* INICIAR (da Implantação → Triagem) */}
      <Modal open={modalIniciar} onClose={() => setModalIniciar(false)} title="Criar Tarefa de Implantação"
        footer={<><BtnSec onClick={() => setModalIniciar(false)}>Cancelar</BtnSec><BtnPri onClick={confirmarIniciar}>✔ Criar na Fila de Triagem</BtnPri></>}>
        <div style={{ fontSize: 11, color: C.gray50, marginBottom: 12 }}>{iniciarCtx?.titulo}</div>
        <div style={{ display: "grid", gap: 12 }}>
          <FI label="Título *"><input style={fi} value={fIniTitulo} onChange={e => setFIniTitulo(e.target.value)} /></FI>
          <FI label="Descrição"><input style={fi} value={fIniDesc} onChange={e => setFIniDesc(e.target.value)} /></FI>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Responsável sugerido"><select style={fi} value={fIniResp} onChange={e => setFIniResp(e.target.value)}><option value="">— Nenhum —</option>{pessoas.map(p => <option key={nomePessoa(p)}>{nomePessoa(p)}</option>)}</select></FI>
            <FI label="Produto / Sistema"><select style={fi} value={fIniProduto} onChange={e => setFIniProduto(e.target.value)}><option value="">— Nenhum —</option>{produtos.map(p => <option key={p} value={p}>{p}</option>)}</select></FI>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FI label="Prioridade"><select style={fi} value={fIniPri} onChange={e => setFIniPri(e.target.value)}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></FI>
            <FI label="Prazo"><input style={fi} type="date" value={fIniPrazo} onChange={e => setFIniPrazo(e.target.value)} /></FI>
          </div>
        </div>
      </Modal>

      {/* COMENTÁRIO de célula */}
      <Modal open={modalComt} onClose={() => setModalComt(false)} title="Comentário da Célula"
        footer={<><BtnSec onClick={() => { setFComtTexto(""); saveComt(); }}>Limpar</BtnSec><BtnSec onClick={() => setModalComt(false)}>Cancelar</BtnSec><BtnPri onClick={saveComt}>Salvar</BtnPri></>}>
        <textarea value={fComtTexto} onChange={e => setFComtTexto(e.target.value)} placeholder="Observações, bloqueios, links..." style={{ ...fi, resize: "vertical", minHeight: 100, width: "100%" }} autoFocus />
      </Modal>

      {/* TOAST */}
      <div style={{ position: "fixed", bottom: 22, right: 22, background: C.charcoal, color: "#fff", padding: "11px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, zIndex: 2000, transition: "all .25s", transform: toast.show ? "translateY(0)" : "translateY(14px)", opacity: toast.show ? 1 : 0, pointerEvents: "none" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12" /></svg>
        {toast.msg}
      </div>
    </div>
  );
}
