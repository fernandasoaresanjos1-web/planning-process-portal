import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { HubShell } from "@/components/HubShell";
import {
  importCertificados,
  listImportacoesCert,
  getResumoCertificados,
  getEmpresasSemCertificado,
  listarCertificadosPorFonte,
  type Fonte,
  type CertificadoLista,
} from "@/lib/certificados";

import { AlertTriangle, FileText, ShieldCheck, UploadCloud, Search, Building2, CalendarClock, Download } from "lucide-react";
import * as XLSX from "xlsx";

function exportarXlsx(nome: string, linhas: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, `${nome}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export const Route = createFileRoute("/certificados")({
  head: () => ({ meta: [{ title: "Painel de Certificados — Planning Hub" }] }),
  component: CertificadosPage,
});

const FONTES: Fonte[] = ["ByToken", "SAAM", "Agilizza"];
const FONTES_VISIVEIS: Fonte[] = ["ByToken", "SAAM", "Agilizza"];


function formatCnpj(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return c;
}

function CertificadosPage() {
  const qc = useQueryClient();
  const [fonte, setFonte] = useState<Fonte>("ByToken");
  const [file, setFile] = useState<File | null>(null);
  const [autor, setAutor] = useState("");
  const [fonteCheck, setFonteCheck] = useState<Fonte>("ByToken");
  const [busca, setBusca] = useState("");
  const [equipeSem, setEquipeSem] = useState<string>("todas");
  const [tab, setTab] = useState<"panorama" | "vencimentos" | "alertas" | "uploads">("panorama");

  const resumoQ = useQuery({ queryKey: ["cert-resumo"], queryFn: getResumoCertificados });
  const impsQ = useQuery({ queryKey: ["cert-imps"], queryFn: listImportacoesCert });
  const semCertQ = useQuery({ queryKey: ["cert-sem", fonteCheck], queryFn: () => getEmpresasSemCertificado(fonteCheck) });

  const uploadM = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione o arquivo antes de importar.");
      return importCertificados(fonte, file, autor.trim() || undefined);
    },
    onSuccess: () => {
      setFile(null);
      qc.invalidateQueries({ queryKey: ["cert-resumo"] });
      qc.invalidateQueries({ queryKey: ["cert-imps"] });
      qc.invalidateQueries({ queryKey: ["cert-sem"] });
    },
  });

  const resumo = resumoQ.data;
  const totalGeral = useMemo(() => Object.values(resumo?.porFonte ?? {}).reduce((a, b) => a + b.total, 0), [resumo]);
  const vencidos = useMemo(() => Object.values(resumo?.porFonte ?? {}).reduce((a, b) => a + b.vencidos, 0), [resumo]);
  const vence30 = useMemo(() => Object.values(resumo?.porFonte ?? {}).reduce((a, b) => a + b.vence30, 0), [resumo]);

  const equipesSem = useMemo(() => {
    const set = new Set<string>();
    for (const r of semCertQ.data?.rows ?? []) for (const t of r.tags) set.add(t);
    return Array.from(set).sort();
  }, [semCertQ.data]);

  const semCertFiltradas = useMemo(() => {
    let rows = semCertQ.data?.rows ?? [];
    if (equipeSem !== "todas") rows = rows.filter((r) => r.tags.includes(equipeSem));
    if (busca.trim()) {
      const t = busca.toLowerCase();
      const digits = busca.replace(/\D/g, "");
      rows = rows.filter((r) => (digits && r.cnpj.includes(digits)) || (r.razao ?? "").toLowerCase().includes(t) || (r.grupo ?? "").toLowerCase().includes(t));
    }
    return rows;
  }, [semCertQ.data, busca, equipeSem]);

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Compliance</div>
        <div className="flex items-start justify-between gap-4 mb-7 flex-wrap">
          <div>
            <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Painel de Certificados</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cruze ByToken (Acessórias), SAAM e Agilizza com a Base Empresas e controle vencimentos.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-[520px]">
            <Kpi icon={<ShieldCheck size={15} />} label="Certificados" value={totalGeral} />
            <Kpi icon={<AlertTriangle size={15} />} label="Vencidos" value={vencidos} tone="danger" />
            <Kpi icon={<AlertTriangle size={15} />} label="Vence em 30 dias" value={vence30} tone="warn" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border mb-6">
          <TabBtn active={tab === "panorama"} onClick={() => setTab("panorama")}>Visão geral</TabBtn>
          <TabBtn active={tab === "vencimentos"} onClick={() => setTab("vencimentos")}>Vencimentos</TabBtn>
          <TabBtn active={tab === "alertas"} onClick={() => setTab("alertas")}>Alertas</TabBtn>
          <TabBtn active={tab === "uploads"} onClick={() => setTab("uploads")}>Uploads</TabBtn>
        </div>

        {tab === "vencimentos" && <VencimentosPanel />}
        {tab === "alertas" && <AlertasPanel />}


        {tab === "panorama" && <>
        {/* Por fonte */}
        <section className="grid grid-cols-1 gap-4 mb-6">
          {FONTES_VISIVEIS.map((f) => {
            const r = resumo?.porFonte[f];
            return (
              <div key={f} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-extrabold text-charcoal">{f}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                    {(r?.total ?? 0).toLocaleString("pt-BR")} cert.
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Mini label="Vencidos" value={r?.vencidos ?? 0} color="#dc2626" />
                  <Mini label="30d" value={r?.vence30 ?? 0} color="#ea580c" />
                  <Mini label="60d" value={r?.vence60 ?? 0} color="#ca8a04" />
                  <Mini label="90d" value={r?.vence90 ?? 0} color="#16a34a" />
                </div>
              </div>
            );
          })}
        </section>

        {/* Empresas sem certificado */}
        <section className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-charcoal">Empresas SEM vínculo de certificado</h2>
              <p className="text-[12px] text-muted-foreground">
                Cruzamento com a <Link to="/base-empresas" className="underline">Base Empresas</Link> ativa.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={fonteCheck} onChange={(e) => setFonteCheck(e.target.value as Fonte)} className="h-9 px-3 rounded-md border border-border bg-white text-[12px]">
                {FONTES_VISIVEIS.map((f) => <option key={f} value={f}>Sem certificado em {f}</option>)}
              </select>
              <select value={equipeSem} onChange={(e) => setEquipeSem(e.target.value)} className="h-9 px-3 rounded-md border border-border bg-white text-[12px]">
                <option value="todas">Todas as equipes</option>
                {equipesSem.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="CNPJ, razão ou grupo" className="h-9 pl-8 pr-3 rounded-md border border-border bg-white text-[12px] w-[220px]" />
              </div>
              <button
                onClick={() => exportarXlsx("empresas-sem-certificado", semCertFiltradas.map((e) => ({
                  CNPJ: formatCnpj(e.cnpj),
                  "Razão Social": e.razao ?? "",
                  Grupo: e.grupo ?? "",
                  Equipes: e.tags.join(" · "),
                })))}
                disabled={semCertFiltradas.length === 0}
                className="h-9 px-3 rounded-md bg-charcoal text-white text-[12px] font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Download size={13} /> Exportar
              </button>
            </div>
          </div>
          <div className="px-5 py-3 text-[12px] text-muted-foreground border-b border-border bg-muted/30">
            {semCertQ.isLoading ? "Carregando…" : (
              <>
                <strong className="text-charcoal">{semCertQ.data?.comCertificado.toLocaleString("pt-BR") ?? 0}</strong> com certificado em {fonteCheck} ·{" "}
                <strong className="text-destructive">{(semCertQ.data?.rows.length ?? 0).toLocaleString("pt-BR")}</strong> sem vínculo ·{" "}
                Base com {semCertQ.data?.totalEmpresas.toLocaleString("pt-BR") ?? 0} empresas
              </>
            )}
          </div>
          {semCertFiltradas.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-muted-foreground">
              {semCertQ.data?.totalEmpresas === 0
                ? <>Base Empresas vazia. <Link to="/base-empresas" className="underline">Importe agora</Link>.</>
                : "Tudo certo — todas as empresas têm certificado nessa fonte."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2 font-bold">CNPJ</th>
                    <th className="px-3 py-2 font-bold">Razão Social</th>
                    <th className="px-3 py-2 font-bold">Grupo</th>
                    <th className="px-3 py-2 font-bold">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {semCertFiltradas.slice(0, 1000).map((e) => (
                    <tr key={e.cnpj} className="border-t border-border hover:bg-muted/30">
                      <td className="px-5 py-2 font-mono">{formatCnpj(e.cnpj)}</td>
                      <td className="px-3 py-2 font-semibold text-charcoal">{e.razao ?? "—"}</td>
                      <td className="px-3 py-2">{e.grupo ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {e.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {semCertFiltradas.length > 1000 && (
                <div className="px-5 py-2 text-[11px] text-muted-foreground bg-muted/30">Mostrando 1.000 de {semCertFiltradas.length.toLocaleString("pt-BR")}. Refine com a busca.</div>
              )}
            </div>
          )}
        </section>
        </>}

        {tab === "uploads" && <>
        {/* Upload */}
        <section className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <UploadCloud size={18} className="text-charcoal" />
            <h2 className="text-[18px] font-extrabold text-charcoal">Novo upload</h2>
          </div>
          <div className="grid grid-cols-[200px_1fr_220px_140px] gap-3 items-end">
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Fonte</span>
              <select value={fonte} onChange={(e) => setFonte(e.target.value as Fonte)} className="w-full h-10 px-3 rounded-md border border-border bg-white text-[13px]">
                {FONTES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Arquivo</span>
              <input
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full h-10 text-[12px] file:mr-3 file:h-10 file:px-3 file:border-0 file:bg-charcoal file:text-white file:rounded-l-md border border-border rounded-md bg-white"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Responsável</span>
              <input value={autor} onChange={(e) => setAutor(e.target.value)} placeholder="Seu nome" className="w-full h-10 px-3 rounded-md border border-border bg-white text-[13px]" />
            </label>
            <button
              onClick={() => uploadM.mutate()}
              disabled={!file || uploadM.isPending}
              className="h-10 rounded-md bg-charcoal text-white text-[12px] font-bold disabled:opacity-50"
            >
              {uploadM.isPending ? "Importando…" : "Importar"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            ByToken: aceita PDF "Relação de Certificados". SAAM: XLSX "Certificados Ativos/Vencidos" (usa CNPJ, Válido até e Situação Certificado). Agilizza: XLSX com colunas CNPJ e Validade. Duplicados são removidos automaticamente.
          </p>
          {uploadM.isSuccess && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
              Importado {uploadM.data.total.toLocaleString("pt-BR")} certificados da fonte {uploadM.data.importacao.fonte}.
            </div>
          )}
          {uploadM.error && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
              {(uploadM.error as Error).message}
            </div>
          )}
        </section>

        {/* Histórico */}
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <FileText size={15} className="text-charcoal" />
            <h2 className="text-[15px] font-extrabold text-charcoal">Histórico de uploads</h2>
          </div>
          {(impsQ.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-[13px] text-muted-foreground">Nenhum upload registrado.</div>
          ) : (
            <div className="divide-y divide-border">
              {impsQ.data!.map((imp) => (
                <div key={imp.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-extrabold text-charcoal flex items-center gap-2">
                      <Building2 size={13} />
                      {imp.fonte}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${imp.ativo ? "bg-brand text-charcoal" : "bg-muted text-muted-foreground"}`}>
                        {imp.ativo ? "ativa" : "histórico"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{imp.arquivo_nome}</div>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    <div><strong className="text-charcoal">{imp.total_certificados.toLocaleString("pt-BR")}</strong> certificados</div>
                    <div>{new Date(imp.criado_em).toLocaleString("pt-BR")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </>}
      </div>
    </HubShell>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "danger" | "warn" }) {
  const color = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-charcoal";
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between text-muted-foreground mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className={`text-[26px] font-extrabold leading-none ${color}`}>{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[18px] font-extrabold" style={{ color }}>{value.toLocaleString("pt-BR")}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 h-9 text-[12px] font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
        active ? "border-charcoal text-charcoal" : "border-transparent text-muted-foreground hover:text-charcoal"
      }`}
    >
      {children}
    </button>
  );
}

type StatusFiltro = "todos" | "vencido" | "30" | "60" | "90" | "ok" | "sem-data";

function VencimentosPanel() {
  const [fonte, setFonte] = useState<Fonte>("ByToken");
  const q = useQuery({ queryKey: ["cert-lista", fonte], queryFn: () => listarCertificadosPorFonte(fonte) });
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusFiltro>("todos");

  const [equipe, setEquipe] = useState<string>("todas");

  const equipes = useMemo(() => {
    const set = new Set<string>();
    for (const c of q.data ?? []) for (const t of c.tags) set.add(t);
    return Array.from(set).sort();
  }, [q.data]);

  const filtradas = useMemo(() => {
    let rows = q.data ?? [];
    if (status !== "todos") rows = rows.filter((r) => r.status === status);
    if (equipe !== "todas") rows = rows.filter((r) => r.tags.includes(equipe));
    if (busca.trim()) {
      const t = busca.toLowerCase();
      const digits = busca.replace(/\D/g, "");
      rows = rows.filter((r) =>
        (digits && r.cnpj.includes(digits)) ||
        (r.razao ?? "").toLowerCase().includes(t) ||
        (r.grupo ?? "").toLowerCase().includes(t)
      );
    }
    return rows;
  }, [q.data, status, equipe, busca]);

  const contagens = useMemo(() => {
    const base = q.data ?? [];
    return {
      todos: base.length,
      vencido: base.filter((r) => r.status === "vencido").length,
      "30": base.filter((r) => r.status === "30").length,
      "60": base.filter((r) => r.status === "60").length,
      "90": base.filter((r) => r.status === "90").length,
      ok: base.filter((r) => r.status === "ok").length,
      "sem-data": base.filter((r) => r.status === "sem-data").length,
    };
  }, [q.data]);

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-charcoal" />
          <h2 className="text-[16px] font-extrabold text-charcoal">Vencimentos de certificados ({fonte})</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={fonte} onChange={(e) => setFonte(e.target.value as Fonte)} className="h-9 px-3 rounded-md border border-border bg-white text-[12px] font-bold">
            {FONTES_VISIVEIS.map((f) => <option key={f} value={f}>Fonte: {f}</option>)}
          </select>
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className="h-9 px-3 rounded-md border border-border bg-white text-[12px]">
            <option value="todas">Todas as equipes</option>
            {equipes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="CNPJ, razão ou grupo" className="h-9 pl-8 pr-3 rounded-md border border-border bg-white text-[12px] w-[220px]" />
          </div>
          <button
            onClick={() => exportarXlsx("certificados-vencimentos", filtradas.map((c) => ({
              CNPJ: formatCnpj(c.cnpj),
              "Razão Social": c.razao ?? "",
              Grupo: c.grupo ?? "",
              Equipes: c.tags.join(" · "),
              Validade: c.validade ? new Date(c.validade + "T00:00:00").toLocaleDateString("pt-BR") : "",
              "Dias restantes": c.diasRestantes ?? "",
              Situação: c.status,
            })))}
            disabled={filtradas.length === 0}
            className="h-9 px-3 rounded-md bg-charcoal text-white text-[12px] font-bold flex items-center gap-1 disabled:opacity-50"
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-5 py-3 border-b border-border bg-muted/20">
        <Pill active={status === "todos"} onClick={() => setStatus("todos")} label={`Todos · ${contagens.todos}`} />
        <Pill active={status === "vencido"} onClick={() => setStatus("vencido")} label={`Vencidos · ${contagens.vencido}`} color="#dc2626" />
        <Pill active={status === "30"} onClick={() => setStatus("30")} label={`30 dias · ${contagens["30"]}`} color="#ea580c" />
        <Pill active={status === "60"} onClick={() => setStatus("60")} label={`60 dias · ${contagens["60"]}`} color="#ca8a04" />
        <Pill active={status === "90"} onClick={() => setStatus("90")} label={`90 dias · ${contagens["90"]}`} color="#16a34a" />
        <Pill active={status === "ok"} onClick={() => setStatus("ok")} label={`Em dia · ${contagens.ok}`} />
        <Pill active={status === "sem-data"} onClick={() => setStatus("sem-data")} label={`Sem data · ${contagens["sem-data"]}`} />
      </div>

      {q.isLoading ? (
        <div className="p-8 text-center text-[13px] text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div className="p-8 text-center text-[13px] text-muted-foreground">Nenhum certificado nesses filtros.</div>
      ) : (
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2 font-bold">CNPJ</th>
                <th className="px-3 py-2 font-bold">Razão Social</th>
                <th className="px-3 py-2 font-bold">Grupo</th>
                <th className="px-3 py-2 font-bold">Equipe</th>
                <th className="px-3 py-2 font-bold">Validade</th>
                <th className="px-3 py-2 font-bold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 2000).map((c) => (
                <CertRow key={c.cnpj + (c.validade ?? "")} c={c} />
              ))}
            </tbody>
          </table>
          {filtradas.length > 2000 && (
            <div className="px-5 py-2 text-[11px] text-muted-foreground bg-muted/30">Mostrando 2.000 de {filtradas.length.toLocaleString("pt-BR")}. Refine com a busca.</div>
          )}
        </div>
      )}
    </section>
  );
}

function Pill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-3 rounded-full text-[11px] font-bold border transition-colors ${
        active ? "bg-charcoal text-white border-charcoal" : "bg-white text-charcoal border-border hover:bg-muted"
      }`}
      style={active && color ? { background: color, borderColor: color } : undefined}
    >
      {label}
    </button>
  );
}

