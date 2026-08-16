import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { HubShell } from "@/components/HubShell";
import { supabase } from "@/integrations/supabase/client";
import { listEmpresasAtivas, getEmpresaBaseResumo } from "@/lib/empresas-mensal";
import { ChevronLeft } from "lucide-react";


export const Route = createFileRoute("/processo/validacao-cadastro")({
  head: () => ({ meta: [{ title: "Validação de Cadastro — Planning Hub" }] }),
  component: ValidacaoCadastroPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Empresa {
  cnpj: string;
  razao: string;
  regime: string;
  ie: string;
  isento: string;
  im: string;
  uf: string;
  grupo: string;
  tags: string;
  tags_arr: string[];
  is_cc: boolean;
}

interface ResumoRow {
  cnpj: string;
  razao: string;
  grupo: string;
  cat: "regime" | "ie" | "im";
  problema: string;
  detalhe: string;
}

type TabId = "resumogeral" | "regime" | "filiaisLR" | "ie" | "im" | "cc";

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const PER = 50;
const CC_TAGS = ["Equipe DP 4", "Equipe CC 1", "Equipe CC 2", "Equipe CC 4", "Equipe Dedicada Canopus"];

const EQUIPES: Record<string, string[]> = {
  DP: ["Equipe DP 1", "Equipe DP 2"],
  Fiscal: ["Equipe Fiscal 1", "Equipe Fiscal 2", "Equipe Fiscal 3", "Equipe Fiscal 4", "Equipe Fiscal 5", "Equipe Fiscal 6", "Equipe Fiscal 7", "Equipe Fiscal 8"],
  Contábil: ["Equipe Contábil 1", "Equipe Contábil 2", "Equipe Contábil 3", "Equipe Contábil 4", "Equipe Contábil 5", "Equipe Contábil 6", "Equipe Contábil 7", "Equipe Contábil 8", "Equipe Contábil 9", "Equipe Contábil 10", "Equipe Dedicada Uniggel"],
  CC: ["Equipe DP 4", "Equipe CC 1", "Equipe CC 2", "Equipe CC 4", "Equipe Dedicada Canopus"],
  Outros: ["Equipe CBF", "Equipe Integração", "Equipe Contábil Teste 2", "Equipe Fiscal Teste 1"],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isentoSim(v: string) {
  return ["sim", "s", "yes", "1", "true"].includes((v || "").toLowerCase());
}
function isCC(tags: string[]) {
  return tags.some((t) => CC_TAGS.includes(t));
}
function isFiliaisGeral(e: Empresa) {
  const raw = e.cnpj.replace(/\D/g, "");
  if (raw.length < 14) return false;
  const sufixo = raw.substring(8, 12);
  if (sufixo === "0001") return false;
  return e.regime.toLowerCase().includes("geral");
}
function getSufixo(cnpj: string) {
  const raw = cnpj.replace(/\D/g, "");
  return raw.length >= 12 ? raw.substring(8, 12) : "?";
}
function buildResumoGeral(dados: Empresa[], tagFilter: string): ResumoRow[] {
  const rows: ResumoRow[] = [];
  dados.forEach((e) => {
    if (e.is_cc) return;
    if (tagFilter && !e.tags_arr.includes(tagFilter)) return;
    if (!e.regime) rows.push({ cnpj: e.cnpj, razao: e.razao, grupo: e.grupo, cat: "regime", problema: "Sem regime", detalhe: "Regime tributário não informado no cadastro" });
    if (!isentoSim(e.isento) && !e.ie) rows.push({ cnpj: e.cnpj, razao: e.razao, grupo: e.grupo, cat: "ie", problema: "Sem IE", detalhe: "Não isenta e sem Inscrição Estadual cadastrada" });
    if (!e.im) rows.push({ cnpj: e.cnpj, razao: e.razao, grupo: e.grupo, cat: "im", problema: "Sem IM", detalhe: "Inscrição Municipal não cadastrada" });
  });
  return rows;
}
function fmtDataHora(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function paginate<T>(data: T[], page: number) {
  const start = (page - 1) * PER;
  return { slice: data.slice(start, start + PER), total: data.length };
}

// ─── DB ──────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const sb = supabase as any;

async function loadEstado(): Promise<{ empresas: Empresa[]; file_name: string | null; saved_at: string | null; total: number } | null> {
  const { data, error } = await sb
    .from("validacao_cadastro_estado")
    .select("empresas,file_name,saved_at,total_empresas")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  if (!data) return null;
  return { empresas: data.empresas || [], file_name: data.file_name, saved_at: data.saved_at, total: data.total_empresas };
}

async function saveEstado(empresas: Empresa[], file_name: string) {
  const { error } = await sb
    .from("validacao_cadastro_estado")
    .upsert({ id: 1, empresas, file_name, total_empresas: empresas.length, saved_at: new Date().toISOString() });
  if (error) throw error;
}

async function clearEstado() {
  await sb.from("validacao_cadastro_estado").upsert({ id: 1, empresas: [], file_name: null, total_empresas: 0, saved_at: new Date().toISOString() });
}

// ─── SUB-COMPONENTES ─────────────────────────────────────────────────────────

function StatCard({ type, title, sub, value }: { type: "warn" | "ok" | "amb" | "all"; title: string; sub: string; value: number }) {
  const colors = {
    warn: { border: "#fca5a5", bg: "#FEE2E2", icon: "#DC2626", num: "#DC2626" },
    ok: { border: "#6ee7b7", bg: "#EAFBF4", icon: "#00BF63", num: "#00BF63" },
    amb: { border: "#fed7aa", bg: "#FFF3E0", icon: "#FA6914", num: "#FA6914" },
    all: { border: "#E2E2E2", bg: "#F2F2F2", icon: "#646464", num: "#2C2C2C" },
  }[type];
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden", minWidth: 160, flex: 1 }}>
      <div style={{ padding: "11px 14px 8px", borderBottom: "1px solid #E2E2E2", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: colors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={colors.icon} strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A1A" }}>{title}</div>
          <div style={{ fontSize: 10, color: "#646464" }}>{sub}</div>
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, padding: "10px 14px", color: colors.num }}>{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function Chip({ type, children }: { type: "r" | "a" | "g" | "b" | "gr"; children: React.ReactNode }) {
  const s = {
    r: { background: "#FEE2E2", color: "#DC2626" },
    a: { background: "#FFF3E0", color: "#FA6914" },
    g: { background: "#EAFBF4", color: "#00BF63" },
    b: { background: "#DDF6FF", color: "#0284C7" },
    gr: { background: "#E8E8E8", color: "#4A4A4A" },
  }[type];
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", ...s }}>{children}</span>;
}

function PgBtn({ children, onClick, disabled, active }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 6, border: "1px solid #E2E2E2", background: active ? "#1A1A1A" : "#fff", color: active ? "#fff" : "#4A4A4A", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1 }}>{children}</button>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / PER);
  if (!total) return null;
  const s = (page - 1) * PER + 1, e = Math.min(page * PER, total);
  const p1 = Math.max(1, page - 3), p2 = Math.min(pages, page + 3);
  const btns: number[] = [];
  for (let p = p1; p <= p2; p++) btns.push(p);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid #E2E2E2", background: "#F2F2F2" }}>
      <span style={{ fontSize: 11, color: "#646464" }}>{s.toLocaleString("pt-BR")}–{e.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span>
      <div style={{ display: "flex", gap: 3 }}>
        <PgBtn disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</PgBtn>
        {btns.map((p) => <PgBtn key={p} active={p === page} onClick={() => onPage(p)}>{p}</PgBtn>)}
        <PgBtn disabled={page >= pages} onClick={() => onPage(page + 1)}>›</PgBtn>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "44px 22px", gap: 9, color: "#646464" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36" style={{ opacity: 0.3 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <strong style={{ fontSize: 13, color: "#1A1A1A" }}>Nenhum resultado</strong>
      <span style={{ fontSize: 12 }}>Ajuste os filtros</span>
    </div>
  );
}

function AlertBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 14, fontSize: 12, background: "#FFF3E0", color: "#92400e" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      <span>{children}</span>
    </div>
  );
}

function TableWrap({ cols, headers, children, empty }: { cols: string; headers: string[]; children: React.ReactNode; empty: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E2E2", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, padding: "0 14px", background: "#F2F2F2", borderBottom: "1px solid #E2E2E2" }}>
        {headers.map((h) => <div key={h} style={{ padding: "9px 7px", fontSize: 10, fontWeight: 700, color: "#646464", textTransform: "uppercase", letterSpacing: ".5px" }}>{h}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {empty ? <Empty /> : children}
      </div>
    </div>
  );
}

function TR({ cols, children }: { cols: string; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, padding: "0 14px", borderBottom: "1px solid #E2E2E2", alignItems: "center" }}>{children}</div>;
}
function TD({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "8px 7px", fontSize: 11, color: "#2C2C2C", minWidth: 0 }}>{children}</div>;
}
function CNPJCell({ cnpj, sub, subColor }: { cnpj: string; sub?: string; subColor?: string }) {
  return (
    <TD>
      <span style={{ fontFamily: "monospace", fontSize: "10.5px", fontWeight: 600, color: "#1A1A1A" }}>{cnpj}</span>
      {sub && <div style={{ fontSize: 10, color: subColor || "#646464", marginTop: 1 }}>{sub}</div>}
    </TD>
  );
}
function RazaoCell({ razao, grupo }: { razao: string; grupo: string }) {
  return (
    <TD>
      <div title={razao} style={{ fontWeight: 600, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{razao}</div>
      <div style={{ fontSize: 10, color: "#646464", marginTop: 1 }}>{grupo}</div>
    </TD>
  );
}
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 340 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", fontFamily: "inherit", fontSize: 12, padding: "8px 10px 8px 32px", border: "1px solid #E2E2E2", borderRadius: 10, background: "#fff", color: "#2C2C2C", outline: "none" }} />
    </div>
  );
}
function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "7px 10px", border: "1px solid #E2E2E2", borderRadius: 10, background: "#fff", color: "#2C2C2C", outline: "none", cursor: "pointer" }}>{children}</select>
  );
}
function BtnExport({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", fontSize: 11, fontWeight: 600, padding: "7px 13px", borderRadius: 10, border: "1px solid #E2E2E2", background: "#fff", color: "#4A4A4A", cursor: "pointer", whiteSpace: "nowrap" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Exportar CSV
    </button>
  );
}
function EquipeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={onChange}>
      <option value="">Todas as equipes</option>
      {Object.entries(EQUIPES).map(([dept, equipes]) => (
        <optgroup key={dept} label={dept}>
          {equipes.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

function ValidacaoCadastroPage() {
  const [dados, setDados] = useState<Empresa[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("regime");
  const [tagFilter, setTagFilter] = useState("");
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: "", show: false });
  const [drag, setDrag] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingEstado, setLoadingEstado] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [pages, setPages] = useState<Record<string, number>>({ resumogeral: 1, regime: 1, filiaisLR: 1, ie: 1, im: 1, cc: 1 });
  const [searchResumo, setSearchResumo] = useState("");
  const [filtResumo, setFiltResumo] = useState("all");
  const [searchRegime, setSearchRegime] = useState("");
  const [searchFiliais, setSearchFiliais] = useState("");
  const [searchIE, setSearchIE] = useState("");
  const [filtIE, setFiltIE] = useState("sem_ie");
  const [searchIM, setSearchIM] = useState("");
  const [filtIM, setFiltIM] = useState("sem_im");
  const [searchCC, setSearchCC] = useState("");
  const [filtCC, setFiltCC] = useState("sem_regime");

  const showToast = useCallback((msg: string) => {
    setToast({ msg, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2800);
  }, []);

  useEffect(() => {
    (async () => {
      const est = await loadEstado();
      if (est && est.empresas.length) {
        setDados(est.empresas);
        setSavedAt(est.saved_at);
        setFileName(est.file_name);
        setActiveTab("resumogeral");
      }
      setLoadingEstado(false);
    })();
  }, []);

  const setPage = (tab: string, p: number) => setPages((prev) => ({ ...prev, [tab]: p }));

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    showToast("Processando planilha...");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
        const hdr = rows[0].map((h) => String(h).trim());
        const ci = (name: string) => hdr.indexOf(name);
        const cols = {
          cnpj: ci("CNPJ"), razao: ci("Razão social"), regime: ci("Regime"),
          ie: ci("Inscrições Estaduais"), isento: ci("Empresa Isenta"),
          im: ci("Insc. Municipal"), uf: ci("UF"), grupo: ci("Grupo de Empresas"), tags: ci("Tags"),
        };
        const novas: Empresa[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const cnpj = String(r[cols.cnpj] || "").trim();
          if (!cnpj) continue;
          const tags_raw = String(r[cols.tags] || "").trim();
          const tags_arr = tags_raw ? tags_raw.split(",").map((t) => t.trim()).filter((t) => t && t !== "CX") : [];
          novas.push({
            cnpj, razao: String(r[cols.razao] || "").trim().substring(0, 60),
            regime: String(r[cols.regime] || "").trim(),
            ie: String(r[cols.ie] || "").trim(), isento: String(r[cols.isento] || "").trim(),
            im: String(r[cols.im] || "").trim(), uf: String(r[cols.uf] || "").trim(),
            grupo: String(r[cols.grupo] || "").trim().substring(0, 40),
            tags: tags_raw, tags_arr, is_cc: isCC(tags_arr),
          });
        }
        setDados(novas);
        setFileName(file.name);
        setActiveTab("resumogeral");
        setPages({ resumogeral: 1, regime: 1, filiaisLR: 1, ie: 1, im: 1, cc: 1 });
        try {
          await saveEstado(novas, file.name);
          setSavedAt(new Date().toISOString());
          showToast(`${novas.length.toLocaleString("pt-BR")} empresas salvas no Hub!`);
        } catch (err) {
          console.error(err);
          showToast("Empresas carregadas, mas falhou ao salvar no Hub.");
        }
      } catch (err: unknown) {
        showToast("Erro: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsBinaryString(file);
  }, [showToast]);

  const carregarDaBase = useCallback(async () => {
    showToast("Carregando da Base Empresas ativa...");
    try {
      const resumo = await getEmpresaBaseResumo();
      if (!resumo.importacao) { showToast("Nenhuma Base Empresas ativa. Importe em /base-empresas"); return; }
      const linhas = await listEmpresasAtivas();
      if (!linhas.length) { showToast("Base ativa está vazia"); return; }
      const novas: Empresa[] = linhas.map((l) => {
        const d = (l.dados || {}) as Record<string, unknown>;
        const tags_raw = String(d["Tags"] ?? (l.tags || []).join(", ")).trim();
        const tags_arr = tags_raw ? tags_raw.split(",").map(t => t.trim()).filter(t => t && t !== "CX") : [];
        return {
          cnpj: l.cnpj,
          razao: String(l.razao ?? d["Razão social"] ?? "").substring(0, 60),
          regime: String(l.regime ?? d["Regime"] ?? "").trim(),
          ie: String(d["Inscrições Estaduais"] ?? "").trim(),
          isento: String(d["Empresa Isenta"] ?? "").trim(),
          im: String(d["Insc. Municipal"] ?? "").trim(),
          uf: String(d["UF"] ?? "").trim(),
          grupo: String(l.grupo ?? d["Grupo de Empresas"] ?? "").substring(0, 40),
          tags: tags_raw, tags_arr, is_cc: isCC(tags_arr),
        };
      });
      setDados(novas);
      const nome = `Base Empresas ${String(resumo.competencia || "").slice(0, 7)} · ${novas.length} empresas`;
      setFileName(nome);
      setActiveTab("resumogeral");
      setPages({ resumogeral: 1, regime: 1, filiaisLR: 1, ie: 1, im: 1, cc: 1 });
      try {
        await saveEstado(novas, nome);
        setSavedAt(new Date().toISOString());
        showToast(`${novas.length.toLocaleString("pt-BR")} empresas carregadas da Base e salvas no Hub!`);
      } catch (e) {
        console.warn(e);
        showToast("Carregado da Base, mas falhou ao salvar no Hub");
      }
    } catch (e: unknown) {
      showToast("Erro ao carregar Base: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [showToast]);


  const tagMatch = useCallback((e: Empresa) => {
    if (!tagFilter) return true;
    return e.tags_arr.includes(tagFilter);
  }, [tagFilter]);

  const naoCC = dados.filter((e) => !e.is_cc && tagMatch(e));
  const filteredRegime = naoCC.filter((e) => !e.regime && (!searchRegime || e.cnpj.toLowerCase().includes(searchRegime.toLowerCase()) || e.razao.toLowerCase().includes(searchRegime.toLowerCase()) || e.grupo.toLowerCase().includes(searchRegime.toLowerCase())));
  const filteredFiliais = dados.filter((e) => tagMatch(e) && isFiliaisGeral(e) && (!searchFiliais || e.cnpj.toLowerCase().includes(searchFiliais.toLowerCase()) || e.razao.toLowerCase().includes(searchFiliais.toLowerCase()) || e.grupo.toLowerCase().includes(searchFiliais.toLowerCase())));
  const sem_ie = naoCC.filter((e) => !isentoSim(e.isento) && !e.ie);
  const com_ie = naoCC.filter((e) => !isentoSim(e.isento) && !!e.ie);
  const isentas = naoCC.filter((e) => isentoSim(e.isento));
  const poolIE = filtIE === "sem_ie" ? sem_ie : filtIE === "com_ie" ? com_ie : filtIE === "isentas" ? isentas : naoCC;
  const filteredIE = poolIE.filter((e) => !searchIE || e.cnpj.toLowerCase().includes(searchIE.toLowerCase()) || e.razao.toLowerCase().includes(searchIE.toLowerCase()) || e.grupo.toLowerCase().includes(searchIE.toLowerCase()));
  const sem_im = naoCC.filter((e) => !e.im);
  const com_im = naoCC.filter((e) => !!e.im);
  const poolIM = filtIM === "sem_im" ? sem_im : filtIM === "com_im" ? com_im : naoCC;
  const filteredIM = poolIM.filter((e) => !searchIM || e.cnpj.toLowerCase().includes(searchIM.toLowerCase()) || e.razao.toLowerCase().includes(searchIM.toLowerCase()) || e.grupo.toLowerCase().includes(searchIM.toLowerCase()));
  const ccAll = dados.filter((e) => e.is_cc && tagMatch(e));
  const poolCC = filtCC === "sem_regime" ? ccAll.filter((e) => !e.regime) : filtCC === "sem_ie" ? ccAll.filter((e) => !isentoSim(e.isento) && !e.ie) : filtCC === "sem_im" ? ccAll.filter((e) => !e.im) : ccAll;
  const filteredCC = poolCC.filter((e) => !searchCC || e.cnpj.toLowerCase().includes(searchCC.toLowerCase()) || e.razao.toLowerCase().includes(searchCC.toLowerCase()) || e.grupo.toLowerCase().includes(searchCC.toLowerCase()));

  const allResumoRows = buildResumoGeral(dados, tagFilter);
  const porCat = { regime: 0, ie: 0, im: 0 } as Record<string, number>;
  allResumoRows.forEach((r) => { porCat[r.cat] = (porCat[r.cat] || 0) + 1; });
  const filteredResumo = allResumoRows.filter((r) => {
    if (filtResumo !== "all" && r.cat !== filtResumo) return false;
    if (searchResumo && !(r.cnpj + r.razao + r.grupo).toLowerCase().includes(searchResumo.toLowerCase())) return false;
    return true;
  });

  const tabs: { id: TabId; label: string; badge: number; badgeType: "r" | "a" | "none" }[] = [
    { id: "resumogeral", label: "Resumo Geral", badge: allResumoRows.length, badgeType: "r" },
    { id: "regime", label: "Regime Tributário", badge: naoCC.filter((e) => !e.regime).length, badgeType: "r" },
    { id: "filiaisLR", label: "Filiais c/ Regime Geral", badge: dados.filter((e) => tagMatch(e) && isFiliaisGeral(e)).length, badgeType: "a" },
    { id: "ie", label: "Inscrição Estadual", badge: sem_ie.length, badgeType: "r" },
    { id: "im", label: "Inscrição Municipal", badge: sem_im.length, badgeType: "a" },
    { id: "cc", label: "Construção Civil", badge: ccAll.length, badgeType: "none" },
  ];

  const showUpload = dados.length === 0 && !loadingEstado;

  const handleExport = (tab: TabId) => {
    if (tab === "resumogeral") exportCSV("validacao_resumogeral.csv", ["CNPJ", "Razao Social", "Grupo", "Categoria", "Problema", "Detalhe"], filteredResumo.map((r) => [r.cnpj, r.razao, r.grupo, { regime: "Regime Tributário", ie: "Inscrição Estadual", im: "Inscrição Municipal" }[r.cat] || r.cat, r.problema, r.detalhe]));
    else if (tab === "regime") exportCSV("validacao_regime.csv", ["CNPJ", "Razao Social", "Grupo", "UF", "Regime", "Situacao"], filteredRegime.map((e) => [e.cnpj, e.razao, e.grupo, e.uf, e.regime || "SEM REGIME", "Pendente"]));
    else if (tab === "filiaisLR") exportCSV("validacao_filiais_geral.csv", ["CNPJ", "Razao Social", "Grupo", "Regime Cadastrado", "Sufixo", "Situacao"], filteredFiliais.map((e) => [e.cnpj, e.razao, e.grupo, e.regime, "/" + getSufixo(e.cnpj), "Filial com regime Geral (deveria ser Filial)"]));
    else if (tab === "ie") exportCSV("validacao_ie.csv", ["CNPJ", "Razao Social", "Grupo", "UF", "Isento", "IE Cadastrada", "Situacao"], filteredIE.map((e) => [e.cnpj, e.razao, e.grupo, e.uf, e.isento, e.ie, isentoSim(e.isento) ? "Isenta" : e.ie ? "Com IE" : "Sem IE"]));
    else if (tab === "im") exportCSV("validacao_im.csv", ["CNPJ", "Razao Social", "Grupo", "Regime", "IM Cadastrada", "Situacao"], filteredIM.map((e) => [e.cnpj, e.razao, e.grupo, e.regime, e.im, e.im ? "Com IM" : "Sem IM"]));
    else exportCSV("validacao_cc.csv", ["CNPJ", "Razao Social", "Grupo", "Regime", "Isento", "IE", "Situacao"], filteredCC.map((e) => [e.cnpj, e.razao, e.grupo, e.regime, e.isento, e.ie, isentoSim(e.isento) ? "Isenta" : e.ie ? "Com IE" : "Sem IE"]));
    showToast("CSV exportado!");
  };

  const limparBase = async () => {
    if (!confirm("Apagar a planilha salva no Hub?")) return;
    await clearEstado();
    setDados([]);
    setFileName(null);
    setSavedAt(null);
    showToast("Base limpa.");
  };

  return (
    <HubShell>
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/processos" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
              <ChevronLeft size={13} /> Processos
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: "#0AE18C22", color: "#00BF63" }}>validacao-cadastro</span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">Validação de Cadastro</h1>
            {savedAt && <span className="text-[11px] text-muted-foreground">salvo {fmtDataHora(savedAt)}{fileName ? ` · ${fileName}` : ""}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => void carregarDaBase()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-charcoal border border-border rounded-md px-3 py-1.5 hover:bg-secondary cursor-pointer">
              ⤓ Carregar da Base Empresas
            </button>
            <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-charcoal border border-border rounded-md px-3 py-1.5 hover:bg-secondary cursor-pointer">
              {dados.length ? "Trocar planilha" : "Carregar planilha"}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </label>
            {dados.length > 0 && (
              <button onClick={limparBase} className="text-[12px] font-semibold text-destructive border border-border rounded-md px-3 py-1.5 hover:bg-secondary">Limpar</button>
            )}
          </div>

        </div>

        <div style={{ background: "#FAFAFA", borderRadius: 14, border: "1px solid #E2E2E2", overflow: "hidden" }}>
          <div style={{ background: "#fff", borderBottom: "2px solid #E2E2E2", display: "flex", padding: "0 16px", overflowX: "auto" }}>
            {tabs.map((t) => {
              const act = activeTab === t.id;
              const badgeStyle = act ? { background: "#EAFBF4", color: "#00BF63" } : t.badgeType === "r" ? { background: "#FEE2E2", color: "#DC2626" } : t.badgeType === "a" ? { background: "#FFF3E0", color: "#FA6914" } : { background: "#E8E8E8", color: "#646464" };
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "13px 16px", border: "none", background: "none", color: act ? "#00BF63" : "#646464", cursor: "pointer", borderBottom: act ? "2px solid #0AE18C" : "2px solid transparent", marginBottom: -2, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  {t.label}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 12, ...badgeStyle }}>{dados.length ? t.badge : "—"}</span>
                </button>
              );
            })}
          </div>

          <div style={{ padding: "20px 22px 40px" }}>
            {loadingEstado && <div style={{ padding: 40, textAlign: "center", color: "#646464", fontSize: 13 }}>Carregando base salva...</div>}

            {showUpload && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Validação de Cadastro</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>Carregue a planilha de empresas (S3D) — os dados ficam salvos no Hub.</div>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
                  style={{ display: "block", background: drag ? "#EAFBF4" : "#fff", border: `2px dashed ${drag ? "#0AE18C" : "#E2E2E2"}`, borderRadius: 16, padding: 40, textAlign: "center", cursor: "pointer", marginBottom: 20 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" style={{ opacity: 0.35 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  <strong style={{ display: "block", fontSize: 14, color: "#1A1A1A", marginTop: 10 }}>Arraste ou clique para selecionar a planilha</strong>
                  <span style={{ fontSize: 12, color: "#646464" }}>Arquivo S3D_empresas .xlsx com CNPJ, Regime, Inscrições, etc.</span>
                  <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            )}

            {activeTab === "resumogeral" && !showUpload && !loadingEstado && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Resumo Geral de Pendências</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>Todas as pendências de cadastro — Regime, IE e IM.</div>
                <AlertBox><strong>Como usar:</strong> exporte o CSV a cada rodada de validação para manter histórico.</AlertBox>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <StatCard type="warn" title="Regime Tributário" sub="Sem regime" value={porCat.regime || 0} />
                  <StatCard type="warn" title="Inscrição Estadual" sub="Sem IE (não isentas)" value={porCat.ie || 0} />
                  <StatCard type="amb" title="Inscrição Municipal" sub="Sem IM" value={porCat.im || 0} />
                  <StatCard type="all" title="Total de pendências" sub="Todas as categorias" value={allResumoRows.length} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <SearchInput value={searchResumo} onChange={(v) => { setSearchResumo(v); setPage("resumogeral", 1); }} placeholder="Buscar CNPJ, razão ou grupo..." />
                  <Select value={filtResumo} onChange={(v) => { setFiltResumo(v); setPage("resumogeral", 1); }}>
                    <option value="all">Todas as categorias</option>
                    <option value="regime">Só Regime</option>
                    <option value="ie">Só IE</option>
                    <option value="im">Só IM</option>
                  </Select>
                  <div style={{ flex: 1 }} />
                  <BtnExport onClick={() => handleExport("resumogeral")} />
                </div>
                <TableWrap cols="140px 1fr 120px 1fr 1fr" headers={["CNPJ / Grupo", "Razão Social", "Categoria", "Problema", "Detalhe"]} empty={!paginate(filteredResumo, pages.resumogeral).slice.length}>
                  {paginate(filteredResumo, pages.resumogeral).slice.map((r, i) => (
                    <TR key={i} cols="140px 1fr 120px 1fr 1fr">
                      <TD><span style={{ fontFamily: "monospace", fontSize: "10.5px", fontWeight: 600 }}>{r.cnpj}</span><div style={{ fontSize: 10, color: "#646464", marginTop: 1 }}>{r.grupo}</div></TD>
                      <TD><div title={r.razao} style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.razao}</div></TD>
                      <TD><Chip type={r.cat === "regime" ? "r" : "a"}>{r.cat === "regime" ? "Regime Tributário" : r.cat === "ie" ? "Inscrição Estadual" : "Inscrição Municipal"}</Chip></TD>
                      <TD><span style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A" }}>{r.problema}</span></TD>
                      <TD><span style={{ fontSize: 10, color: "#4A4A4A" }} title={r.detalhe}>{r.detalhe.substring(0, 70)}</span></TD>
                    </TR>
                  ))}
                </TableWrap>
                <Pager page={pages.resumogeral} total={filteredResumo.length} onPage={(p) => setPage("resumogeral", p)} />
              </div>
            )}

            {activeTab === "regime" && !showUpload && !loadingEstado && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Regime Tributário</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>Empresas sem regime tributário informado</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <StatCard type="warn" title="Sem Regime" sub="Pendentes" value={naoCC.filter((e) => !e.regime).length} />
                  <StatCard type="ok" title="Com Regime" sub="Informado" value={naoCC.filter((e) => !!e.regime).length} />
                  <StatCard type="all" title="Total" sub="Excl. Const. Civil" value={naoCC.length} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <EquipeSelect value={tagFilter} onChange={(v) => { setTagFilter(v); setPage("regime", 1); }} />
                  <SearchInput value={searchRegime} onChange={(v) => { setSearchRegime(v); setPage("regime", 1); }} placeholder="Buscar CNPJ, razão ou grupo..." />
                  <div style={{ flex: 1 }} />
                  <BtnExport onClick={() => handleExport("regime")} />
                </div>
                <TableWrap cols="140px 1fr 140px 80px" headers={["CNPJ", "Razão / Grupo", "Regime", "Situação"]} empty={!paginate(filteredRegime, pages.regime).slice.length}>
                  {paginate(filteredRegime, pages.regime).slice.map((e, i) => (
                    <TR key={i} cols="140px 1fr 140px 80px">
                      <CNPJCell cnpj={e.cnpj} />
                      <RazaoCell razao={e.razao} grupo={e.grupo} />
                      <TD><Chip type="r">Sem regime</Chip></TD>
                      <TD><Chip type="r">⚠ Pendente</Chip></TD>
                    </TR>
                  ))}
                </TableWrap>
                <Pager page={pages.regime} total={filteredRegime.length} onPage={(p) => setPage("regime", p)} />
              </div>
            )}

            {activeTab === "filiaisLR" && !showUpload && !loadingEstado && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Filiais com Regime Geral</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>CNPJs que não terminam em /0001 com regime "Geral" — deveriam estar em "Filial".</div>
                <AlertBox><strong>Regra:</strong> CNPJs com sufixo diferente de <strong>/0001</strong> são filiais. Se o regime contém <em>Geral</em>, o cadastro pode estar incorreto.</AlertBox>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <StatCard type="amb" title="Filiais c/ Regime Geral" sub="" value={filteredFiliais.length} />
                  <StatCard type="all" title="Total analisado" sub="" value={dados.length} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <EquipeSelect value={tagFilter} onChange={(v) => { setTagFilter(v); setPage("filiaisLR", 1); }} />
                  <SearchInput value={searchFiliais} onChange={(v) => { setSearchFiliais(v); setPage("filiaisLR", 1); }} placeholder="Buscar CNPJ, razão ou grupo..." />
                  <div style={{ flex: 1 }} />
                  <BtnExport onClick={() => handleExport("filiaisLR")} />
                </div>
                <TableWrap cols="160px 1fr 180px 100px" headers={["CNPJ", "Razão / Grupo", "Regime Cadastrado", "Situação"]} empty={!paginate(filteredFiliais, pages.filiaisLR).slice.length}>
                  {paginate(filteredFiliais, pages.filiaisLR).slice.map((e, i) => (
                    <TR key={i} cols="160px 1fr 180px 100px">
                      <CNPJCell cnpj={e.cnpj} sub={`Sufixo: /${getSufixo(e.cnpj)}`} subColor="#FA6914" />
                      <RazaoCell razao={e.razao} grupo={e.grupo} />
                      <TD><span style={{ fontSize: 10, color: "#4A4A4A" }}>{e.regime}</span></TD>
                      <TD><Chip type="a">⚠ Regime Indevido</Chip></TD>
                    </TR>
                  ))}
                </TableWrap>
                <Pager page={pages.filiaisLR} total={filteredFiliais.length} onPage={(p) => setPage("filiaisLR", p)} />
              </div>
            )}

            {activeTab === "ie" && !showUpload && !loadingEstado && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Inscrição Estadual</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>Empresas não isentas sem IE cadastrada.</div>
                <AlertBox><strong>Regra:</strong> Se <em>Empresa Isenta</em> = Sim, IE é dispensada.</AlertBox>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <StatCard type="warn" title="Sem IE" sub="Não isenta e sem IE" value={sem_ie.length} />
                  <StatCard type="ok" title="Com IE" sub="" value={com_ie.length} />
                  <StatCard type="amb" title="Isentas" sub="IE dispensada" value={isentas.length} />
                  <StatCard type="all" title="Total" sub="Excl. CC" value={naoCC.length} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <EquipeSelect value={tagFilter} onChange={(v) => { setTagFilter(v); setPage("ie", 1); }} />
                  <SearchInput value={searchIE} onChange={(v) => { setSearchIE(v); setPage("ie", 1); }} placeholder="Buscar CNPJ, razão ou grupo..." />
                  <Select value={filtIE} onChange={(v) => { setFiltIE(v); setPage("ie", 1); }}>
                    <option value="sem_ie">Sem IE (não isentas)</option>
                    <option value="com_ie">Com IE cadastrada</option>
                    <option value="isentas">Isentas</option>
                    <option value="all">Todas</option>
                  </Select>
                  <div style={{ flex: 1 }} />
                  <BtnExport onClick={() => handleExport("ie")} />
                </div>
                <TableWrap cols="140px 1fr 80px 80px 1fr" headers={["CNPJ", "Razão / Grupo", "UF", "Isento", "IE Cadastrada"]} empty={!paginate(filteredIE, pages.ie).slice.length}>
                  {paginate(filteredIE, pages.ie).slice.map((e, i) => {
                    const isento = isentoSim(e.isento);
                    const temIE = !!e.ie;
                    return (
                      <TR key={i} cols="140px 1fr 80px 80px 1fr">
                        <CNPJCell cnpj={e.cnpj} />
                        <RazaoCell razao={e.razao} grupo={e.grupo} />
                        <TD><Chip type="gr">{e.uf || "—"}</Chip></TD>
                        <TD>{isento ? <Chip type="b">Isenta</Chip> : temIE ? <Chip type="g">OK</Chip> : <Chip type="r">⚠ Sem IE</Chip>}</TD>
                        <TD><span style={{ fontSize: 10, color: e.ie ? "#4A4A4A" : "#CDCDCD" }}>{e.ie ? e.ie.substring(0, 50) : "—"}</span></TD>
                      </TR>
                    );
                  })}
                </TableWrap>
                <Pager page={pages.ie} total={filteredIE.length} onPage={(p) => setPage("ie", p)} />
              </div>
            )}

            {activeTab === "im" && !showUpload && !loadingEstado && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Inscrição Municipal</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>Empresas sem IM cadastrada</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <StatCard type="warn" title="Sem IM" sub="" value={sem_im.length} />
                  <StatCard type="ok" title="Com IM" sub="" value={com_im.length} />
                  <StatCard type="all" title="Total" sub="Excl. CC" value={naoCC.length} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <EquipeSelect value={tagFilter} onChange={(v) => { setTagFilter(v); setPage("im", 1); }} />
                  <SearchInput value={searchIM} onChange={(v) => { setSearchIM(v); setPage("im", 1); }} placeholder="Buscar CNPJ, razão ou grupo..." />
                  <Select value={filtIM} onChange={(v) => { setFiltIM(v); setPage("im", 1); }}>
                    <option value="sem_im">Sem IM</option>
                    <option value="com_im">Com IM</option>
                    <option value="all">Todas</option>
                  </Select>
                  <div style={{ flex: 1 }} />
                  <BtnExport onClick={() => handleExport("im")} />
                </div>
                <TableWrap cols="140px 1fr 140px 1fr" headers={["CNPJ", "Razão / Grupo", "Regime", "IM Cadastrada"]} empty={!paginate(filteredIM, pages.im).slice.length}>
                  {paginate(filteredIM, pages.im).slice.map((e, i) => (
                    <TR key={i} cols="140px 1fr 140px 1fr">
                      <CNPJCell cnpj={e.cnpj} />
                      <RazaoCell razao={e.razao} grupo={e.grupo} />
                      <TD><span style={{ fontSize: 10, color: "#4A4A4A" }}>{e.regime || "Sem regime"}</span></TD>
                      <TD>{e.im ? <span style={{ fontSize: 10, color: "#4A4A4A" }}>{e.im.substring(0, 50)}</span> : <Chip type="a">⚠ Sem IM</Chip>}</TD>
                    </TR>
                  ))}
                </TableWrap>
                <Pager page={pages.im} total={filteredIM.length} onPage={(p) => setPage("im", p)} />
              </div>
            )}

            {activeTab === "cc" && !showUpload && !loadingEstado && (
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1A1A", marginBottom: 3 }}>Empresas da Construção Civil</div>
                <div style={{ fontSize: 12, color: "#646464", marginBottom: 18 }}>TAGs: CC 1, CC 2, CC 4, DP 4, Dedicada Canopus</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <StatCard type="all" title="Total CC" sub="" value={ccAll.length} />
                  <StatCard type="warn" title="Sem Regime" sub="" value={ccAll.filter((e) => !e.regime).length} />
                  <StatCard type="warn" title="Sem IE" sub="Não isentas" value={ccAll.filter((e) => !isentoSim(e.isento) && !e.ie).length} />
                  <StatCard type="amb" title="Sem IM" sub="" value={ccAll.filter((e) => !e.im).length} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <EquipeSelect value={tagFilter} onChange={(v) => { setTagFilter(v); setPage("cc", 1); }} />
                  <SearchInput value={searchCC} onChange={(v) => { setSearchCC(v); setPage("cc", 1); }} placeholder="Buscar CNPJ, razão ou grupo..." />
                  <Select value={filtCC} onChange={(v) => { setFiltCC(v); setPage("cc", 1); }}>
                    <option value="sem_regime">Sem regime</option>
                    <option value="sem_ie">Sem IE</option>
                    <option value="sem_im">Sem IM</option>
                    <option value="all">Todas</option>
                  </Select>
                  <div style={{ flex: 1 }} />
                  <BtnExport onClick={() => handleExport("cc")} />
                </div>
                <TableWrap cols="140px 1fr 140px 80px 80px" headers={["CNPJ", "Razão / Grupo", "Regime", "Isento", "IE"]} empty={!paginate(filteredCC, pages.cc).slice.length}>
                  {paginate(filteredCC, pages.cc).slice.map((e, i) => (
                    <TR key={i} cols="140px 1fr 140px 80px 80px">
                      <CNPJCell cnpj={e.cnpj} />
                      <RazaoCell razao={e.razao} grupo={e.grupo} />
                      <TD><span style={{ fontSize: 10, color: "#4A4A4A" }}>{e.regime || "Sem regime"}</span></TD>
                      <TD>{isentoSim(e.isento) ? <Chip type="b">Isenta</Chip> : <Chip type="gr">Não</Chip>}</TD>
                      <TD>{e.ie ? <Chip type="g">Sim</Chip> : <Chip type="r">Não</Chip>}</TD>
                    </TR>
                  ))}
                </TableWrap>
                <Pager page={pages.cc} total={filteredCC.length} onPage={(p) => setPage("cc", p)} />
              </div>
            )}
          </div>
        </div>

        <div style={{ position: "fixed", bottom: 22, right: 22, background: "#1A1A1A", color: "#fff", padding: "11px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, zIndex: 999, transition: "all .3s ease", transform: toast.show ? "translateY(0)" : "translateY(80px)", opacity: toast.show ? 1 : 0, pointerEvents: "none" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#0AE18C" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
          {toast.msg}
        </div>
      </div>
    </HubShell>
  );
}
