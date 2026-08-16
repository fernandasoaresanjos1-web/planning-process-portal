import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HubShell } from "@/components/HubShell";
import {
  BI_APUR_OPTS, BI_FECH_OPTS, BI_FECH_TIPO, BI_SISTEMAS, BI_SISTEMAS_CLI,
  biAddOpcao, biCurvaStyle, biDeleteConfig, biDeleteOpcao, biImportEmpregados,
  biIsLucroReal, biLoadAll, biLoadOpcoes, biRegimeColor, biSyncFromBaseAtiva, biSyncIfBaseChanged,
  biUpsertCont, biUpsertFisc, biUpsertFolha,
  type BIConfigContabil, type BIConfigFiscal, type BIConfigFolha, type BICurva,
  type BIEmpresa, type BIOpcaoCategoria, type BITab, type BIVidas,
} from "@/lib/bi-empresas";
import { exportXlsx } from "@/lib/export-xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/base-informacoes-empresas")({
  head: () => ({
    meta: [
      { title: "Base de Informações Empresas — Planning Hub" },
      { name: "description", content: "Cadastro central de empresas com configurações de folha, contábil e fiscal." },
    ],
  }),
  component: BaseInfoEmpresasPage,
});

function Chip({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-block text-[9.5px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${colorClass}`}>
      {label}
    </span>
  );
}

function CurvaSelect({ value, onChange }: { value: BICurva; onChange: (v: BICurva) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as BICurva)}
      className={`text-[10.5px] font-bold px-2 py-0.5 rounded border w-14 outline-none cursor-pointer ${biCurvaStyle(value)}`}
    >
      <option value="">—</option>
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
    </select>
  );
}

function EditSelect({
  value, opts, onChange, placeholder = "—", className = "",
}: { value: string; opts: string[]; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-[10.5px] pl-1.5 pr-4 py-0.5 border border-gray-200 rounded bg-white outline-none cursor-pointer w-full min-w-[68px] ${className}`}
    >
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>


  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${value ? "bg-brand" : "bg-gray-200"}`}
    >
      <span className={`absolute w-3 h-3 bg-white rounded-full top-0.5 transition-all shadow-sm ${value ? "left-4" : "left-0.5"}`} />
    </button>
  );
}

function VidaBadge({ v }: { v: BIVidas | undefined }) {
  if (!v) return <span className="text-gray-400 text-[10px]">—</span>;
  if (v.total_ativos > 0)
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ {v.total_ativos}</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">✗ 0</span>;
}

function UploadZone({ label, hint, accept, hasFile, onFile }: {
  label: string; hint: string; accept: string; hasFile: boolean; onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
        hasFile ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-brand hover:bg-white"
      }`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      <div className="text-xl mb-1">{hasFile ? "✅" : "📄"}</div>
      <p className="text-xs font-bold text-gray-800">{label}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>
    </div>
  );
}

function TH({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-1.5 py-1.5 text-left text-[9.5px] font-bold text-gray-500 uppercase tracking-tight whitespace-nowrap bg-gray-50 border-b border-gray-200 ${className}`}>{children}</th>;
}
function TD({ children, className = "", colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-1.5 py-1.5 text-[11.5px] align-middle ${className}`}>{children}</td>;
}

function shortRazao(s: string): string {
  if (!s) return "";
  let r = s
    .replace(/\s+(LTDA|S\/?A|S\.A\.?|EIRELI|ME|EPP|SCP|SS)\.?$/i, "")
    .replace(/\bCOMERCIO E INDUSTRIA\b/gi, "COM. IND.")
    .replace(/\bINDUSTRIA E COMERCIO\b/gi, "IND. COM.")
    .replace(/\bDISTRIBUIDORA\b/gi, "DISTR.")
    .replace(/\bCOMERCIO\b/gi, "COM.")
    .replace(/\bINDUSTRIA\b/gi, "IND.")
    .replace(/\bSERVICOS\b/gi, "SERV.")
    .replace(/\bTECNOLOGIA\b/gi, "TEC.")
    .replace(/\bPARTICIPACOES\b/gi, "PART.")
    .replace(/\bADMINISTRACAO\b/gi, "ADM.")
    .replace(/\bEMPRESARIAIS\b/gi, "EMPR.")
    .replace(/\bPRODUTOS\b/gi, "PROD.")
    .replace(/\bEQUIPAMENTOS\b/gi, "EQUIP.")
    .replace(/\s+/g, " ")
    .trim();
  if (r.length > 28) r = r.slice(0, 26).trim() + "…";
  return r;
}
function BaseCells({ d }: { d: BIEmpresa }) {
  return (
    <>
      <TD>
        <div className="flex items-center gap-1">
          <div className="font-semibold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]" title={d.razao}>{shortRazao(d.razao)}</div>
          {d.is_new && <span className="inline-block text-[8.5px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">NOVA</span>}
        </div>
      </TD>
      <TD><span className="font-mono text-[10.5px] text-gray-500 whitespace-nowrap">{d.cnpj}</span></TD>
      <TD><div className="text-[11px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[90px]" title={d.grupo}>{d.grupo || "—"}</div></TD>

      <TD><Chip label={d.regime || "—"} colorClass={biRegimeColor(d.regime)} /></TD>
    </>
  );
}

