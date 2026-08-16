import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import {
  gerarAnaliseSaam,
  importSaamFile,
  exportToXlsx,
  formatCnpj,
  listSaamBases,
  salvarSaamBase,
  type AnaliseSaam,
  type SaamBase,
} from "@/lib/saam";
import { ChevronLeft, Upload, Download, AlertTriangle, CheckCircle2, XCircle, Loader2, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/processo/saam")({
  head: () => ({ meta: [{ title: "Acessórias x SAAM — Planning Hub" }] }),
  component: SaamPage,
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

function SaamPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"visao" | "capacidade" | "equipes" | "faltam" | "alertas" | "upload">("visao");
  const fileRef = useRef<HTMLInputElement>(null);
  const [filtroEquipe, setFiltroEquipe] = useState<string>("");
  const [baseSel, setBaseSel] = useState<string>("260");
  const [qtds, setQtds] = useState<Record<string, string>>({});

  const analiseQ = useQuery<AnaliseSaam>({ queryKey: ["saam-analise"], queryFn: gerarAnaliseSaam });
  const basesQ = useQuery<SaamBase[]>({ queryKey: ["saam-bases"], queryFn: listSaamBases });

  useEffect(() => {
    if (basesQ.data) {
      setQtds(Object.fromEntries(basesQ.data.map((b) => [b.base, String(b.quantidade_contratada)])));
    }
  }, [basesQ.data]);

  const saveBaseM = useMutation({
    mutationFn: (b: SaamBase) => salvarSaamBase(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saam-bases"] });
      qc.invalidateQueries({ queryKey: ["saam-analise"] });
    },
  });

  const uploadM = useMutation({
    mutationFn: (f: File) => importSaamFile(f, baseSel),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saam-analise"] }),
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
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: "#14B8A622", color: "#14B8A6" }}>
              saam
            </span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">Acessórias x SAAM</h1>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {d?.competencia ? `Base Acessórias: ${String(d.competencia).slice(5, 7)}/${String(d.competencia).slice(0, 4)}` : "Base mensal não importada"}
          </div>
        </div>

        <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
          {[
            ["visao", "Visão geral"],
            ["capacidade", "Capacidade das bases"],
            ["equipes", "Por equipe"],
            ["faltam", "Faltam cadastrar"],
            ["alertas", "Alertas"],
            ["upload", "Atualizar base SAAM"],
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
              <Card label="LR + LP (Fiscal)" value={d.total_lr_lp_acessorias} color="#14B8A6" hint="matriz + filiais · TAG fiscal" />
              <Card label="Cadastros SAAM" value={d.total_saam} color="#14C8FA" />
              <Card label="Cadastrados ✓" value={d.cadastrados} color="#00BF63" />
              <Card label="Faltam cadastrar" value={d.faltam_cadastrar} color="#EF4444" />
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-[14px] font-bold text-charcoal mb-2">Como ler esse painel</h2>
              <ul className="text-[12px] text-muted-foreground space-y-1 list-disc pl-5">
                <li>Compara a base do mês ativo do Acessórias (regimes <strong>Lucro Real</strong> e <strong>Lucro Presumido</strong>, somente matriz) com os CNPJs cadastrados no <strong>SAAM</strong>.</li>
                <li>Considera apenas empresas com pelo menos uma <strong>TAG Fiscal</strong> elegível. Excluídas: Equipe CC, Canopus, Planning RJ, CX e FILIAL.</li>
                <li><strong>Alertas</strong> mostra CNPJs do SAAM que não são LR/LP no Acessórias ou que nem aparecem na base.</li>
                <li>Para atualizar a base, vá em <strong>Atualizar base SAAM</strong> e suba a planilha exportada do SAAM.</li>
              </ul>
            </div>
          </>
        )}

        {d && tab === "capacidade" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card label="Base contratada" value={d.capacidade.contratado_total} hint="soma das duas bases" />
              <Card label="Cadastrados hoje" value={d.capacidade.cadastrados_total} color="#14C8FA" />
              <Card label="A excluir" value={d.capacidade.a_excluir_total} color="#F59E0B" hint="fora de LR/LP ou fora da base" />
              <Card label="A incluir" value={d.capacidade.a_incluir_total} color="#EF4444" hint="LR/LP sem cadastro no SAAM" />
              <Card
                label="Sobra potencial"
                value={d.capacidade.sobra_potencial_total}
                color={d.capacidade.sobra_potencial_total >= 0 ? "#00BF63" : "#EF4444"}
                hint="após excluir e incluir"
              />
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-[13px] font-bold">
                Quantidade contratada por base <span className="font-normal text-muted-foreground">— preenchimento manual</span>
              </div>
              <table className="w-full text-[12px]">
                <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">Base</th>
                    <th className="text-right px-4 py-2">Contratado</th>
                    <th className="text-right px-4 py-2">Cadastrados</th>
                    <th className="text-right px-4 py-2">A excluir</th>
                    <th className="text-right px-4 py-2">Válidos</th>
                    <th className="text-right px-4 py-2">Sobra atual</th>
                    <th className="text-right px-4 py-2">Ocupação</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {d.capacidade.bases.map((b) => (
                    <tr key={b.base} className="border-t border-border">
                      <td className="px-4 py-2 font-semibold text-charcoal">
                        {b.base} <span className="text-muted-foreground font-normal">· {b.rotulo}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={qtds[b.base] ?? String(b.quantidade_contratada)}
                          onChange={(e) => setQtds((p) => ({ ...p, [b.base]: e.target.value }))}
                          className="w-24 text-right text-[12px] border border-border rounded-md px-2 py-1 bg-white"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.cadastrados.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-600 font-semibold">{b.a_excluir}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{b.validos.toLocaleString("pt-BR")}</td>
                      <td
                        className="px-4 py-2 text-right tabular-nums font-bold"
                        style={{ color: b.sobra_atual >= 0 ? "#00BF63" : "#EF4444" }}
                      >
                        {b.sobra_atual.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.quantidade_contratada ? `${b.ocupacao_pct}%` : "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          disabled={saveBaseM.isPending}
                          onClick={() =>
                            saveBaseM.mutate({
                              base: b.base,
                              rotulo: b.rotulo,
                              quantidade_contratada: Math.max(0, Number(qtds[b.base] ?? b.quantidade_contratada) || 0),
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1 hover:bg-secondary disabled:opacity-50"
                        >
                          <Save size={12} /> Salvar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 font-bold">
                  <tr className="border-t border-border">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.capacidade.contratado_total.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.capacidade.cadastrados_total.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-600">{d.capacidade.a_excluir_total}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{d.capacidade.validos_total.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: d.capacidade.sobra_atual_total >= 0 ? "#00BF63" : "#EF4444" }}>
                      {d.capacidade.sobra_atual_total.toLocaleString("pt-BR")}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-[14px] font-bold text-charcoal mb-2">Cruzamento e sobra potencial</h2>
              <ul className="text-[12px] text-muted-foreground space-y-1 list-disc pl-5">
                <li><strong>Cadastrados</strong>: CNPJs importados na base 260 (BPO) ou 491 (Consultoria).</li>
                <li><strong>A excluir</strong>: cadastros do SAAM que não são LR/LP no Acessórias ou que já saíram da base — detalhe na aba <strong>Alertas</strong>.</li>
                <li><strong>A incluir</strong>: empresas LR/LP com TAG fiscal ainda sem cadastro — lista na aba <strong>Faltam cadastrar</strong>.</li>
                <li>
                  <strong>Sobra potencial</strong> = contratado ({d.capacidade.contratado_total.toLocaleString("pt-BR")}) − válidos ({d.capacidade.validos_total.toLocaleString("pt-BR")}) − a incluir ({d.capacidade.a_incluir_total.toLocaleString("pt-BR")}) = <strong>{d.capacidade.sobra_potencial_total.toLocaleString("pt-BR")}</strong> vagas livres.
                </li>
              </ul>
              <button
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                onClick={() =>
                  exportToXlsx("saam-capacidade.xlsx", [
                    {
                      name: "Capacidade",
                      rows: d.capacidade.bases.map((b) => ({
                        Base: b.base,
                        Rótulo: b.rotulo,
                        Contratado: b.quantidade_contratada,
                        Cadastrados: b.cadastrados,
                        "A excluir": b.a_excluir,
                        Válidos: b.validos,
                        "Sobra atual": b.sobra_atual,
                        "Ocupação %": b.ocupacao_pct,
                      })),
                    },
                    {
                      name: "Resumo",
                      rows: [
                        {
                          Contratado: d.capacidade.contratado_total,
                          Cadastrados: d.capacidade.cadastrados_total,
                          "A excluir": d.capacidade.a_excluir_total,
                          "A incluir": d.capacidade.a_incluir_total,
                          Válidos: d.capacidade.validos_total,
                          "Sobra atual": d.capacidade.sobra_atual_total,
                          "Sobra potencial": d.capacidade.sobra_potencial_total,
                        },
                      ],
                    },
                  ])
                }
              >
                <Download size={12} /> Exportar capacidade
              </button>
            </div>
          </div>
        )}



        {d && tab === "equipes" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="text-[13px] font-bold">Indicador por equipe ({d.equipes.length})</div>
              <button
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                onClick={() => exportToXlsx("saam-equipes.xlsx", [{ name: "Equipes", rows: d.equipes }])}
              >
                <Download size={12} /> Exportar XLSX
              </button>
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Equipe</th>
                  <th className="text-right px-4 py-2">Total LR/LP</th>
                  <th className="text-right px-4 py-2">Cadastrados</th>
                  <th className="text-right px-4 py-2">Faltam</th>
                  <th className="text-right px-4 py-2">% concluído</th>
                </tr>
              </thead>
              <tbody>
                {d.equipes.map((eq) => {
                  const pct = eq.total ? Math.round((eq.cadastrados / eq.total) * 100) : 0;
                  return (
                    <tr key={eq.equipe} className="border-t border-border">
                      <td className="px-4 py-2 font-semibold text-charcoal">{eq.equipe}</td>
                      <td className="px-4 py-2 text-right">{eq.total}</td>
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
                Empresas LR/LP do Acessórias <span className="text-muted-foreground font-normal">sem cadastro no SAAM</span> · {faltamFiltradas.length.toLocaleString("pt-BR")}
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
                    exportToXlsx("saam-faltam.xlsx", [
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
                  No SAAM mas <span className="text-amber-700">não é LR/LP</span> no Acessórias · {d.fora_regime.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("saam-fora-regime.xlsx", [
                      {
                        name: "Fora de LR/LP",
                        rows: d.fora_regime.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          "Razão (SAAM)": r.razao ?? "",
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
                  No SAAM mas <span className="text-red-700">não existe</span> na base do Acessórias · {d.fora_da_base.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("saam-fora-da-base.xlsx", [
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

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-[13px] font-bold flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  Empresa cadastrada em <span className="text-amber-700">duas bases simultaneamente</span> · {d.duplicadas.length}
                </div>
                <button
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold border border-border rounded-md px-3 py-1.5 hover:bg-secondary"
                  onClick={() =>
                    exportToXlsx("saam-duplicadas.xlsx", [
                      {
                        name: "Duplicadas",
                        rows: d.duplicadas.map((r) => ({
                          CNPJ: formatCnpj(r.cnpj),
                          Razão: r.razao ?? "",
                          Bases: r.bases.join(" + "),
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
                      <th className="text-left px-4 py-2">Bases</th>
                      <th className="text-left px-4 py-2">UF</th>
                      <th className="text-left px-4 py-2">Cidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.duplicadas.length === 0 && (
                      <tr>
                        <td className="px-4 py-3 text-muted-foreground" colSpan={5}>
                          Nenhuma empresa duplicada entre as bases.
                        </td>
                      </tr>
                    )}
                    {d.duplicadas.map((r) => (
                      <tr key={r.cnpj} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">{formatCnpj(r.cnpj)}</td>
                        <td className="px-4 py-2">{r.razao}</td>
                        <td className="px-4 py-2 font-semibold text-amber-700">{r.bases.join(" + ")}</td>
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
            <h2 className="text-[14px] font-bold text-charcoal mb-1">Atualizar base do SAAM</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Escolha a base e suba a planilha exportada do SAAM. O sistema localiza a coluna <strong>CNPJ</strong> automaticamente. O upload substitui apenas os cadastros da base selecionada.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Base</span>
              <select
                value={baseSel}
                onChange={(e) => setBaseSel(e.target.value)}
                className="text-[12px] border border-border rounded-md px-2 py-1.5 bg-white"
              >
                {(basesQ.data ?? [{ base: "260", rotulo: "BPO", quantidade_contratada: 0 }, { base: "491", rotulo: "Consultoria", quantidade_contratada: 0 }]).map((b) => (
                  <option key={b.base} value={b.base}>{b.base} — {b.rotulo}</option>
                ))}
              </select>
            </div>
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
              {uploadM.isPending ? "Importando…" : `Escolher planilha da base ${baseSel}`}
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
