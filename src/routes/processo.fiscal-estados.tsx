import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { HubShell } from "@/components/HubShell";
import { supabase } from "@/integrations/supabase/client";
import { isTagFiscalElegivel } from "@/lib/sittax-sn";
import { ChevronLeft, Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/processo/fiscal-estados")({
  head: () => ({ meta: [{ title: "Fiscal por Estado — Planning Hub" }] }),
  component: FiscalEstadosPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

type EmpresaFiscal = {
  cnpj: string;
  razao: string | null;
  regime: string | null;
  grupo: string | null;
  uf: string;
  cidade: string | null;
  tags_fiscal: string[];
  tags: string[];
};

type AnaliseFiscal = {
  competencia: string | null;
  total: number;
  por_uf: { uf: string; total: number }[];
  por_regime_uf: Map<string, Map<string, number>>; // uf -> regime -> n
  por_equipe_uf: Map<string, Map<string, number>>; // uf -> equipe -> n
  empresas: EmpresaFiscal[];
};

function normalizeRegime(r: string | null): string {
  if (!r || !r.trim()) return "SEM REGIME";
  const t = r.trim();
  const low = t.toLowerCase();
  if (low.startsWith("simples")) return low.includes("mei") ? "MEI" : "Simples Nacional";
  if (low.startsWith("mei")) return "MEI";
  if (low.startsWith("lucro real")) return "Lucro Real";
  if (low.startsWith("lucro presumido")) return "Lucro Presumido";
  if (low.includes("imune")) return "Imune";
  if (low.includes("isenta")) return "Isenta";
  return t;
}

async function carregarFiscal(): Promise<AnaliseFiscal> {
  const { data: imp, error: ie } = await supabase
    .from("empresas_importacoes")
    .select("id,competencia")
    .eq("ativo", true)
    .order("competencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ie) throw ie;
  if (!imp) return { competencia: null, total: 0, por_uf: [], por_regime_uf: new Map(), por_equipe_uf: new Map(), empresas: [] };

  const empresas: EmpresaFiscal[] = [];
  let from = 0;
  const step = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("empresas_base_mensal")
      .select("cnpj,razao,regime,grupo,tags,dados")
      .eq("importacao_id", imp.id)
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = data ?? [];
    for (const r of chunk) {
      const tags = (r.tags ?? []) as string[];
      // Exclui empresa inteira se tiver TAG Planning RJ, CC ou Canopus (mesmo com outra TAG Fiscal)
      const temExcluida = tags.some((t) => {
        const s = String(t).toLowerCase();
        return s.includes("planning rj") || s.includes("planning-rj") || /\bcc\b/.test(s) || s.includes("canopus");
      });
      if (temExcluida) continue;
      const tags_fiscal = tags.filter(isTagFiscalElegivel);
      if (tags_fiscal.length === 0) continue;
      const dados = (r.dados ?? {}) as Record<string, unknown>;
      const uf = String(dados["UF"] ?? "").trim().toUpperCase() || "SEM UF";
      const cidade = String(dados["Cidade"] ?? "").trim() || null;
      empresas.push({
        cnpj: r.cnpj as string,
        razao: r.razao as string | null,
        regime: r.regime as string | null,
        grupo: r.grupo as string | null,
        uf,
        cidade,
        tags_fiscal,
        tags,
      });
    }
    if (chunk.length < step) break;
    from += step;
  }

  const ufMap = new Map<string, number>();
  const regUf = new Map<string, Map<string, number>>();
  const eqUf = new Map<string, Map<string, number>>();
  for (const e of empresas) {
    ufMap.set(e.uf, (ufMap.get(e.uf) ?? 0) + 1);
    const reg = normalizeRegime(e.regime);
    if (!regUf.has(e.uf)) regUf.set(e.uf, new Map());
    const rm = regUf.get(e.uf)!;
    rm.set(reg, (rm.get(reg) ?? 0) + 1);
    if (!eqUf.has(e.uf)) eqUf.set(e.uf, new Map());
    const em = eqUf.get(e.uf)!;
    for (const eq of e.tags_fiscal) em.set(eq, (em.get(eq) ?? 0) + 1);
  }
  const por_uf = Array.from(ufMap.entries()).map(([uf, total]) => ({ uf, total })).sort((a, b) => b.total - a.total);
  return { competencia: imp.competencia, total: empresas.length, por_uf, por_regime_uf: regUf, por_equipe_uf: eqUf, empresas };
}

function fmtCnpj(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function Card({ label, value, hint, color }: { label: string; value: number | string; hint?: string; color?: string }) {
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

function FiscalEstadosPage() {
  const [ufFiltro, setUfFiltro] = useState<string>("");
  const [equipeFiltro, setEquipeFiltro] = useState<string>("");
  const [regimeFiltro, setRegimeFiltro] = useState<string>("");
  const [municipioFiltro, setMunicipioFiltro] = useState<string>("");
  const [buscaMunicipio, setBuscaMunicipio] = useState<string>("");
  const [tab, setTab] = useState<"resumo" | "por-uf" | "municipios" | "empresas">("resumo");

  const q = useQuery<AnaliseFiscal>({ queryKey: ["fiscal-estados"], queryFn: carregarFiscal });
  const d = q.data;

  const equipesTotais = useMemo(() => {
    if (!d) return [] as { equipe: string; total: number }[];
    const m = new Map<string, number>();
    for (const e of d.empresas) for (const eq of e.tags_fiscal) m.set(eq, (m.get(eq) ?? 0) + 1);
    return Array.from(m.entries()).map(([equipe, total]) => ({ equipe, total })).sort((a, b) => b.total - a.total);
  }, [d]);

  const regimesTotais = useMemo(() => {
    if (!d) return [] as { regime: string; total: number }[];
    const m = new Map<string, number>();
    for (const e of d.empresas) {
      const r = normalizeRegime(e.regime);
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([regime, total]) => ({ regime, total })).sort((a, b) => b.total - a.total);
  }, [d]);

  const municipiosTotais = useMemo(() => {
    if (!d) return [] as { chave: string; municipio: string; uf: string; total: number }[];
    const m = new Map<string, { municipio: string; uf: string; total: number }>();
    for (const e of d.empresas) {
      const cid = (e.cidade ?? "").trim() || "SEM CIDADE";
      const key = `${cid}||${e.uf}`;
      const cur = m.get(key) ?? { municipio: cid, uf: e.uf, total: 0 };
      cur.total++;
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([chave, v]) => ({ chave, ...v })).sort((a, b) => b.total - a.total);
  }, [d]);

  const empresasFiltradas = useMemo(() => {
    if (!d) return [] as EmpresaFiscal[];
    return d.empresas.filter((e) => {
      if (ufFiltro && e.uf !== ufFiltro) return false;
      if (equipeFiltro && !e.tags_fiscal.includes(equipeFiltro)) return false;
      if (regimeFiltro && normalizeRegime(e.regime) !== regimeFiltro) return false;
      if (municipioFiltro) {
        const [cid, uf] = municipioFiltro.split("||");
        if ((e.cidade ?? "").trim() !== cid || e.uf !== uf) return false;
      }
      return true;
    });
  }, [d, ufFiltro, equipeFiltro, regimeFiltro, municipioFiltro]);


  const exportar = () => {
    if (!d) return;
    const wb = XLSX.utils.book_new();
    const resumoUF = d.por_uf.map((r) => ({ UF: r.uf, Empresas: r.total }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoUF), "Por UF");
    const resumoEq = equipesTotais.map((r) => ({ Equipe: r.equipe, Empresas: r.total }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoEq), "Por Equipe");
    const resumoReg = regimesTotais.map((r) => ({ Regime: r.regime, Empresas: r.total }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoReg), "Por Regime");
    const emp = empresasFiltradas.map((e) => ({
      CNPJ: fmtCnpj(e.cnpj), Razao: e.razao ?? "", UF: e.uf, Cidade: e.cidade ?? "",
      Regime: e.regime ?? "", Grupo: e.grupo ?? "", Equipes: e.tags_fiscal.join(" | "),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emp), "Empresas");
    XLSX.writeFile(wb, `fiscal_por_estado_${d.competencia ?? "atual"}.xlsx`);
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
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: "#F59E0B22", color: "#B45309" }}>
              fiscal-estados
            </span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">Fiscal por Estado</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-muted-foreground">
              {d?.competencia ? `Base: ${String(d.competencia).slice(5, 7)}/${String(d.competencia).slice(0, 4)}` : "Base mensal não importada"}
            </div>
            <button onClick={exportar} disabled={!d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-charcoal text-white text-[12px] font-semibold disabled:opacity-40">
              <Download size={13} /> Exportar
            </button>
          </div>
        </div>

        {q.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm p-6"><Loader2 className="animate-spin" size={16} /> Carregando base…</div>
        )}
        {q.error && <div className="text-destructive p-4">{(q.error as Error).message}</div>}

        {d && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card label="Empresas com TAG Fiscal" value={d.total} color="#B45309" />
              <Card label="Estados atendidos" value={d.por_uf.length} />
              <Card label="Equipes fiscais" value={equipesTotais.length} />
              <Card label="Regimes distintos" value={regimesTotais.length} />
            </div>

            <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
              {[
                ["resumo", "Resumo por UF"],
                ["por-uf", "Detalhe UF x Regime x Equipe"],
                ["municipios", `Por Município (${municipiosTotais.length})`],
                ["empresas", `Empresas (${empresasFiltradas.length})`],

              ].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k as typeof tab)}
                  className={`px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px ${tab === k ? "border-charcoal text-charcoal" : "border-transparent text-muted-foreground hover:text-charcoal"}`}>
                  {l}
                </button>
              ))}
            </div>

            {tab === "resumo" && (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Por estado</div>
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/40 sticky top-0"><tr><th className="text-left px-3 py-1.5">UF</th><th className="text-right px-3 py-1.5">Empresas</th><th className="text-right px-3 py-1.5">%</th></tr></thead>
                      <tbody>
                        {d.por_uf.map((r) => (
                          <tr key={r.uf} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => { setUfFiltro(r.uf); setTab("empresas"); }}>
                            <td className="px-3 py-1.5 font-semibold">{r.uf}</td>
                            <td className="px-3 py-1.5 text-right">{r.total.toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{d.total ? ((r.total / d.total) * 100).toFixed(1) : "0"}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Por equipe</div>
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/40 sticky top-0"><tr><th className="text-left px-3 py-1.5">Equipe</th><th className="text-right px-3 py-1.5">Empresas</th></tr></thead>
                      <tbody>
                        {equipesTotais.map((r) => (
                          <tr key={r.equipe} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => { setEquipeFiltro(r.equipe); setTab("empresas"); }}>
                            <td className="px-3 py-1.5">{r.equipe}</td>
                            <td className="px-3 py-1.5 text-right">{r.total.toLocaleString("pt-BR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Por regime tributário</div>
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/40 sticky top-0"><tr><th className="text-left px-3 py-1.5">Regime</th><th className="text-right px-3 py-1.5">Empresas</th></tr></thead>
                      <tbody>
                        {regimesTotais.map((r) => (
                          <tr key={r.regime} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => { setRegimeFiltro(r.regime); setTab("empresas"); }}>
                            <td className="px-3 py-1.5">{r.regime}</td>
                            <td className="px-3 py-1.5 text-right">{r.total.toLocaleString("pt-BR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {tab === "por-uf" && (
              <div className="space-y-3">
                {d.por_uf.map((u) => {
                  const regs = Array.from(d.por_regime_uf.get(u.uf)?.entries() ?? []).sort((a, b) => b[1] - a[1]);
                  const eqs = Array.from(d.por_equipe_uf.get(u.uf)?.entries() ?? []).sort((a, b) => b[1] - a[1]);
                  return (
                    <div key={u.uf} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center justify-center rounded-md bg-charcoal text-white text-[13px] font-bold w-10 h-8">{u.uf}</span>
                          <span className="text-[13px] font-semibold text-charcoal">{u.total.toLocaleString("pt-BR")} empresas</span>
                        </div>
                        <button onClick={() => { setUfFiltro(u.uf); setEquipeFiltro(""); setRegimeFiltro(""); setTab("empresas"); }} className="text-[11px] text-charcoal underline">ver empresas</button>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Regime</div>
                          <div className="space-y-1">
                            {regs.map(([r, n]) => (
                              <div key={r} className="flex items-center justify-between text-[12px]">
                                <span>{r}</span><span className="font-semibold">{n}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Equipe</div>
                          <div className="space-y-1">
                            {eqs.map(([e, n]) => (
                              <div key={e} className="flex items-center justify-between text-[12px]">
                                <span>{e}</span><span className="font-semibold">{n}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "municipios" && (
              <>
                <div className="flex flex-wrap gap-2 mb-3 items-center">
                  <input
                    value={buscaMunicipio}
                    onChange={(e) => setBuscaMunicipio(e.target.value)}
                    placeholder="Buscar município..."
                    className="text-[12px] border border-border rounded px-2 py-1 bg-card min-w-[220px]"
                  />
                  <select value={ufFiltro} onChange={(e) => setUfFiltro(e.target.value)} className="text-[12px] border border-border rounded px-2 py-1 bg-card">
                    <option value="">Todos os estados</option>
                    {d.por_uf.map((u) => <option key={u.uf} value={u.uf}>{u.uf} ({u.total})</option>)}
                  </select>
                  <div className="ml-auto text-[11px] text-muted-foreground">
                    {municipiosTotais.filter((m) => (!ufFiltro || m.uf === ufFiltro) && (!buscaMunicipio || m.municipio.toLowerCase().includes(buscaMunicipio.toLowerCase()))).length.toLocaleString("pt-BR")} municípios
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="max-h-[620px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5">Município</th>
                          <th className="text-left px-3 py-1.5 w-14">UF</th>
                          <th className="text-right px-3 py-1.5 w-24">Empresas</th>
                          <th className="text-right px-3 py-1.5 w-16">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {municipiosTotais
                          .filter((m) => (!ufFiltro || m.uf === ufFiltro) && (!buscaMunicipio || m.municipio.toLowerCase().includes(buscaMunicipio.toLowerCase())))
                          .map((m) => (
                            <tr
                              key={m.chave}
                              className="border-t border-border hover:bg-muted/30 cursor-pointer"
                              onClick={() => { setMunicipioFiltro(m.chave); setUfFiltro(m.uf); setEquipeFiltro(""); setRegimeFiltro(""); setTab("empresas"); }}
                            >
                              <td className="px-3 py-1.5 font-semibold">{m.municipio}</td>
                              <td className="px-3 py-1.5">{m.uf}</td>
                              <td className="px-3 py-1.5 text-right">{m.total.toLocaleString("pt-BR")}</td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">{d.total ? ((m.total / d.total) * 100).toFixed(1) : "0"}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {tab === "empresas" && (

              <>
                <div className="flex flex-wrap gap-2 mb-3 items-center">
                  <select value={ufFiltro} onChange={(e) => setUfFiltro(e.target.value)} className="text-[12px] border border-border rounded px-2 py-1 bg-card">
                    <option value="">Todos os estados</option>
                    {d.por_uf.map((u) => <option key={u.uf} value={u.uf}>{u.uf} ({u.total})</option>)}
                  </select>
                  <select value={equipeFiltro} onChange={(e) => setEquipeFiltro(e.target.value)} className="text-[12px] border border-border rounded px-2 py-1 bg-card">
                    <option value="">Todas as equipes</option>
                    {equipesTotais.map((r) => <option key={r.equipe} value={r.equipe}>{r.equipe} ({r.total})</option>)}
                  </select>
                  <select value={regimeFiltro} onChange={(e) => setRegimeFiltro(e.target.value)} className="text-[12px] border border-border rounded px-2 py-1 bg-card">
                    <option value="">Todos os regimes</option>
                    {regimesTotais.map((r) => <option key={r.regime} value={r.regime}>{r.regime} ({r.total})</option>)}
                  </select>
                  {municipioFiltro && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-charcoal text-white font-semibold">
                      Município: {municipioFiltro.split("||")[0]}
                    </span>
                  )}
                  {(ufFiltro || equipeFiltro || regimeFiltro || municipioFiltro) && (
                    <button onClick={() => { setUfFiltro(""); setEquipeFiltro(""); setRegimeFiltro(""); setMunicipioFiltro(""); }} className="text-[11px] text-muted-foreground underline">limpar</button>
                  )}

                  <div className="ml-auto text-[11px] text-muted-foreground">{empresasFiltradas.length.toLocaleString("pt-BR")} de {d.total.toLocaleString("pt-BR")}</div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="max-h-[620px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5">CNPJ</th>
                          <th className="text-left px-3 py-1.5">Razão / Grupo</th>
                          <th className="text-left px-3 py-1.5">UF</th>
                          <th className="text-left px-3 py-1.5">Regime</th>
                          <th className="text-left px-3 py-1.5">Equipes fiscais</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empresasFiltradas.slice(0, 500).map((e) => (
                          <tr key={e.cnpj} className="border-t border-border hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono">{fmtCnpj(e.cnpj)}</td>
                            <td className="px-3 py-1.5"><div className="font-semibold">{e.razao}</div><div className="text-[10px] text-muted-foreground">{e.grupo ?? ""}</div></td>
                            <td className="px-3 py-1.5">{e.uf}</td>
                            <td className="px-3 py-1.5">{e.regime ?? "—"}</td>
                            <td className="px-3 py-1.5">{e.tags_fiscal.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {empresasFiltradas.length > 500 && (
                      <div className="p-2 text-[11px] text-muted-foreground text-center">Mostrando 500 de {empresasFiltradas.length}. Use os filtros ou exporte para ver todas.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </HubShell>
  );
}