function RemovedRow({ cnpj, colSpan, onRemove }: { cnpj: string; colSpan: number; onRemove: () => void }) {
  return (
    <tr className="border-b border-gray-100 last:border-0 bg-red-50/40 hover:bg-red-50">
      <TD>
        <div className="flex items-center gap-1.5">
          <span className="inline-block text-[8.5px] font-extrabold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 whitespace-nowrap">REMOVIDA</span>
          <span className="text-[11px] text-red-700 font-semibold">Não está mais na base</span>
        </div>
      </TD>
      <TD><span className="font-mono text-[10.5px] text-red-600 whitespace-nowrap">{cnpj}</span></TD>
      <TD colSpan={colSpan - 3} className="text-[11px] text-red-600">Configuração preservada — revise antes de excluir</TD>
      <TD className="text-right">
        <button
          type="button"
          onClick={onRemove}
          className="text-[10.5px] font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 rounded px-1.5 py-0.5"
          title="Excluir configuração desta empresa">
          Excluir
        </button>
      </TD>
    </tr>
  );
}

const OPCOES_LABELS: Record<BIOpcaoCategoria, string> = {
  sistema_folha: "Sistema de Folha",
  sistema_cli: "Sistema do Cliente",
  fechamento_folha: "Fechamento Folha",
  apuracao: "Apuração",
  fech_tipo: "Tipo de Fechamento",
};