function CertRow({ c }: { c: CertificadoLista }) {
  const cor =
    c.status === "vencido" ? "#dc2626" :
    c.status === "30" ? "#ea580c" :
    c.status === "60" ? "#ca8a04" :
    c.status === "90" ? "#16a34a" :
    c.status === "ok" ? "#0f766e" : "#6b7280";
  const rotulo =
    c.status === "vencido" ? `Vencido há ${Math.abs(c.diasRestantes ?? 0)}d` :
    c.status === "sem-data" ? "Sem data" :
    `Vence em ${c.diasRestantes}d`;
  
  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="px-5 py-2 font-mono">{formatCnpj(c.cnpj)}</td>
      <td className="px-3 py-2 font-semibold text-charcoal">{c.razao ?? "—"}</td>
      <td className="px-3 py-2">{c.grupo ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {c.tags.length === 0 ? <span className="text-muted-foreground">—</span> : c.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 font-mono">{c.validade ? new Date(c.validade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
      <td className="px-3 py-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: cor }}>{rotulo}</span>
      </td>
    </tr>
  );
}

function AlertasPanel() {
  const [busca, setBusca] = useState("");
  const [equipe, setEquipe] = useState("todas");

  const byQ = useQuery({ queryKey: ["cert-list", "ByToken"], queryFn: () => listarCertificadosPorFonte("ByToken") });
  const saamQ = useQuery({ queryKey: ["cert-list", "SAAM"], queryFn: () => listarCertificadosPorFonte("SAAM") });
  const agQ = useQuery({ queryKey: ["cert-list", "Agilizza"], queryFn: () => listarCertificadosPorFonte("Agilizza") });

  const loading = byQ.isLoading || saamQ.isLoading || agQ.isLoading;

  const alertas = useMemo(() => {
    const isAtivo = (c: CertificadoLista) => c.status !== "vencido" && c.validade !== null;
    const semZ = (s: string) => s.replace(/^0+/, "");
    const setAtivo = (arr: CertificadoLista[] | undefined) => {
      const s = new Set<string>();
      for (const c of arr ?? []) if (isAtivo(c)) { s.add(c.cnpj); s.add(semZ(c.cnpj)); }
      return s;
    };
    const saamSet = setAtivo(saamQ.data);
    const agSet = setAtivo(agQ.data);
    const naFonte = (s: Set<string>, cnpj: string) => s.has(cnpj) || s.has(semZ(cnpj));
    return (byQ.data ?? [])
      .filter((c) => isAtivo(c))
      .filter((c) => !naFonte(saamSet, c.cnpj) && !naFonte(agSet, c.cnpj));
  }, [byQ.data, saamQ.data, agQ.data]);

  const equipes = useMemo(() => {
    const s = new Set<string>();
    for (const c of alertas) for (const t of c.tags) s.add(t);
    return Array.from(s).sort();
  }, [alertas]);

  const filtradas = useMemo(() => {
    let rows = alertas;
    if (equipe !== "todas") rows = rows.filter((r) => r.tags.includes(equipe));
    if (busca.trim()) {
      const t = busca.toLowerCase();
      const d = busca.replace(/\D/g, "");
      rows = rows.filter((r) => (d && r.cnpj.includes(d)) || (r.razao ?? "").toLowerCase().includes(t) || (r.grupo ?? "").toLowerCase().includes(t));
    }
    return rows;
  }, [alertas, busca, equipe]);

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-extrabold text-charcoal flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            Ativos no ByToken, mas SEM certificado ativo no SAAM e Agilizza
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Considera apenas certificados dentro da validade em cada fonte. Empresas fora da Base Empresas ativa não aparecem.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className="h-9 px-3 rounded-md border border-border bg-white text-[12px]">
            <option value="todas">Todas as equipes</option>
            {equipes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="CNPJ, razão ou grupo" className="h-9 pl-8 pr-3 rounded-md border border-border bg-white text-[12px] w-[220px]" />
          </div>
          <button
            onClick={() => exportarXlsx("alerta-bytoken-sem-saam-agilizza", filtradas.map((c) => ({
              CNPJ: formatCnpj(c.cnpj),
              "Razão Social": c.razao ?? "",
              Grupo: c.grupo ?? "",
              Equipes: c.tags.join(" · "),
              "Validade ByToken": c.validade ?? "",
            })))}
            disabled={filtradas.length === 0}
            className="h-9 px-3 rounded-md bg-charcoal text-white text-[12px] font-bold flex items-center gap-1 disabled:opacity-50"
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>
      <div className="px-5 py-3 text-[12px] text-muted-foreground border-b border-border bg-muted/30">
        {loading ? "Carregando…" : (
          <>
            <strong className="text-destructive">{filtradas.length.toLocaleString("pt-BR")}</strong> em alerta ·{" "}
            ByToken ativos: {(byQ.data ?? []).filter((c) => c.status !== "vencido" && c.validade).length.toLocaleString("pt-BR")} ·{" "}
            SAAM ativos: {(saamQ.data ?? []).filter((c) => c.status !== "vencido" && c.validade).length.toLocaleString("pt-BR")} ·{" "}
            Agilizza ativos: {(agQ.data ?? []).filter((c) => c.status !== "vencido" && c.validade).length.toLocaleString("pt-BR")}
          </>
        )}
      </div>
      {filtradas.length === 0 ? (
        <div className="p-8 text-center text-[13px] text-muted-foreground">
          {loading ? "…" : "Nenhuma empresa em alerta."}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2 font-bold">CNPJ</th>
                <th className="px-3 py-2 font-bold">Razão Social</th>
                <th className="px-3 py-2 font-bold">Grupo</th>
                <th className="px-3 py-2 font-bold">Equipes</th>
                <th className="px-3 py-2 font-bold">Validade ByToken</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 1000).map((c) => (
                <tr key={c.cnpj} className="border-t border-border hover:bg-muted/30">
                  <td className="px-5 py-2 font-mono">{formatCnpj(c.cnpj)}</td>
                  <td className="px-3 py-2 font-semibold text-charcoal">{c.razao ?? "—"}</td>
                  <td className="px-3 py-2">{c.grupo ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono">{c.validade ? new Date(c.validade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length > 1000 && (
            <div className="px-5 py-2 text-[11px] text-muted-foreground bg-muted/30">Mostrando 1.000 de {filtradas.length.toLocaleString("pt-BR")}. Refine com a busca.</div>
          )}
        </div>
      )}
    </section>
  );
}
