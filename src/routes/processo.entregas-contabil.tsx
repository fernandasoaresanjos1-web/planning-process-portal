import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import {
  gerarAnaliseEntregas,
  importEntregasFile,
  exportToXlsx,
  formatCnpj,
  type AnaliseEntregas,
  type EmpresaPendente,
} from "@/lib/entregas-contabil";
import { ChevronLeft, Upload, Download, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

export const Route = createFileRoute("/processo/entregas-contabil")({
  head: () => ({ meta: [{ title: "Entregas Contábil (ECD/ECF) — Planning Hub" }] }),
  component: EntregasPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function Card({ label, value, color, hint }: { label: string; value: string | number; color?: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[24px] font-extrabold mt-1" style={{ color: color ?? "var(--charcoal)" }}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

type FaltaTab = "faltam_gerar" | "gerada_nao_entregue";
type Obrigacao = "ambas" | "ECD" | "ECF";

function EntregasPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"visao" | "equipes" | "faltam" | "radar" | "alertas" | "upload">("visao");
  const [faltaTab, setFaltaTab] = useState<FaltaTab>("faltam_gerar");
  const [obrig, setObrig] = useState<Obrigacao>("ambas");
  const fileRef = useRef<HTMLInputElement>(null);
  const [filtroEquipe, setFiltroEquipe] = useState<string>("");

  const analiseQ = useQuery<AnaliseEntregas>({ queryKey: ["entregas-contabil"], queryFn: gerarAnaliseEntregas });

  const uploadM = useMutation({
    mutationFn: (f: File) => importEntregasFile(f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entregas-contabil"] }),
  });

  const d = analiseQ.data;
  const baseLista: EmpresaPendente[] = d
    ? (() => {
        if (obrig === "ECD") return faltaTab === "faltam_gerar" ? d.faltam_gerar_ecd_lista : d.gerada_nao_entregue_ecd_lista;
        if (obrig === "ECF") return faltaTab === "faltam_gerar" ? d.faltam_gerar_ecf_lista : d.gerada_nao_entregue_ecf_lista;
        return faltaTab === "faltam_gerar" ? d.faltam_gerar_lista : d.gerada_nao_entregue_lista;
      })()
    : [];
  const faltamFiltradas: EmpresaPendente[] = filtroEquipe
    ? baseLista.filter((e) => (e.tags ?? []).includes(filtroEquipe))
    : baseLista;

  // Contadores por obrigação para as abas
  const countFalta = obrig === "ECD" ? (d?.ecd_falta_gerar ?? 0) : obrig === "ECF" ? (d?.ecf_falta_gerar ?? 0) : (d?.faltam_gerar ?? 0);
  const countGerNE = obrig === "ECD" ? (d?.ecd_gerada_nao_entregue ?? 0) : obrig === "ECF" ? (d?.ecf_gerada_nao_entregue ?? 0) : (d?.gerada_nao_entregue ?? 0);
  // Helpers de equipe por obrigação
  const equipeFaltaGerar = (eq: { falta_gerar_ecd: number; falta_gerar_ecf: number; faltam_gerar: number }) =>
    obrig === "ECD" ? eq.falta_gerar_ecd : obrig === "ECF" ? eq.falta_gerar_ecf : eq.faltam_gerar;
  const equipeGerNE = (eq: { gerada_nao_entregue_ecd: number; gerada_nao_entregue_ecf: number; gerada_nao_entregue: number }) =>
    obrig === "ECD" ? eq.gerada_nao_entregue_ecd : obrig === "ECF" ? eq.gerada_nao_entregue_ecf : eq.gerada_nao_entregue;

  return (
    <HubShell>
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/processos" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
              <ChevronLeft size={13} /> Processos
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: "#8B5CF622", color: "#8B5CF6" }}>
              entregas-contabil
            </span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">Entregas Contábil — ECD / ECF</h1>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {d?.competencia ? `Base Acessórias: ${String(d.competencia).slice(5, 7)}/${String(d.competencia).slice(0, 4)}` : "Base mensal não importada"}
          </div>
        </div>

        <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
          {[
            ["visao", "Visão geral"],
            ["equipes", "Por equipe"],
            ["faltam", "Pendências"],
            ["radar", `Radar · justificadas${d ? ` (${d.radar_justificadas.length})` : ""}`],
            ["alertas", "Alertas"],
            ["upload", "Atualizar S3D"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={`px-4 py-2 text-[12px] font-semibold border-b-2 -mb-px ${tab === k ? "border-charcoal text-charcoal" : "border-transparent text-muted-foreground hover:text-charcoal"}`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Filtro global de obrigação */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Obrigação:</span>
          {(["ambas", "ECD", "ECF"] as Obrigacao[]).map((o) => (
            <button
              key={o}
              onClick={() => setObrig(o)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full border ${
                obrig === o ? "bg-charcoal text-white border-charcoal" : "border-border text-muted-foreground hover:text-charcoal bg-white"
              }`}
            >
              {o === "ambas" ? "Ambas" : o}
            </button>
          ))}
        </div>

        {analiseQ.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
            <Loader2 className="animate-spin" size={14} /> Carregando análise…
          </div>
        )}
        {analiseQ.error && <div className="text-destructive text-[13px]">{(analiseQ.error as Error).message}</div>}

        {d && tab === "visao" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card label="Base Acessórias" value={d.total_acessorias} hint="empresas no mês ativo" />
              <Card label="LR + LP Contábil" value={d.total_lr_lp_contabil} color="#8B5CF6" hint="matriz · TAG contábil" />
              <Card label="CNPJs no S3D" value={d.total_entregas_cnpj} color="#14C8FA" hint="ECD ou ECF cadastrados" />
              <Card label="Tudo entregue (ECD+ECF)" value={d.tudo_entregue} color="#00BF63" hint="ambas obrigações entregues" />
            </div>

            {(obrig === "ambas" || obrig === "ECD") && (
              <div className="mb-4">
                <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-2">ECD</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card label="Gerou ECD" value={d.ecd_gerou} color="#8B5CF6" hint={`de ${d.total_lr_lp_contabil}`} />
                  <Card label="Entregou ECD" value={d.ecd_entregou} color="#00BF63" />
                  <Card label="Gerada s/ entrega" value={d.ecd_gerada_nao_entregue} color="#FA6914" />
                  <Card label="Falta gerar ECD" value={d.ecd_falta_gerar} color="#EF4444" />
                </div>
              </div>
            )}

            {(obrig === "ambas" || obrig === "ECF") && (
              <div className="mb-5">
                <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-2">ECF</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card label="Gerou ECF" value={d.ecf_gerou} color="#8B5CF6" hint={`de ${d.total_lr_lp_contabil}`} />
                  <Card label="Entregou ECF" value={d.ecf_entregou} color="#00BF63" />
                  <Card label="Gerada s/ entrega" value={d.ecf_gerada_nao_entregue} color="#FA6914" />
                  <Card label="Falta gerar ECF" value={d.ecf_falta_gerar} color="#EF4444" />
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-[14px] font-bold text-charcoal mb-2">Como ler esse painel</h2>
              <ul className="text-[12px] text-muted-foreground space-y-1 list-disc pl-5">
                <li>Considera empresas <strong>Lucro Real</strong> e <strong>Lucro Presumido</strong> (somente matriz) com pelo menos uma <strong>TAG Contábil</strong> elegível.</li>
                <li>Excluídas em todos os indicadores e alertas: Equipe CC, Canopus, Planning RJ, CX e FILIAL.</li>
                <li>Use o filtro <strong>Obrigação</strong> no topo pra alternar entre indicadores combinados, somente ECD ou somente ECF — afeta Visão geral, Por equipe e Pendências.</li>
                <li><strong>Falta gerar</strong>: a obrigação ainda não foi cadastrada no S3D.</li>
                <li><strong>Gerada não entregue</strong>: a obrigação está cadastrada no S3D mas ainda não foi transmitida (status diferente de <em>Ent. antecipada / Ent. PzTéc. / Entregue</em>).</li>
              </ul>
            </div>
          </>
        )}

        {d && tab === "equipes" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="text-[13px] font-bold">Indicador por equipe ({d.equipes.length})</div>
              <button
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                onClick={() => exportToXlsx("entregas-contabil-equipes.xlsx", [{ name: "Equipes", rows: d.equipes }])}
              >
                <Download size={12} /> Exportar XLSX
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">Equipe</th>
                    <th className="text-right px-4 py-2">Total LR/LP</th>
                    {(obrig === "ambas" || obrig === "ECD") && (
                      <>
                        <th className="text-right px-4 py-2 bg-violet-50">Gerou ECD</th>
                        <th className="text-right px-4 py-2 bg-violet-50">Entregou ECD</th>
                        <th className="text-right px-4 py-2 bg-violet-50">Falta gerar ECD</th>
                        <th className="text-right px-4 py-2 bg-violet-50">ECD s/ entrega</th>
                      </>
                    )}
                    {(obrig === "ambas" || obrig === "ECF") && (
                      <>
                        <th className="text-right px-4 py-2 bg-sky-50">Gerou ECF</th>
                        <th className="text-right px-4 py-2 bg-sky-50">Entregou ECF</th>
                        <th className="text-right px-4 py-2 bg-sky-50">Falta gerar ECF</th>
                        <th className="text-right px-4 py-2 bg-sky-50">ECF s/ entrega</th>
                      </>
                    )}
                    <th className="text-right px-4 py-2">% entregue</th>
                  </tr>
                </thead>
                <tbody>
                  {d.equipes.map((eq) => {
                    const totEntregue =
                      obrig === "ECD" ? eq.tudo_entregue_ecd : obrig === "ECF" ? eq.tudo_entregue_ecf : eq.tudo_entregue;
                    const pct = eq.total ? Math.round((totEntregue / eq.total) * 100) : 0;
                    return (
                      <tr key={eq.equipe} className="border-t border-border">
                        <td className="px-4 py-2 font-semibold text-charcoal whitespace-nowrap">{eq.equipe}</td>
                        <td className="px-4 py-2 text-right">{eq.total}</td>
                        {(obrig === "ambas" || obrig === "ECD") && (
                          <>
                            <td className="px-4 py-2 text-right bg-violet-50/40">{eq.gerou_ecd}</td>
                            <td className="px-4 py-2 text-right bg-violet-50/40">{eq.entregou_ecd}</td>
                            <td className="px-4 py-2 text-right text-red-600 font-semibold bg-violet-50/40">{eq.falta_gerar_ecd}</td>
                            <td className="px-4 py-2 text-right text-amber-600 font-semibold bg-violet-50/40">{eq.gerada_nao_entregue_ecd}</td>
                          </>
                        )}
                        {(obrig === "ambas" || obrig === "ECF") && (
                          <>
                            <td className="px-4 py-2 text-right bg-sky-50/40">{eq.gerou_ecf}</td>
                            <td className="px-4 py-2 text-right bg-sky-50/40">{eq.entregou_ecf}</td>
                            <td className="px-4 py-2 text-right text-red-600 font-semibold bg-sky-50/40">{eq.falta_gerar_ecf}</td>
                            <td className="px-4 py-2 text-right text-amber-600 font-semibold bg-sky-50/40">{eq.gerada_nao_entregue_ecf}</td>
                          </>
                        )}
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded">
                              <div className="h-full rounded" style={{ width: `${pct}%`, background: pct >= 90 ? "#00BF63" : pct >= 60 ? "#FA6914" : "#EF4444" }} />
                            </div>
                            <span className="tabular-nums">{pct}%</span>
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

        {d && tab === "faltam" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex flex-col gap-3">
              <div className="flex gap-1 flex-wrap items-center">
                {([
                  ["faltam_gerar", `Falta gerar · ${countFalta}`],
                  ["gerada_nao_entregue", `Gerada não entregue · ${countGerNE}`],
                ] as [FaltaTab, string][]).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setFaltaTab(k)}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-md border ${
                      faltaTab === k ? "bg-charcoal text-white border-charcoal" : "border-border text-muted-foreground hover:text-charcoal"
                    }`}
                  >
                    {l}
                  </button>
                ))}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Obrigação: <strong className="text-charcoal">{obrig === "ambas" ? "Ambas (ECD+ECF)" : obrig}</strong>
                </span>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[12px] text-muted-foreground">
                  Mostrando <strong className="text-charcoal">{faltamFiltradas.length.toLocaleString("pt-BR")}</strong> empresa(s)
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={filtroEquipe}
                    onChange={(e) => setFiltroEquipe(e.target.value)}
                    className="text-[11px] border border-border rounded-md px-2 py-1 bg-white"
                  >
                    <option value="">Todas as equipes</option>
                    {d.equipes.map((eq) => (
                      <option key={eq.equipe} value={eq.equipe}>
                        {eq.equipe} ({faltaTab === "faltam_gerar" ? equipeFaltaGerar(eq) : equipeGerNE(eq)})
                      </option>
                    ))}
                  </select>
                  <button
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                    onClick={() =>
                      exportToXlsx(`entregas-contabil-${obrig}-${faltaTab}.xlsx`, [
                        {
                          name: faltaTab === "faltam_gerar" ? "Falta gerar" : "Gerada não entregue",
                          rows: faltamFiltradas.map((e) => ({
                            CNPJ: formatCnpj(e.cnpj),
                            "Razão Social": e.razao ?? "",
                            Regime: e.regime ?? "",
                            Grupo: e.grupo ?? "",
                            Obrigação: obrig,
                            "ECD gerada": e.ecd_gerado ? "Sim" : "Não",
                            "ECD entregue": e.ecd_entregue ? "Sim" : "Não",
                            "ECF gerada": e.ecf_gerado ? "Sim" : "Não",
                            "ECF entregue": e.ecf_entregue ? "Sim" : "Não",
                            Equipes: (e.tags ?? []).join(" | "),
                          })),
                        },
                      ])
                    }
                  >
                    <Download size={12} /> Exportar XLSX
                  </button>
                </div>
              </div>
            </div>
            <div className="max-h-[calc(100vh-340px)] overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">CNPJ</th>
                    <th className="text-left px-4 py-2">Razão Social</th>
                    <th className="text-left px-4 py-2">Regime</th>
                    <th className="text-center px-4 py-2">ECD gerada</th>
                    <th className="text-center px-4 py-2">ECD entregue</th>
                    <th className="text-center px-4 py-2">ECF gerada</th>
                    <th className="text-center px-4 py-2">ECF entregue</th>
                    <th className="text-left px-4 py-2">Equipes</th>
                  </tr>
                </thead>
                <tbody>
                  {faltamFiltradas.slice(0, 1000).map((e) => (
                    <tr key={e.cnpj} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">{formatCnpj(e.cnpj)}</td>
                      <td className="px-4 py-2">{e.razao}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.regime ?? <em className="text-amber-700">Regime tributário não definido</em>}</td>
                      <td className="px-4 py-2 text-center">{e.ecd_gerado ? <CheckCircle2 size={14} className="inline text-emerald-600" /> : <XCircle size={14} className="inline text-red-500" />}</td>
                      <td className="px-4 py-2 text-center">{e.ecd_entregue ? <CheckCircle2 size={14} className="inline text-emerald-600" /> : <XCircle size={14} className="inline text-red-500" />}</td>
                      <td className="px-4 py-2 text-center">{e.ecf_gerado ? <CheckCircle2 size={14} className="inline text-emerald-600" /> : <XCircle size={14} className="inline text-red-500" />}</td>
                      <td className="px-4 py-2 text-center">{e.ecf_entregue ? <CheckCircle2 size={14} className="inline text-emerald-600" /> : <XCircle size={14} className="inline text-red-500" />}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(e.tags ?? []).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-charcoal">{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {faltamFiltradas.length > 1000 && (
                    <tr><td colSpan={8} className="px-4 py-3 text-center text-muted-foreground text-[11px]">Mostrando 1000 de {faltamFiltradas.length}. Exporte o XLSX pra ver tudo.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {d && tab === "radar" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
              <div className="text-[13px] font-bold flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600" />
                Radar · entregas <span className="text-amber-700">justificadas</span> · {d.radar_justificadas.length}
                <span className="text-[10px] font-normal text-muted-foreground ml-2">
                  ECD: {d.ecd_justificadas} · ECF: {d.ecf_justificadas}
                </span>
              </div>
              <button
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                onClick={() =>
                  exportToXlsx("entregas-radar-justificadas.xlsx", [
                    {
                      name: "Justificadas",
                      rows: d.radar_justificadas.map((e) => ({
                        CNPJ: formatCnpj(e.cnpj),
                        "Razão Social": e.razao ?? "",
                        Regime: e.regime ?? "",
                        Grupo: e.grupo ?? "",
                        "ECD justificada": e.ecd_justificada ? "Sim" : "",
                        "ECD status": e.ecd_status ?? "",
                        "ECF justificada": e.ecf_justificada ? "Sim" : "",
                        "ECF status": e.ecf_status ?? "",
                        Equipes: (e.tags ?? []).join(" | "),
                      })),
                    },
                  ])
                }
              >
                <Download size={12} /> Exportar XLSX
              </button>
            </div>
            <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border bg-amber-50/40">
              Contam como <strong>entregue</strong> nos indicadores (Atraso justificado / Pend. justificada), mas precisam de acompanhamento.
            </div>
            <div className="max-h-[calc(100vh-340px)] overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">CNPJ</th>
                    <th className="text-left px-4 py-2">Razão Social</th>
                    <th className="text-left px-4 py-2">Regime</th>
                    <th className="text-left px-4 py-2">ECD status</th>
                    <th className="text-left px-4 py-2">ECF status</th>
                    <th className="text-left px-4 py-2">Equipes</th>
                  </tr>
                </thead>
                <tbody>
                  {d.radar_justificadas.map((e) => (
                    <tr key={e.cnpj} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">{formatCnpj(e.cnpj)}</td>
                      <td className="px-4 py-2">{e.razao}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.regime ?? <em className="text-amber-700">Não definido</em>}</td>
                      <td className="px-4 py-2">
                        {e.ecd_justificada ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">{e.ecd_status}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {e.ecf_justificada ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">{e.ecf_status}</span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(e.tags ?? []).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-charcoal">{t}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {d.radar_justificadas.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-[12px]">Nenhuma entrega justificada no momento.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {d && tab === "alertas" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-[13px] font-bold flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  Empresas com TAG Contábil <span className="text-amber-700">sem regime cadastrado</span> · {d.sem_regime_contabil.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("entregas-sem-regime.xlsx", [
                      {
                        name: "Sem regime",
                        rows: d.sem_regime_contabil.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          "Razão": r.razao ?? "",
                          Grupo: r.grupo ?? "",
                          Equipes: (r.tags ?? []).join(" | "),
                        })),
                      },
                    ])
                  }
                >
                  <Download size={12} /> Exportar
                </button>
              </div>
              <div className="max-h-[35vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">CNPJ</th>
                      <th className="text-left px-4 py-2">Razão</th>
                      <th className="text-left px-4 py-2">Grupo</th>
                      <th className="text-left px-4 py-2">Equipes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.sem_regime_contabil.map((r) => (
                      <tr key={r.cnpj} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.grupo}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(r.tags ?? []).map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{t}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-[13px] font-bold flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  No S3D mas <span className="text-amber-700">regime não obriga ECD/ECF</span> no Acessórias · {d.fora_regime.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("entregas-fora-regime.xlsx", [
                      {
                        name: "Fora LR/LP",
                        rows: d.fora_regime.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          Razão: r.razao ?? "",
                          Obrigação: r.obrigacao,
                          Status: r.status ?? "",
                          "Regime Acessórias": r.regime_acessorias ?? "",
                          Equipes: (r.tags ?? []).join(" | "),
                        })),
                      },
                    ])
                  }
                >
                  <Download size={12} /> Exportar
                </button>
              </div>
              <div className="max-h-[35vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">CNPJ</th>
                      <th className="text-left px-4 py-2">Razão</th>
                      <th className="text-left px-4 py-2">Obrig.</th>
                      <th className="text-left px-4 py-2">Regime Acessórias</th>
                      <th className="text-left px-4 py-2">Equipes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fora_regime.map((r, i) => (
                      <tr key={r.cnpj + r.obrigacao + i} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 font-semibold">{r.obrigacao}</td>
                        <td className="px-4 py-2 text-amber-700">{r.regime_acessorias ?? <em>Regime tributário não definido</em>}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(r.tags ?? []).map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{t}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-[13px] font-bold flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  No S3D mas <span className="text-amber-700">sem TAG Contábil</span> no Acessórias · {d.sem_tag_contabil.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("entregas-sem-tag-contabil.xlsx", [
                      {
                        name: "Sem TAG Contábil",
                        rows: d.sem_tag_contabil.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          Razão: r.razao ?? "",
                          Obrigação: r.obrigacao,
                          Status: r.status ?? "",
                          "Regime Acessórias": r.regime_acessorias ?? "Regime tributário não definido",
                          Equipes: (r.tags ?? []).join(" | "),
                        })),
                      },
                    ])
                  }
                >
                  <Download size={12} /> Exportar
                </button>
              </div>
              <div className="max-h-[35vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">CNPJ</th>
                      <th className="text-left px-4 py-2">Razão</th>
                      <th className="text-left px-4 py-2">Obrig.</th>
                      <th className="text-left px-4 py-2">Regime</th>
                      <th className="text-left px-4 py-2">Equipes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.sem_tag_contabil.map((r, i) => (
                      <tr key={r.cnpj + r.obrigacao + i} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 font-semibold">{r.obrigacao}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.regime_acessorias ?? <em className="text-amber-700">Regime tributário não definido</em>}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(r.tags ?? []).map((t) => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{t}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">

              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-[13px] font-bold flex items-center gap-2">
                  <XCircle size={14} className="text-red-600" />
                  No S3D mas <span className="text-red-700">não existe</span> na base do Acessórias · {d.fora_da_base.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("entregas-fora-da-base.xlsx", [
                      {
                        name: "Fora da base",
                        rows: d.fora_da_base.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          Razão: r.razao ?? "",
                          Obrigação: r.obrigacao,
                          Status: r.status ?? "",
                          Competência: r.competencia ?? "",
                        })),
                      },
                    ])
                  }
                >
                  <Download size={12} /> Exportar
                </button>
              </div>
              <div className="max-h-[35vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">CNPJ</th>
                      <th className="text-left px-4 py-2">Razão</th>
                      <th className="text-left px-4 py-2">Obrig.</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Compet.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fora_da_base.map((r, i) => (
                      <tr key={r.cnpj + r.obrigacao + i} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 font-semibold">{r.obrigacao}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.status}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.competencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div className="bg-card border border-border rounded-xl p-6 max-w-2xl">
            <h2 className="text-[14px] font-bold text-charcoal mb-1">Atualizar entregas do S3D</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Suba o CSV/XLSX exportado do S3D (Gestão de Entregas). O sistema lê as colunas <strong>CNPJ</strong>, <strong>Obrigação / Tarefa</strong>, <strong>Status</strong> e <strong>Competência</strong>. O upload substitui toda a base anterior.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadM.mutate(f);
              }}
              className="hidden"
            />
            <button
              disabled={uploadM.isPending}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 bg-charcoal text-white text-[12px] font-semibold px-4 py-2 rounded-md disabled:opacity-50"
            >
              {uploadM.isPending ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
              {uploadM.isPending ? "Importando…" : "Escolher arquivo do S3D"}
            </button>
            {uploadM.isSuccess && (
              <div className="mt-3 text-[12px] text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Importado: {uploadM.data} entregas. A análise foi recalculada.
              </div>
            )}
            {uploadM.error && (
              <div className="mt-3 text-[12px] text-destructive">{(uploadM.error as Error).message}</div>
            )}
          </div>
        )}
      </div>
    </HubShell>
  );
}
