import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import {
  gerarAnalise,
  importSittaxFile,
  exportToXlsx,
  formatCnpj,
  type AnaliseSittax,
} from "@/lib/sittax-sn";
import { ChevronLeft, Upload, Download, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

export const Route = createFileRoute("/processo/sittax-sn")({
  head: () => ({ meta: [{ title: "Sittax SN x Acessórias — Planning Hub" }] }),
  component: SittaxSnPage,
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

function SittaxSnPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"visao" | "equipes" | "faltam" | "alertas" | "upload">("visao");
  const fileRef = useRef<HTMLInputElement>(null);
  const [filtroEquipe, setFiltroEquipe] = useState<string>("");

  const analiseQ = useQuery<AnaliseSittax>({ queryKey: ["sittax-sn-analise"], queryFn: gerarAnalise });

  const uploadM = useMutation({
    mutationFn: (f: File) => importSittaxFile(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sittax-sn-analise"] });
    },
  });

  const d = analiseQ.data;
  const faltamFiltradas = d
    ? filtroEquipe
      ? d.faltam_lista.filter((e) => (e.tags ?? []).includes(filtroEquipe))
      : d.faltam_lista
    : [];

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
              sittax-sn
            </span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">Sittax SN x Acessórias</h1>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {d?.competencia ? `Base Acessórias: ${String(d.competencia).slice(5, 7)}/${String(d.competencia).slice(0, 4)}` : "Base mensal não importada"}
          </div>
        </div>

        <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
          {[
            ["visao", "Visão geral"],
            ["equipes", "Por equipe"],
            ["faltam", "Faltam cadastrar"],
            ["alertas", "Alertas"],
            ["upload", "Atualizar base Sittax"],
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

        {analiseQ.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
            <Loader2 className="animate-spin" size={14} /> Carregando análise…
          </div>
        )}
        {analiseQ.error && <div className="text-destructive text-[13px]">{(analiseQ.error as Error).message}</div>}

        {d && tab === "visao" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <Card label="Base Acessórias" value={d.total_acessorias} hint="empresas no mês ativo" />
              <Card label="SN no Acessórias" value={d.total_sn_acessorias} color="#7C3AED" />
              <Card label="Cadastros Sittax" value={d.total_sittax} color="#14C8FA" />
              <Card label="Cadastrados ✓" value={d.cadastrados} color="#00BF63" />
              <Card label="Faltam cadastrar" value={d.faltam_cadastrar} color="#EF4444" />
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-[14px] font-bold text-charcoal mb-2">Como ler esse painel</h2>
              <ul className="text-[12px] text-muted-foreground space-y-1 list-disc pl-5">
                <li>Compara a base do mês ativo do Acessórias (regimes <strong>Simples Nacional</strong> e <strong>MEI</strong>) com os CNPJs cadastrados no <strong>Sittax SN</strong>.</li>
                <li>O bloco <strong>Por equipe</strong> mostra quantas faltam em cada TAG (equipes <em>CC</em> e <em>Planning RJ</em> são ignoradas, igual no painel de Certificados).</li>
                <li><strong>Alertas</strong> traz CNPJs do Sittax que não são SN no Acessórias ou nem aparecem na base.</li>
                <li>Para atualizar a base, vá em <strong>Atualizar base Sittax</strong> e suba a planilha exportada do Sittax.</li>
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
                onClick={() =>
                  exportToXlsx("sittax-sn-equipes.xlsx", [
                    { name: "Equipes", rows: d.equipes },
                  ])
                }
              >
                <Download size={12} /> Exportar XLSX
              </button>
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Equipe</th>
                  <th className="text-right px-4 py-2">Total SN</th>
                  <th className="text-right px-4 py-2">Cadastrados</th>
                  <th className="text-right px-4 py-2">Faltam</th>
                  <th className="text-right px-4 py-2">% concluído</th>
                </tr>
              </thead>
              <tbody>
                {d.equipes.map((eq) => {
                  const pct = eq.total_sn ? Math.round((eq.cadastrados / eq.total_sn) * 100) : 0;
                  return (
                    <tr key={eq.equipe} className="border-t border-border">
                      <td className="px-4 py-2 font-semibold text-charcoal">{eq.equipe}</td>
                      <td className="px-4 py-2 text-right">{eq.total_sn}</td>
                      <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{eq.cadastrados}</td>
                      <td className="px-4 py-2 text-right text-red-600 font-semibold">{eq.faltam}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-muted rounded">
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
        )}

        {d && tab === "faltam" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
              <div className="text-[13px] font-bold">
                Empresas SN do Acessórias <span className="text-muted-foreground font-normal">sem cadastro no Sittax</span> · {faltamFiltradas.length.toLocaleString("pt-BR")}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={filtroEquipe}
                  onChange={(e) => setFiltroEquipe(e.target.value)}
                  className="text-[11px] border border-border rounded-md px-2 py-1 bg-white"
                >
                  <option value="">Todas as equipes</option>
                  {d.equipes.map((eq) => (
                    <option key={eq.equipe} value={eq.equipe}>{eq.equipe} ({eq.faltam})</option>
                  ))}
                </select>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("sittax-sn-faltam.xlsx", [
                      {
                        name: "Faltam",
                        rows: faltamFiltradas.map((e) => ({
                          CNPJ: formatCnpj(e.cnpj),
                          "Razão Social": e.razao ?? "",
                          Regime: e.regime ?? "",
                          Grupo: e.grupo ?? "",
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
            <div className="max-h-[calc(100vh-280px)] overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">CNPJ</th>
                    <th className="text-left px-4 py-2">Razão Social</th>
                    <th className="text-left px-4 py-2">Regime</th>
                    <th className="text-left px-4 py-2">Grupo</th>
                    <th className="text-left px-4 py-2">Equipes</th>
                  </tr>
                </thead>
                <tbody>
                  {faltamFiltradas.slice(0, 1000).map((e) => (
                    <tr key={e.cnpj} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">{formatCnpj(e.cnpj)}</td>
                      <td className="px-4 py-2">{e.razao}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.regime}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.grupo}</td>
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
                    <tr><td colSpan={5} className="px-4 py-3 text-center text-muted-foreground text-[11px]">Mostrando 1000 de {faltamFiltradas.length}. Exporte o XLSX pra ver tudo.</td></tr>
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
                  No Sittax mas <span className="text-amber-700">não é SN</span> no Acessórias · {d.fora_regime.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("sittax-fora-regime.xlsx", [
                      {
                        name: "Fora do SN",
                        rows: d.fora_regime.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          "Razão (Sittax)": r.razao ?? "",
                          "Regime no Acessórias": r.regime_acessorias ?? "",
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
              <div className="max-h-[40vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">CNPJ</th>
                      <th className="text-left px-4 py-2">Razão</th>
                      <th className="text-left px-4 py-2">Regime no Acessórias</th>
                      <th className="text-left px-4 py-2">Equipes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fora_regime.map((r) => (
                      <tr key={r.cnpj} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 text-amber-700 font-semibold">{r.regime_acessorias}</td>
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
                  No Sittax mas <span className="text-red-700">não existe</span> na base do Acessórias · {d.fora_da_base.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("sittax-fora-da-base.xlsx", [
                      {
                        name: "Fora da base",
                        rows: d.fora_da_base.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          Razão: r.razao ?? "",
                          Apelido: r.apelido ?? "",
                          UF: r.uf ?? "",
                          Cidade: r.cidade ?? "",
                        })),
                      },
                    ])
                  }
                >
                  <Download size={12} /> Exportar
                </button>
              </div>
              <div className="max-h-[40vh] overflow-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">CNPJ</th>
                      <th className="text-left px-4 py-2">Razão</th>
                      <th className="text-left px-4 py-2">Apelido</th>
                      <th className="text-left px-4 py-2">UF</th>
                      <th className="text-left px-4 py-2">Cidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fora_da_base.map((r) => (
                      <tr key={r.cnpj} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.apelido}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.uf}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.cidade}</td>
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
            <h2 className="text-[14px] font-bold text-charcoal mb-1">Atualizar base do Sittax SN</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Suba a planilha exportada do Sittax. A primeira coluna deve ser o CNPJ. O upload substitui toda a base anterior.
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
              {uploadM.isPending ? "Importando…" : "Escolher planilha do Sittax"}
            </button>
            {uploadM.isSuccess && (
              <div className="mt-3 text-[12px] text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Importado: {uploadM.data} CNPJs. A análise foi recalculada.
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