function OpcoesModal({ opcoes, onClose, onAdd, onDelete }: {
  opcoes: Record<BIOpcaoCategoria, string[]>;
  onClose: () => void;
  onAdd: (cat: BIOpcaoCategoria, valor: string) => Promise<void>;
  onDelete: (cat: BIOpcaoCategoria, valor: string) => Promise<void>;
}) {
  const [cat, setCat] = useState<BIOpcaoCategoria>("sistema_folha");
  const [novo, setNovo] = useState("");
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-[560px] max-w-[92vw] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-extrabold text-gray-900">Gerenciar opções</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {(Object.keys(OPCOES_LABELS) as BIOpcaoCategoria[]).map((k) => (
            <button key={k} onClick={() => setCat(k)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${cat === k ? "bg-charcoal text-white border-charcoal" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {OPCOES_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input value={novo} onChange={(e) => setNovo(e.target.value)}
            placeholder="Nova opção..."
            onKeyDown={(e) => { if (e.key === "Enter" && novo.trim()) { void onAdd(cat, novo).then(() => setNovo("")); } }}
            className="flex-1 px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-brand" />
          <button onClick={() => { if (novo.trim()) void onAdd(cat, novo).then(() => setNovo("")); }}
            className="text-[12px] font-bold px-4 py-1.5 rounded-lg bg-brand text-charcoal">+ Adicionar</button>
        </div>
        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
          {(opcoes[cat] || []).length === 0 ? (
            <div className="text-[12px] text-gray-400 text-center py-6">Nenhuma opção cadastrada</div>
          ) : (opcoes[cat] || []).map((v) => (
            <div key={v} className="flex items-center justify-between px-3 py-1.5 text-[12px] border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <span className="text-gray-700">{v}</span>
              <button onClick={() => void onDelete(cat, v)} className="text-red-500 hover:text-red-700 text-[11px] font-semibold">Remover</button>
            </div>
          ))}
        </div>
        <div className="text-[10.5px] text-gray-400 mt-2">As mudanças refletem imediatamente nos selects.</div>
      </div>
    </div>
  );
}

function BaseInfoEmpresasPage() {
  const [tab, setTab] = useState<BITab>("geral");
  const [db, setDb] = useState<BIEmpresa[]>([]);
  const [folhaCfg, setFolhaCfg] = useState<Record<string, BIConfigFolha>>({});
  const [contCfg, setContCfg] = useState<Record<string, BIConfigContabil>>({});
  const [fiscCfg, setFiscCfg] = useState<Record<string, BIConfigFiscal>>({});
  const [vidas, setVidas] = useState<Record<string, BIVidas>>({});
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterEquipe, setFilterEquipe] = useState("");
  const [filterRegime, setFilterRegime] = useState("");
  const [filterSist, setFilterSist] = useState("");
  const [filterVidas, setFilterVidas] = useState("");
  const [filterInteg, setFilterInteg] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterGrupo, setFilterGrupo] = useState("");

  const [showOpcoesModal, setShowOpcoesModal] = useState(false);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [empFile, setEmpFile] = useState<File | null>(null);
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [spinMsg, setSpinMsg] = useState("");
  const [opcoes, setOpcoes] = useState<Record<BIOpcaoCategoria, string[]>>({
    sistema_folha: BI_SISTEMAS, sistema_cli: BI_SISTEMAS_CLI,
    fechamento_folha: BI_FECH_OPTS, apuracao: BI_APUR_OPTS, fech_tipo: BI_FECH_TIPO,
  });
  const reloadOpcoes = useCallback(async () => {
    try {
      const o = await biLoadOpcoes();
      setOpcoes(o);
    } catch (e) { /* fallback silently to defaults */ void e; }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const sync = await biSyncIfBaseChanged(setSpinMsg);
        if (sync) toast.success(`Base sincronizada: ${sync.novos} novas, ${sync.removidos} removidas`);
      } catch (e) { toast.error(`Sincronização da base: ${(e as Error).message}`); }
      const { empresas, folhaCfg, contCfg, fiscCfg, vidas, tagsMap: tm } = await biLoadAll();
      const empresasFiltradas = empresas.filter((e) => ((tm as Record<string, string[]>)[(e.cnpj || "").replace(/\D/g, "")] || []).length > 0);
      setDb(empresasFiltradas); setTagsMap(tm as Record<string, string[]>);
      setFolhaCfg(folhaCfg); setContCfg(contCfg); setFiscCfg(fiscCfg); setVidas(vidas);
    } catch (err) {
      toast.error((err as Error).message || "Falha ao carregar base");
    } finally {
      setLoading(false);
      setSpinMsg("");
    }
  }, []);

  async function syncBaseAgora() {
    setLoading(true);
    try {
      const res = await biSyncFromBaseAtiva(setSpinMsg);
      toast.success(`Base atualizada: ${res.total} empresas | ${res.novos} novas | ${res.removidos} removidas`);
      const { empresas, folhaCfg, contCfg, fiscCfg, vidas, tagsMap: tm } = await biLoadAll();
      const empresasFiltradas = empresas.filter((e) => ((tm as Record<string, string[]>)[(e.cnpj || "").replace(/\D/g, "")] || []).length > 0);
      setDb(empresasFiltradas); setTagsMap(tm as Record<string, string[]>);
      setFolhaCfg(folhaCfg); setContCfg(contCfg); setFiscCfg(fiscCfg); setVidas(vidas);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); setSpinMsg(""); }
  }
  useEffect(() => { loadData(); reloadOpcoes(); }, [loadData, reloadOpcoes]);


  function showSaved() { setSaving(true); setTimeout(() => setSaving(false), 1200); }

  function changeTab(next: BITab) {
    setTab(next);
    setFilterEquipe("");
    setFilterRegime("");
    setFilterGrupo("");
  }


  async function updateFolha(cnpj: string, key: keyof BIConfigFolha, val: string | boolean) {
    const cur = folhaCfg[cnpj] || { sistema: "", adiant: false, dia_adiant: "", fechamento: "", curva: "" };
    const upd: BIConfigFolha = { ...cur, [key]: val } as BIConfigFolha;
    if (key === "sistema" && val === "Sem movimento") { upd.adiant = false; upd.dia_adiant = ""; upd.fechamento = ""; }
    setFolhaCfg((p) => ({ ...p, [cnpj]: upd }));
    try { await biUpsertFolha(cnpj, upd); showSaved(); } catch (e) { toast.error((e as Error).message); }
  }
  async function updateCont(cnpj: string, key: keyof BIConfigContabil, val: string) {
    const cur = contCfg[cnpj] || { integrado: "", software: "", apuracao: "", fech_tipo: "", tipo_emp: "", tipo_holding: "", curva: "" };
    const upd = { ...cur, [key]: val };
    setContCfg((p) => ({ ...p, [cnpj]: upd }));
    try { await biUpsertCont(cnpj, upd); showSaved(); } catch (e) { toast.error((e as Error).message); }
  }
  async function updateFisc(cnpj: string, key: keyof BIConfigFiscal, val: string) {
    const cur = fiscCfg[cnpj] || { curva: "" };
    const upd = { ...cur, [key]: val };
    setFiscCfg((p) => ({ ...p, [cnpj]: upd }));
    try { await biUpsertFisc(cnpj, upd); showSaved(); } catch (e) { toast.error((e as Error).message); }
  }

  async function addOpcao(cat: BIOpcaoCategoria, valor: string) {
    const v = valor.trim();
    if (!v) return;
    try { await biAddOpcao(cat, v); toast.success("Opção adicionada"); await reloadOpcoes(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function delOpcao(cat: BIOpcaoCategoria, valor: string) {
    if (!confirm(`Remover "${valor}"?`)) return;
    try { await biDeleteOpcao(cat, valor); await reloadOpcoes(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function doEmp() {
    if (!empFile) return;
    setLoading(true);
    try {
      const n = await biImportEmpregados(empFile, cadFile, setSpinMsg);
      toast.success(`${n} CNPJs de vidas atualizados`);
      setShowEmpModal(false); setEmpFile(null); setCadFile(null);
      await loadData();
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); setSpinMsg(""); }
  }

  const q = search.toLowerCase().trim();
  const filter = (d: BIEmpresa) => {
    if (filterGrupo && (d.grupo || "") !== filterGrupo) return false;
    return !q || d.razao.toLowerCase().includes(q) || d.cnpj.includes(q);
  };
  const getTagDepto = (cnpj: string, dep: "dp" | "cont" | "fisc"): string => {
    const tags = tagsMap[(cnpj || "").replace(/\D/g, "")] || [];
    return tags.find((t) => {
      if (dep === "dp") return /equipe\s+dp\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t);
      if (dep === "cont") return /equipe\s+cont[a\u00e1]bil\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t);
      if (dep === "fisc") return /equipe\s+fiscal\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t);
      return false;
    }) || "";
  };


  const folhaList = useMemo(() => db.filter((d) => {
    const tagDp = getTagDepto(d.cnpj, "dp");
    if (!tagDp) return false;
    if (filterEquipe && tagDp !== filterEquipe) return false;
    if (filterSist) {
      const s = folhaCfg[d.cnpj]?.sistema || "";
      if (filterSist === "dom" && s !== "Domínio") return false;
      if (filterSist === "out" && (!s || s === "Domínio" || s === "Sem movimento")) return false;
      if (filterSist === "smov" && s !== "Sem movimento") return false;
      if (filterSist === "ns" && s !== "") return false;
    }
    if (filterVidas && Object.keys(vidas).length) {
      const v = vidas[d.cnpj];
      if (filterVidas === "sim" && !(v && v.total_ativos > 0)) return false;
      if (filterVidas === "nao" && v && v.total_ativos > 0) return false;
    }
    return filter(d);
  }), [db, tagsMap, folhaCfg, vidas, filterEquipe, filterSist, filterVidas, q, filterGrupo]);

  const contList = useMemo(() => db.filter((d) => {
    // Equipe contábil = TAG "Equipe Cont..." OU campo "contabil" preenchido na base
    const tagCont = getTagDepto(d.cnpj, "cont");
    if (!tagCont) return false;
    const isRural = /produtor\s*rural|caepf/i.test(d.regime || "");
    const isMatriz = /\/0001-/.test(d.cnpj) || (d.cnpj || "").replace(/\D/g, "").slice(8, 12) === "0001";
    if (!isMatriz && !isRural) return false;
    if (/Filial/i.test(d.regime)) return false;


    if (filterRegime && d.regime !== filterRegime) return false;
    if (filterEquipe && tagCont !== filterEquipe) return false;
    if (filterInteg) {
      const i = contCfg[d.cnpj]?.integrado || "";
      if (filterInteg === "sim" && i !== "sim") return false;
      if (filterInteg === "nao" && i !== "nao") return false;
      if (filterInteg === "ns" && i !== "") return false;
    }
    if (filterTipo && (contCfg[d.cnpj]?.tipo_emp || "") !== filterTipo) return false;
    return filter(d);
  }), [db, tagsMap, contCfg, filterRegime, filterEquipe, filterInteg, filterTipo, q, filterGrupo]);

  const fiscList = useMemo(() => db.filter((d) => {
    const tagFisc = getTagDepto(d.cnpj, "fisc");
    if (!tagFisc) return false;
    if (/CC/i.test(d.regime)) return false;
    if (filterRegime && d.regime !== filterRegime) return false;
    if (filterEquipe && tagFisc !== filterEquipe) return false;
    return filter(d);
  }), [db, tagsMap, filterRegime, filterEquipe, q, filterGrupo]);

  const afastList = useMemo(() => db.filter((d) => {
    if (!getTagDepto(d.cnpj, "dp")) return false;
    const v = vidas[d.cnpj]; return v && v.afastados > 0;
  }).sort((a, b) => (vidas[b.cnpj]?.afastados || 0) - (vidas[a.cnpj]?.afastados || 0)), [db, tagsMap, vidas]);

  const auditList = useMemo(() => db.filter((d) => {
    const t = d.tags || "";
    if (/Equipe DP [12]/i.test(t)) return false;
    if (/Equipe DP 4|Equipe CC|Canopus/i.test(t)) return false;
    if (/CC/.test(d.regime)) return false;
    const v = vidas[d.cnpj]; return v && v.total_ativos > 0;
  }).sort((a, b) => (vidas[b.cnpj]?.total_ativos || 0) - (vidas[a.cnpj]?.total_ativos || 0)), [db, vidas]);

  const regimes = useMemo(() => [...new Set(db.map((d) => d.regime).filter(Boolean))].sort(), [db]);
  const contEquipes = useMemo(() => [...new Set(db.map((d) => getTagDepto(d.cnpj, "cont")).filter(Boolean))].sort(), [db, tagsMap]);
  const fiscEquipes = useMemo(() => [...new Set(db.map((d) => getTagDepto(d.cnpj, "fisc")).filter(Boolean))].sort(), [db, tagsMap]);
  const dpEquipes = useMemo(() => [...new Set(db.map((d) => getTagDepto(d.cnpj, "dp")).filter(Boolean))].sort(), [db, tagsMap]);
  const grupos = useMemo(() => [...new Set(db.map((d) => d.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [db]);

  const dbCnpjSet = useMemo(() => new Set(db.map((d) => d.cnpj)), [db]);
  const folhaRemoved = useMemo(() => Object.keys(folhaCfg).filter((c) => !dbCnpjSet.has(c)).sort(), [folhaCfg, dbCnpjSet]);
  const contRemoved = useMemo(() => Object.keys(contCfg).filter((c) => !dbCnpjSet.has(c)).sort(), [contCfg, dbCnpjSet]);
  const fiscRemoved = useMemo(() => Object.keys(fiscCfg).filter((c) => !dbCnpjSet.has(c)).sort(), [fiscCfg, dbCnpjSet]);

  async function removeConfig(table: "bi_config_folha" | "bi_config_contabil" | "bi_config_fiscal", cnpj: string) {
    if (!confirm(`Excluir configuração de ${cnpj}?`)) return;
    try {
      await biDeleteConfig(table, cnpj);
      if (table === "bi_config_folha") setFolhaCfg((p) => { const n = { ...p }; delete n[cnpj]; return n; });
      if (table === "bi_config_contabil") setContCfg((p) => { const n = { ...p }; delete n[cnpj]; return n; });
      if (table === "bi_config_fiscal") setFiscCfg((p) => { const n = { ...p }; delete n[cnpj]; return n; });
      toast.success("Configuração removida");
    } catch (e) { toast.error((e as Error).message); }
  }


  const afastResumo = useMemo(() => {
    const acc = { empresas: afastList.length, trab: 0, ferias: 0, afastados: 0, total: 0 };
    afastList.forEach((d) => {
      const v = vidas[d.cnpj]; if (!v) return;
      acc.trab += v.trabalhando; acc.ferias += v.ferias; acc.afastados += v.afastados; acc.total += v.total_ativos;
    });
    return acc;
  }, [afastList, vidas]);

  const folhaResumo = useMemo(() => {
    let ativas = 0, total = 0;
    folhaList.forEach((d) => {
      const v = vidas[d.cnpj]; const n = v?.total_ativos || 0;
      total += n; if (n > 0) ativas++;
    });
    return { empresas: folhaList.length, ativas, semVidas: folhaList.length - ativas, total };
  }, [folhaList, vidas]);


  const tabs: { id: BITab; label: string; count: number }[] = [
    { id: "geral", label: "Visão Geral", count: db.length },
    { id: "folha", label: "📋 Folha", count: folhaList.length },
    { id: "contabil", label: "📊 Contábil", count: contList.length },
    { id: "fiscal", label: "🧾 Fiscal", count: fiscList.length },
    { id: "afastados", label: "🏥 Afastados", count: afastList.length },
    { id: "auditoria", label: "🔍 Auditoria", count: auditList.length },
  ];

  function exportCurrentTab() {
    const base = (d: BIEmpresa) => ({ Empresa: d.razao, CNPJ: d.cnpj, Grupo: d.grupo || "", Regime: d.regime || "" });
    let name = "base-empresas";
    let rows: Array<Record<string, unknown>> = [];
    if (tab === "geral") {
      name = "base-empresas-geral";
      rows = db.filter(filter).map((d) => ({ ...base(d), Curva: folhaCfg[d.cnpj]?.curva || "", "Equipe DP": getTagDepto(d.cnpj, "dp"), "Equipe Cont.": getTagDepto(d.cnpj, "cont"), "Equipe Fisc.": getTagDepto(d.cnpj, "fisc") }));
    } else if (tab === "folha") {
      name = "base-empresas-folha";
      rows = folhaList.map((d) => {
        const c = folhaCfg[d.cnpj] || ({} as BIConfigFolha);
        const v = vidas[d.cnpj];
        return { ...base(d), Curva: c.curva || "", Equipe: getTagDepto(d.cnpj, "dp"), Sistema: c.sistema || "", Adiantamento: c.adiant ? "Sim" : "Não", "Dia Adiant.": c.dia_adiant || "", Fechamento: c.fechamento || "", "Trab.": v?.trabalhando || 0, "Férias": v?.ferias || 0, Afastados: v?.afastados || 0, "Total Vidas": v?.total_ativos || 0 };
      });
    } else if (tab === "contabil") {
      name = "base-empresas-contabil";
      rows = contList.map((d) => {
        const c = contCfg[d.cnpj] || ({} as BIConfigContabil);
        const lr = biIsLucroReal(d.regime);
        return {
          ...base(d),
          "Tipo Empresa": c.tipo_emp || "",
          "Tipo Holding": c.tipo_emp === "Holding" ? c.tipo_holding || "" : "",
          Curva: c.curva || "",
          "Equipe Cont.": getTagDepto(d.cnpj, "cont") || (d.contabil || "").trim() || "",
          Integrado: c.integrado === "sim" ? "Sim" : c.integrado === "nao" ? "Não" : "",
          Sistema: c.integrado ? c.software || "" : "",
          "Apur. LR": lr ? c.apuracao || "" : "N/A",
          Fechamento: c.fech_tipo || "",
        };
      });
    } else if (tab === "fiscal") {
      name = "base-empresas-fiscal";
      rows = fiscList.map((d) => ({ ...base(d), Curva: fiscCfg[d.cnpj]?.curva || "", "Equipe Fisc.": getTagDepto(d.cnpj, "fisc") }));
    } else if (tab === "afastados") {
      name = "base-empresas-afastados";
      rows = afastList.filter(filter).map((d) => {
        const v = vidas[d.cnpj] || { trabalhando: 0, ferias: 0, afastados: 0, total_ativos: 0 };
        return { ...base(d), "Equipe DP": getTagDepto(d.cnpj, "dp"), "Trab.": v.trabalhando, "Férias": v.ferias, Afastados: v.afastados, Total: v.total_ativos };
      });
    } else {
      name = "base-empresas-auditoria";
      rows = auditList.filter(filter).map((d) => {
        const v = vidas[d.cnpj] || { trabalhando: 0, ferias: 0, afastados: 0, total_ativos: 0 };
        return { ...base(d), Tags: d.tags || "", "Trab.": v.trabalhando, "Férias": v.ferias, Afastados: v.afastados, Total: v.total_ativos };
      });
    }
    if (!rows.length) { toast.error("Nada para exportar"); return; }
    exportXlsx(name, [{ name: "Dados", rows }]);
    toast.success("Exportação gerada");
  }

  return (
    <HubShell>
      <div className="min-h-screen bg-[#FAFAFA]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Empresas</div>
              <h1 className="text-[17px] font-extrabold text-charcoal leading-tight">Base de Informações Empresas</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={syncBaseAgora} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" title="Sincronizar com a base ativa (inclui novas e remove as que saíram)">🔄 Atualizar base</button>
              <button onClick={exportCurrentTab} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" title="Exportar aba atual (CSV)">⬇ Exportar</button>
              <button onClick={() => setShowOpcoesModal(true)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">⚙ Opções</button>
              <button onClick={() => setShowEmpModal(true)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-brand/40 bg-brand/10 text-charcoal hover:bg-brand/20">👥 Empregados</button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b-2 border-gray-200 px-6 sticky top-0 z-30 overflow-x-auto">
          <div className="max-w-[1600px] mx-auto flex">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => changeTab(t.id)}
                className={`text-[12px] font-semibold px-4 py-3 border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
                  tab === t.id ? "text-emerald-700 border-brand" : "text-gray-500 border-transparent hover:text-gray-800"
                }`}>
                {t.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? "bg-emerald-50 text-emerald-700" :
                  t.id === "auditoria" && t.count > 0 ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                }`}>{t.count.toLocaleString("pt-BR")}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-6 py-4 pb-20">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa ou CNPJ..."
              className="min-w-[220px] flex-1 max-w-[320px] px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand" />
            <select value={filterGrupo} onChange={(e) => setFilterGrupo(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer max-w-[180px]">
              <option value="">Todos os grupos</option>
              {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>

            {tab === "folha" && <>
              <select value={filterEquipe} onChange={(e) => setFilterEquipe(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                <option value="">Todas as equipes</option>{dpEquipes.map((equipe) => <option key={equipe}>{equipe}</option>)}
              </select>
              <select value={filterSist} onChange={(e) => setFilterSist(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                <option value="">Todos os sistemas</option><option value="dom">Domínio</option><option value="smov">Sem movimento</option><option value="out">Outro</option><option value="ns">Não informado</option>
              </select>
              {Object.keys(vidas).length > 0 && (
                <select value={filterVidas} onChange={(e) => setFilterVidas(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                  <option value="">Todas as situações</option><option value="sim">Com vidas</option><option value="nao">Sem vidas</option>
                </select>
              )}
            </>}
            {tab === "contabil" && <>
              <select value={filterRegime} onChange={(e) => setFilterRegime(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                <option value="">Todos os regimes</option>{regimes.filter((r) => !/CC|Filial/i.test(r)).map((r) => <option key={r}>{r}</option>)}
              </select>
              <select value={filterEquipe} onChange={(e) => setFilterEquipe(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                <option value="">Todas as equipes</option>{contEquipes.map((equipe) => <option key={equipe}>{equipe}</option>)}
              </select>
              <select value={filterInteg} onChange={(e) => setFilterInteg(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                <option value="">Sist. integrado</option><option value="sim">Sim</option><option value="nao">Não</option><option value="ns">Não informado</option>
              </select>
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                <option value="">Todos os tipos</option><option value="Operacional">Operacional</option><option value="Holding">Holding</option>
              </select>
            </>}
            {tab === "fiscal" && (
              <>
                <select value={filterRegime} onChange={(e) => setFilterRegime(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                  <option value="">Todos os regimes</option>{regimes.filter((r) => !/CC|Filial/i.test(r)).map((r) => <option key={r}>{r}</option>)}
                </select>
                <select value={filterEquipe} onChange={(e) => setFilterEquipe(e.target.value)} className="text-[12px] py-1.5 px-2 border border-gray-200 rounded-lg bg-white cursor-pointer">
                  <option value="">Todas as equipes</option>{fiscEquipes.map((equipe) => <option key={equipe}>{equipe}</option>)}
                </select>
              </>
            )}
            <span className="text-[11px] text-gray-500 ml-auto">
              {(tab === "geral" ? db.length : tab === "folha" ? folhaList.length : tab === "contabil" ? contList.length : tab === "fiscal" ? fiscList.length : tab === "afastados" ? afastList.length : auditList.length).toLocaleString("pt-BR")} empresas
            </span>
          </div>

          {tab === "afastados" && db.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-3">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Empresas</div>
                <div className="text-[20px] font-extrabold text-charcoal">{afastResumo.empresas.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Trabalhando</div>
                <div className="text-[20px] font-extrabold text-emerald-600">{afastResumo.trab.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Férias</div>
                <div className="text-[20px] font-extrabold text-amber-600">{afastResumo.ferias.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Afastados</div>
                <div className="text-[20px] font-extrabold text-red-600">{afastResumo.afastados.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Total Vidas</div>
                <div className="text-[20px] font-extrabold text-charcoal">{afastResumo.total.toLocaleString("pt-BR")}</div>
              </div>
            </div>
          )}

          {tab === "folha" && db.length > 0 && Object.keys(vidas).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Empresas Folha</div>
                <div className="text-[20px] font-extrabold text-charcoal">{folhaResumo.empresas.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Com Vidas Ativas</div>
                <div className="text-[20px] font-extrabold text-emerald-600">{folhaResumo.ativas.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Sem Vidas</div>
                <div className="text-[20px] font-extrabold text-gray-400">{folhaResumo.semVidas.toLocaleString("pt-BR")}</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Total Vidas Ativas</div>
                <div className="text-[20px] font-extrabold text-brand">{folhaResumo.total.toLocaleString("pt-BR")}</div>
              </div>
            </div>
          )}




          {loading && db.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-500 text-sm">
              Carregando base de empresas...
            </div>
          ) : db.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
              <div className="text-4xl mb-3">📥</div>
              <div className="text-[15px] font-bold text-charcoal mb-1">Nenhuma empresa cadastrada</div>
              <div className="text-[12px] text-gray-500 mb-4">A base é populada automaticamente pelo sincronismo S3D.</div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full border-collapse">
                {tab === "geral" && <>
                  <thead><tr><TH>Empresa</TH><TH>CNPJ</TH><TH>Grupo</TH><TH>Regime</TH><TH>Curva</TH><TH>Equipe DP</TH><TH>Equipe Cont.</TH><TH>Equipe Fisc.</TH></tr></thead>
                  <tbody>{db.filter(filter).map((d) => (
                    <tr key={d.cnpj} className="border-b border-gray-100 last:border-0 hover:bg-emerald-50/30">
                      <BaseCells d={d} />
                      <TD><CurvaSelect value={(folhaCfg[d.cnpj]?.curva || "") as BICurva} onChange={(v) => updateFolha(d.cnpj, "curva", v)} /></TD>
                      <TD>{getTagDepto(d.cnpj, "dp") ? <Chip label={getTagDepto(d.cnpj, "dp")} colorClass={getTagDepto(d.cnpj, "dp").includes("DP 1") ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"} /> : <span className="text-gray-300">—</span>}</TD>
                      <TD><span className="text-[11px] text-gray-600">{getTagDepto(d.cnpj, "cont") || "—"}</span></TD>
                      <TD><span className="text-[11px] text-gray-600">{getTagDepto(d.cnpj, "fisc") || "—"}</span></TD>
                    </tr>
                  ))}</tbody>
                </>}

                {tab === "folha" && <>
                  <thead><tr><TH>Empresa</TH><TH>CNPJ</TH><TH>Grupo</TH><TH>Regime</TH><TH>Curva</TH><TH>Equipe</TH><TH>Sistema</TH><TH>Adiant.</TH><TH>Dia</TH><TH>Fechamento</TH><TH>Vidas</TH></tr></thead>
                  <tbody>{folhaRemoved.map((c) => (<RemovedRow key={`rem-${c}`} cnpj={c} colSpan={11} onRemove={() => removeConfig("bi_config_folha", c)} />))}{folhaList.map((d) => {
                    const cfg = folhaCfg[d.cnpj] || { sistema: "", adiant: false, dia_adiant: "", fechamento: "", curva: "" };
                    const smov = cfg.sistema === "Sem movimento";
                    return (
                      <tr key={d.cnpj} className="border-b border-gray-100 last:border-0 hover:bg-emerald-50/30">
                        <BaseCells d={d} />
                        <TD><CurvaSelect value={(cfg.curva || "") as BICurva} onChange={(v) => updateFolha(d.cnpj, "curva", v)} /></TD>
                        <TD><span className="text-[11px] text-gray-600">{getTagDepto(d.cnpj, "dp") || "—"}</span></TD>
                        <TD><EditSelect value={cfg.sistema} opts={opcoes.sistema_folha} onChange={(v) => updateFolha(d.cnpj, "sistema", v)} /></TD>
                        <TD>{smov ? <span className="text-gray-300 text-xs">—</span> : <Toggle value={cfg.adiant} onChange={(v) => updateFolha(d.cnpj, "adiant", v)} />}</TD>
                        <TD>{smov || !cfg.adiant ? <span className="text-gray-300 text-xs">—</span> : <EditSelect value={cfg.dia_adiant} opts={["Dia 15", "Dia 20"]} onChange={(v) => updateFolha(d.cnpj, "dia_adiant", v)} />}</TD>
                        <TD>{smov ? <span className="text-gray-300 text-xs">—</span> : <EditSelect value={cfg.fechamento} opts={opcoes.fechamento_folha} onChange={(v) => updateFolha(d.cnpj, "fechamento", v)} className="min-w-[110px]" />}</TD>
                        <TD><VidaBadge v={vidas[d.cnpj]} /></TD>
                      </tr>
                    );
                  })}</tbody>
                </>}

                {tab === "contabil" && <>
                  <thead><tr><TH>Empresa</TH><TH>CNPJ</TH><TH>Grupo</TH><TH>Regime</TH><TH>Tipo Empresa</TH><TH>Curva</TH><TH>Equipe Cont.</TH><TH>Integrado</TH><TH>Sistema</TH><TH>Apur. LR</TH><TH>Fechamento</TH></tr></thead>
                  <tbody>{contRemoved.map((c) => (<RemovedRow key={`rem-${c}`} cnpj={c} colSpan={11} onRemove={() => removeConfig("bi_config_contabil", c)} />))}{contList.map((d) => {
                    const cfg = contCfg[d.cnpj] || { integrado: "", software: "", apuracao: "", fech_tipo: "", tipo_emp: "", tipo_holding: "", curva: "" };
                    const lr = biIsLucroReal(d.regime);
                    return (
                      <tr key={d.cnpj} className="border-b border-gray-100 last:border-0 hover:bg-emerald-50/30">
                        <BaseCells d={d} />
                        <TD>
                          <div className="flex flex-col gap-1 w-[100px]">
                            <EditSelect value={cfg.tipo_emp} opts={["Operacional", "Holding"]} onChange={(v) => updateCont(d.cnpj, "tipo_emp", v)} placeholder="Selecionar" className="min-w-0 max-w-none" />
                            {cfg.tipo_emp === "Holding" && <EditSelect value={cfg.tipo_holding} opts={["Investimento", "Part. Societária"]} onChange={(v) => updateCont(d.cnpj, "tipo_holding", v)} placeholder="Tipo" className="min-w-0 max-w-none" />}
                          </div>
                        </TD>
                        <TD><CurvaSelect value={(cfg.curva || "") as BICurva} onChange={(v) => updateCont(d.cnpj, "curva", v)} /></TD>
                        <TD><span className="text-[11px] text-gray-600">{getTagDepto(d.cnpj, "cont") || (d.contabil || "").trim() || "—"}</span></TD>

                        <TD>
                          <select value={cfg.integrado} onChange={(e) => updateCont(d.cnpj, "integrado", e.target.value)} className="text-[10.5px] px-1.5 py-0.5 border border-gray-200 rounded bg-white cursor-pointer">
                            <option value="">—</option><option value="sim">Sim</option><option value="nao">Não</option>
                          </select>
                        </TD>
                        <TD>{cfg.integrado ? <EditSelect value={cfg.software} opts={opcoes.sistema_cli} onChange={(v) => updateCont(d.cnpj, "software", v)} /> : <span className="text-gray-300 text-xs">—</span>}</TD>
                        <TD>{lr ? <EditSelect value={cfg.apuracao} opts={opcoes.apuracao} onChange={(v) => updateCont(d.cnpj, "apuracao", v)} /> : <span className="text-gray-400 text-xs">N/A</span>}</TD>
                        <TD><EditSelect value={cfg.fech_tipo} opts={opcoes.fech_tipo} onChange={(v) => updateCont(d.cnpj, "fech_tipo", v)} className="min-w-[90px]" /></TD>
                      </tr>
                    );
                  })}</tbody>
                </>}

                {tab === "fiscal" && <>
                  <thead><tr><TH>Empresa</TH><TH>CNPJ</TH><TH>Grupo</TH><TH>Regime</TH><TH>Curva</TH><TH>Equipe Fisc.</TH></tr></thead>
                  <tbody>{fiscRemoved.map((c) => (<RemovedRow key={`rem-${c}`} cnpj={c} colSpan={6} onRemove={() => removeConfig("bi_config_fiscal", c)} />))}{fiscList.map((d) => {
                    const cfg = fiscCfg[d.cnpj] || { curva: "" };
                    return (
                      <tr key={d.cnpj} className="border-b border-gray-100 last:border-0 hover:bg-emerald-50/30">
                        <BaseCells d={d} />
                        <TD><CurvaSelect value={(cfg.curva || "") as BICurva} onChange={(v) => updateFisc(d.cnpj, "curva", v)} /></TD>
                        <TD><span className="text-[11px] text-gray-600">{getTagDepto(d.cnpj, "fisc") || "—"}</span></TD>
                      </tr>
                    );
                  })}</tbody>
                </>}

                {tab === "afastados" && <>
                  <thead><tr><TH>Empresa</TH><TH>CNPJ</TH><TH>Grupo</TH><TH>Regime</TH><TH>Equipe DP</TH><TH className="text-right">Trab.</TH><TH className="text-right">Férias</TH><TH className="text-right">Afastados</TH><TH className="text-right">Total</TH></tr></thead>
                  <tbody>{afastList.filter(filter).map((d) => {
                    const v = vidas[d.cnpj] || { trabalhando: 0, ferias: 0, afastados: 0, total_ativos: 0 };
                    return (
                      <tr key={d.cnpj} className="border-b border-gray-100 last:border-0 hover:bg-red-50/20">
                        <BaseCells d={d} />
                        <TD><span className="text-[11px] text-gray-600">{getTagDepto(d.cnpj, "dp") || "—"}</span></TD>
                        <TD className="text-right font-semibold">{v.trabalhando.toLocaleString("pt-BR")}</TD>
                        <TD className="text-right font-semibold text-amber-600">{v.ferias.toLocaleString("pt-BR")}</TD>
                        <TD className="text-right font-bold text-red-600">{v.afastados.toLocaleString("pt-BR")}</TD>
                        <TD className="text-right font-semibold">{v.total_ativos.toLocaleString("pt-BR")}</TD>
                      </tr>
                    );
                  })}</tbody>
                </>}

                {tab === "auditoria" && <>
                  <thead><tr><TH>Empresa</TH><TH>CNPJ</TH><TH>Grupo</TH><TH>Regime</TH><TH>Tags no S3D</TH><TH className="text-right">Trab.</TH><TH className="text-right">Férias</TH><TH className="text-right">Afast.</TH><TH className="text-right">Total</TH></tr></thead>
                  <tbody>{auditList.filter(filter).map((d) => {
                    const v = vidas[d.cnpj] || { trabalhando: 0, ferias: 0, afastados: 0, total_ativos: 0 };
                    return (
                      <tr key={d.cnpj} className="border-b border-gray-100 last:border-0 hover:bg-red-50/20">
                        <BaseCells d={d} />
                        <TD><span className="text-[10px] text-gray-500 overflow-hidden text-ellipsis block max-w-[180px]" title={d.tags}>{d.tags || <span className="text-gray-300">sem tags</span>}</span></TD>
                        <TD className="text-right font-semibold">{v.trabalhando.toLocaleString("pt-BR")}</TD>
                        <TD className="text-right font-semibold text-amber-600">{v.ferias.toLocaleString("pt-BR")}</TD>
                        <TD className="text-right font-bold text-purple-600">{v.afastados.toLocaleString("pt-BR")}</TD>
                        <TD className="text-right font-bold text-red-600">{v.total_ativos.toLocaleString("pt-BR")}</TD>
                      </tr>
                    );
                  })}</tbody>
                </>}
              </table>
            </div>
          )}
        </div>

        {/* Modal Opções */}
        {showOpcoesModal && (
          <OpcoesModal
            opcoes={opcoes}
            onClose={() => setShowOpcoesModal(false)}
            onAdd={addOpcao}
            onDelete={delOpcao}
          />
        )}

        {/* Modal Empregados */}
        {showEmpModal && (
          <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-7 w-[520px] max-w-[92vw]">
              <h3 className="text-[15px] font-extrabold text-gray-900 mb-1">Importar Empregados</h3>
              <p className="text-[12px] text-gray-500 mb-4">XLS completo ou CSV resumo. Se XLS, também importe os Dados Cadastrais para resolver os CNPJs.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <UploadZone label="Empregados (.xls ou .csv)" hint="XLS BIFF2 ou CSV resumo" accept=".xls,.xlsx,.csv" hasFile={!!empFile} onFile={setEmpFile} />
                <UploadZone label="Dados Cadastrais (.xlsx)" hint="Para resolver código → CNPJ" accept=".xls,.xlsx" hasFile={!!cadFile} onFile={setCadFile} />
              </div>
              {loading && <p className="text-[11px] text-emerald-700 font-medium mb-3">{spinMsg}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowEmpModal(false)} className="text-[12px] font-semibold px-4 py-2 rounded-lg border border-gray-200 text-gray-600">Cancelar</button>
                <button onClick={doEmp} disabled={!empFile || loading} className="text-[12px] font-bold px-4 py-2 rounded-lg bg-brand text-charcoal disabled:opacity-40">Processar</button>
              </div>
            </div>
          </div>
        )}

        {saving && (
          <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-[12px] font-semibold px-4 py-2 rounded-lg shadow-lg z-50">
            ✓ Salvo
          </div>
        )}
      </div>
    </HubShell>
  );
}
