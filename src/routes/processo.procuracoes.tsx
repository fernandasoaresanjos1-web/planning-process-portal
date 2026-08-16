import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import {
  gerarAnalise,
  importProcuracoesFile,
  exportToXlsx,
  formatCnpj,
  type AnaliseProcuracoes,
} from "@/lib/procuracoes";
import { ChevronLeft, Upload, Download, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/processo/procuracoes")({
  head: () => ({ meta: [{ title: "Procurações x Acessórias — Planning Hub" }] }),
  component: ProcuracoesPage,
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

function fmtDate(v: string | null) {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function ProcuracoesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"visao" | "equipes" | "empresas" | "alertas" | "upload">("visao");
  const [filtroEquipe, setFiltroEquipe] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todas" | "com" | "sem">("todas");
  const [filtroTipo, setFiltroTipo] = useState<"todas" | "matriz" | "filial">("todas");
  const fileRef = useRef<HTMLInputElement>(null);

  const analiseQ = useQuery<AnaliseProcuracoes>({ queryKey: ["procuracoes-analise"], queryFn: gerarAnalise });

  const uploadM = useMutation({
    mutationFn: (f: File) => importProcuracoesFile(f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["procuracoes-analise"] }),
  });

  const d = analiseQ.data;

  const isMatriz = (cnpj: string) => cnpj.slice(8, 12) === "0001";

  const empresasFiltradas = useMemo(() => {
    if (!d) return [];
    return d.empresas.filter((e) => {
      if (filtroEquipe && !(e.tags ?? []).includes(filtroEquipe)) return false;
      if (filtroStatus === "com" && !e.tem_procuracao) return false;
      if (filtroStatus === "sem" && e.tem_procuracao) return false;
      if (filtroTipo === "matriz" && !isMatriz(e.cnpj)) return false;
      if (filtroTipo === "filial" && isMatriz(e.cnpj)) return false;
      return true;
    });
  }, [d, filtroEquipe, filtroStatus, filtroTipo]);

  const pctCom = d && d.total_fiscal > 0 ? Math.round((d.com_procuracao / d.total_fiscal) * 100) : 0;

  return (
    <HubShell>
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/processos" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
              <ChevronLeft size={13} /> Processos
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: "#F59E0B22", color: "#F59E0B" }}>
              procuracoes
            </span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">Procurações x Acessórias</h1>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {d?.competencia
              ? `Base Acessórias: ${String(d.competencia).slice(5, 7)}/${String(d.competencia).slice(0, 4)}`
              : "Base mensal não importada"}
          </div>
        </div>

        <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
          {[
            ["visao", "Visão geral"],
            ["equipes", "Por equipe"],
            ["empresas", "Empresas"],
            ["alertas", "Fora da base"],
            ["upload", "Atualizar procurações"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={`px-4 py-2 text-[12px] font-semibold border-b-2 -mb-px ${
                tab === k ? "border-charcoal text-charcoal" : "border-transparent text-muted-foreground hover:text-charcoal"
              }`}
            >
              {l}
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <Card label="Empresas (Acessórias)" value={d.total_fiscal} hint="Toda a base ativa" />
              <Card label="Com Procuração" value={d.com_procuracao} color="#16a34a" hint={`${pctCom}% da base`} />
              <Card label="Sem Procuração" value={d.sem_procuracao} color="#dc2626" />
              <Card label="Total Procurações" value={d.total_procuracoes} />
              <Card label="Fora da base" value={d.fora_da_base.length} color="#F59E0B" hint="Procurações sem empresa" />
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-[12px] font-bold text-charcoal mb-2">Cobertura</div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${pctCom}%` }} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {d.com_procuracao.toLocaleString("pt-BR")} de {d.total_fiscal.toLocaleString("pt-BR")} empresas possuem procuração.
              </div>
            </div>
          </>
        )}

        {d && tab === "equipes" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/50 text-charcoal">
                <tr>
                  <th className="text-left px-3 py-2">Equipe</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2 text-emerald-700">Com procuração</th>
                  <th className="text-right px-3 py-2 text-rose-700">Sem procuração</th>
                  <th className="text-right px-3 py-2">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {d.equipes.map((eq) => {
                  const pct = eq.total > 0 ? Math.round((eq.com / eq.total) * 100) : 0;
                  return (
                    <tr key={eq.equipe} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{eq.equipe}</td>
                      <td className="px-3 py-2 text-right">{eq.total.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{eq.com.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{eq.sem.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right">{pct}%</td>
                    </tr>
                  );
                })}
                {d.equipes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma equipe encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {d && tab === "empresas" && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <select
                value={filtroEquipe}
                onChange={(e) => setFiltroEquipe(e.target.value)}
                className="px-3 py-1.5 text-[12px] border border-border rounded-md bg-card"
              >
                <option value="">Todas as equipes</option>
                {d.equipes.map((eq) => (
                  <option key={eq.equipe} value={eq.equipe}>{eq.equipe}</option>
                ))}
              </select>
              <div className="flex gap-1">
                {(["todas", "com", "sem"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFiltroStatus(s)}
                    className={`px-3 py-1.5 text-[12px] rounded-md ${filtroStatus === s ? "bg-charcoal text-white" : "bg-muted text-charcoal hover:bg-muted/70"}`}
                  >
                    {s === "todas" ? "Todas" : s === "com" ? "Com procuração" : "Sem procuração"}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["todas", "matriz", "filial"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFiltroTipo(s)}
                    className={`px-3 py-1.5 text-[12px] rounded-md ${filtroTipo === s ? "bg-charcoal text-white" : "bg-muted text-charcoal hover:bg-muted/70"}`}
                  >
                    {s === "todas" ? "Matriz + Filial" : s === "matriz" ? "Só matriz" : "Só filial"}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground ml-auto">{empresasFiltradas.length.toLocaleString("pt-BR")} empresas</div>
              <button
                onClick={() =>
                  exportToXlsx("procuracoes-empresas.xlsx", [
                    {
                      name: "Empresas",
                      rows: empresasFiltradas.map((e) => ({
                        CNPJ: formatCnpj(e.cnpj),
                        Tipo: isMatriz(e.cnpj) ? "Matriz" : "Filial",
                        Razao: e.razao,
                        Regime: e.regime,
                        Grupo: e.grupo,
                        Equipes: (e.tags ?? []).join(", "),
                        Procuracao: e.tem_procuracao ? "Sim" : "Não",
                        Validade: fmtDate(e.validade),
                        Situacao: e.situacao,
                        Certificado: e.certificado,
                      })),
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] rounded-md bg-charcoal text-white hover:bg-charcoal/90"
              >
                <Download size={13} /> Exportar
              </button>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/50 text-charcoal sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 w-10"></th>
                    <th className="text-left px-3 py-2">CNPJ</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Razão</th>
                    <th className="text-left px-3 py-2">Equipes</th>
                    <th className="text-left px-3 py-2">Regime</th>
                    <th className="text-left px-3 py-2">Validade</th>
                    <th className="text-left px-3 py-2">Situação</th>
                    <th className="text-left px-3 py-2">Procurador</th>
                  </tr>
                </thead>
                <tbody>
                  {empresasFiltradas.slice(0, 2000).map((e) => {
                    const matriz = isMatriz(e.cnpj);
                    const procurador = (e.certificado ?? "").split(/\s*-\s*CNPJ:/i)[0].trim() || null;
                    return (
                      <tr key={e.cnpj} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-1.5">
                          {e.tem_procuracao ? (
                            <CheckCircle2 size={14} className="text-emerald-600" />
                          ) : (
                            <XCircle size={14} className="text-rose-600" />
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{formatCnpj(e.cnpj)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${matriz ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                            {matriz ? "Matriz" : "Filial"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">{e.razao ?? "—"}</td>
                        <td className="px-3 py-1.5 text-[11px] text-muted-foreground">{(e.tags ?? []).join(", ")}</td>
                        <td className="px-3 py-1.5 text-[11px]">{e.regime ?? "—"}</td>
                        <td className="px-3 py-1.5">{fmtDate(e.validade)}</td>
                        <td className="px-3 py-1.5">{e.situacao ?? "—"}</td>
                        <td className="px-3 py-1.5 text-[11px]" title={e.certificado ?? ""}>{procurador ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {empresasFiltradas.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Nenhuma empresa.</td></tr>
                  )}
                </tbody>
              </table>
              {empresasFiltradas.length > 2000 && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
                  Exibindo 2.000 primeiras. Use os filtros ou exporte para ver todas.
                </div>
              )}
            </div>
          </>
        )}

        {d && tab === "alertas" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-amber-50 text-amber-900 text-[12px] flex items-center gap-2">
              <AlertTriangle size={14} /> Procurações cujo CNPJ não está na base ativa de Acessórias.
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-muted/50 text-charcoal">
                <tr>
                  <th className="text-left px-3 py-2">CNPJ</th>
                  <th className="text-left px-3 py-2">Razão</th>
                  <th className="text-left px-3 py-2">Validade</th>
                  <th className="text-left px-3 py-2">Situação</th>
                  <th className="text-left px-3 py-2">Certificado</th>
                </tr>
              </thead>
              <tbody>
                {d.fora_da_base.map((p) => (
                  <tr key={p.cnpj} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono">{formatCnpj(p.cnpj)}</td>
                    <td className="px-3 py-1.5">{p.razao ?? "—"}</td>
                    <td className="px-3 py-1.5">{fmtDate(p.validade)}</td>
                    <td className="px-3 py-1.5">{p.situacao ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px]">{p.certificado ?? "—"}</td>
                  </tr>
                ))}
                {d.fora_da_base.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma procuração fora da base.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "upload" && (
          <div className="bg-card border border-border rounded-xl p-6 max-w-2xl">
            <h2 className="text-[14px] font-bold text-charcoal mb-1">Atualizar base de procurações</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Envie a planilha exportada com colunas: Razão Social, CPF/CNPJ, Validade, Situação, Certificado. A base é substituída a cada upload.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadM.mutate(f);
                e.currentTarget.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadM.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-charcoal text-white text-[13px] font-semibold hover:bg-charcoal/90 disabled:opacity-60"
            >
              {uploadM.isPending ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
              {uploadM.isPending ? "Enviando…" : "Selecionar planilha"}
            </button>
            {uploadM.isSuccess && (
              <div className="mt-3 text-[12px] text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 size={14} /> {uploadM.data} procurações importadas.
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
