import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { listEmpresasAtivas } from "@/lib/empresas-mensal";
import { isTagFiscalElegivel } from "@/lib/sittax-sn";
import {
  listIrpjLpAuto,
  listIrpjLpUploads,
  importIrpjLp,
  competenciaLabel,
} from "@/lib/irpj-lp";

export const Route = createFileRoute("/processo/irpj-csll-lp")({
  head: () => ({
    meta: [
      { title: "IRPJ/CSLL Lucro Presumido — Planning Hub" },
      { name: "description", content: "Conferência mensal de apurações IRPJ/CSLL Lucro Presumido — Equipe Fiscal." },
    ],
  }),
  component: () => (
    <HubShell>
      <IrpjLpPage />
    </HubShell>
  ),
});

type Tab = "geral" | "empresa" | "auto" | "sem";
const PAGE = 50;

function equipeFiscalFromTags(tags: string[] | null | undefined): string {
  if (!tags?.length) return "";
  return tags.find(isTagFiscalElegivel) ?? "";
}

type Reg = {
  cn: string;
  em: string;
  gr: string;
  ef: string;
  tem_aut: boolean;
  mas: string; // ISO YYYY-MM-01 do último balancete; "" se sem
  ult: string; // label do último balancete (MM/YYYY)
  sit: "so_automatizacao" | "sem_dados";
  ap_aut: Record<string, boolean | null>; // por mês
};

function IrpjLpPage() {
  const qc = useQueryClient();
  const { user, nome } = useAuth();
  const [tab, setTab] = useState<Tab>("geral");
  const [mesFiltro, setMesFiltro] = useState<string>("all");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [ef1, setEf1] = useState("");
  const [ef2, setEf2] = useState("");
  const [ef3, setEf3] = useState("");
  const [src1, setSrc1] = useState("");
  const [p1, setP1] = useState(1);
  const [p2, setP2] = useState(1);
  const [p3, setP3] = useState(1);
  const [openImport, setOpenImport] = useState(false);

  const empresasQ = useQuery({ queryKey: ["empresas-ativas"], queryFn: listEmpresasAtivas });
  const autoQ = useQuery({ queryKey: ["irpj-lp-auto"], queryFn: listIrpjLpAuto });
  const uploadsQ = useQuery({ queryKey: ["irpj-lp-uploads"], queryFn: listIrpjLpUploads });

  const empresas = empresasQ.data ?? [];
  const auto = autoQ.data ?? [];
  const uploads = uploadsQ.data ?? [];

  // Base: LP + matriz + TAG fiscal
  const empresasLP = useMemo(
    () =>
      empresas.filter(
        (e) =>
          /lucro presumido/i.test(e.regime ?? "") &&
          e.cnpj.slice(8, 12) === "0001" &&
          (e.tags ?? []).some(isTagFiscalElegivel),
      ),
    [empresas],
  );

  // Último balancete por CNPJ (maior ultimo_balancete_iso encontrado no banco)
  const lastByCnpj = useMemo(() => {
    const m = new Map<string, { iso: string; label: string }>();
    auto.forEach((r) => {
      const iso = r.ultimo_balancete_iso ?? "";
      if (!iso) return;
      const prev = m.get(r.cnpj);
      if (!prev || iso > prev.iso) m.set(r.cnpj, { iso, label: r.ultimo_balancete ?? "" });
    });
    return m;
  }, [auto]);

  // Meses (colunas/mes-bar): competências efetivamente importadas (uploads),
  // limitadas ao último mês atualizado. Empresas sem apuração aparecem como ✗ no mês.
  const meses = useMemo(() => {
    const s = new Set<string>();
    uploads.forEach((u) => u.competencia && s.add(u.competencia));
    const arr = [...s].sort();
    if (!arr.length) return arr;
    const max = arr[arr.length - 1];
    return arr.filter((m) => m <= max);
  }, [uploads]);

  // Registros no formato do HTML
  const regs = useMemo<Reg[]>(() => {
    return empresasLP
      .map<Reg>((e) => {
        const last = lastByCnpj.get(e.cnpj);
        const mas = last?.iso ?? "";
        const tem_aut = Boolean(mas);
        const ap_aut: Record<string, boolean | null> = {};
        meses.forEach((m) => {
          ap_aut[m] = tem_aut ? mas >= m : false;
        });
        return {
          cn: e.cnpj,
          em: e.razao ?? "",
          gr: e.grupo ?? "",
          ef: equipeFiscalFromTags(e.tags),
          tem_aut,
          mas,
          ult: last?.label ?? "",
          sit: tem_aut ? "so_automatizacao" : "sem_dados",
          ap_aut,
        };
      })
      .sort((a, b) => a.em.localeCompare(b.em));
  }, [empresasLP, lastByCnpj, meses]);

  // Stats por mês (mes-bar): cobertura acumulada até o mês
  const statsMes = useMemo(() => {
    const s: Record<string, { aut: number; total: number }> = {};
    meses.forEach((m) => {
      const aut = regs.filter((r) => r.mas && r.mas >= m).length;
      s[m] = { aut, total: regs.length };
    });
    return s;
  }, [regs, meses]);

  const equipesOpts = useMemo(() => {
    const s = new Set<string>();
    regs.forEach((r) => r.ef && s.add(r.ef));
    return [...s].sort();
  }, [regs]);

  // Helper: r é "com automatização" no filtro de mês?
  const autOk = (r: Reg) => (mesFiltro === "all" ? r.tem_aut : Boolean(r.mas && r.mas >= mesFiltro));

  // KPIs
  const base = regs.length;
  const nAut = regs.filter(autOk).length;
  const nSem = base - nAut;

  // Por equipe fiscal (Visão Geral)
  const porEquipe = useMemo(() => {
    const m: Record<string, { equipe: string; base: number; aut: number; sem: number }> = {};
    regs.forEach((r) => {
      const eq = r.ef;
      if (!eq) return;
      if (!m[eq]) m[eq] = { equipe: eq, base: 0, aut: 0, sem: 0 };
      m[eq].base++;
      if (autOk(r)) m[eq].aut++;
      else m[eq].sem++;
    });
    return Object.values(m).sort((a, b) => a.equipe.localeCompare(b.equipe));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs, mesFiltro]);

  // ── Tab 1: Por Empresa
  const fil1 = useMemo(() => {
    const t = q1.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return regs.filter((r) => {
      if (ef1 && r.ef !== ef1) return false;
      if (src1 === "so_automatizacao" && !autOk(r)) return false;
      if (src1 === "sem_dados" && autOk(r)) return false;
      if (mesFiltro !== "all" && !src1 && !autOk(r) && r.sit !== "sem_dados") return false;
      if (!t) return true;
      return (
        r.em.toLowerCase().includes(t) ||
        (digits && r.cn.includes(digits)) ||
        r.gr.toLowerCase().includes(t)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs, q1, ef1, src1, mesFiltro]);

  // ── Tab 2: Automatização (só quem tem auto)
  const fil2 = useMemo(() => {
    const t = q2.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return regs.filter((r) => {
      if (!r.tem_aut) return false;
      if (mesFiltro !== "all" && !(r.mas && r.mas >= mesFiltro)) return false;
      if (ef2 && r.ef !== ef2) return false;
      if (!t) return true;
      return r.em.toLowerCase().includes(t) || (digits && r.cn.includes(digits));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs, q2, ef2, mesFiltro]);

  // ── Tab 3: Sem Apuração
  const fil3 = useMemo(() => {
    const t = q3.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return regs.filter((r) => {
      if (autOk(r)) return false;
      if (ef3 && r.ef !== ef3) return false;
      if (!t) return true;
      return (
        r.em.toLowerCase().includes(t) ||
        (digits && r.cn.includes(digits)) ||
        r.gr.toLowerCase().includes(t)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regs, q3, ef3, mesFiltro]);

  const tp1 = Math.max(1, Math.ceil(fil1.length / PAGE));
  const tp2 = Math.max(1, Math.ceil(fil2.length / PAGE));
  const tp3 = Math.max(1, Math.ceil(fil3.length / PAGE));
  const sl1 = fil1.slice((p1 - 1) * PAGE, p1 * PAGE);
  const sl2 = fil2.slice((p2 - 1) * PAGE, p2 * PAGE);
  const sl3 = fil3.slice((p3 - 1) * PAGE, p3 * PAGE);

  const tabLbl: Record<Tab, string> = {
    geral: "Visão Geral",
    empresa: "Por Empresa",
    auto: "Automatização",
    sem: "Sem Apuração",
  };

  return (
    <div className="font-sans text-[13px] bg-[#FAFAFA] min-h-screen">
      {/* Topbar */}
      <div className="sticky top-0 z-[100] bg-[#0C0C0C] h-[54px] flex items-center gap-2.5 px-5">
        <div className="w-8 h-8 rounded-lg bg-teal-400 grid place-items-center text-[8px] font-extrabold text-black leading-tight text-center">
          IRPJ<br />LP
        </div>
        <span className="text-[11px] text-white/45">
          <strong className="text-white">IRPJ / CSLL — Lucro Presumido</strong>
          <span className="opacity-30"> / </span>
          <span>{tabLbl[tab]}</span>
        </span>
        <span className="ml-auto text-[10px] text-white/40 hidden md:inline">
          LP · Equipe Fiscal · sem filial · sem CC
        </span>
        <button
          onClick={() => setOpenImport(true)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/20"
        >
          ⬆ Atualizar dados
        </button>
      </div>

      {/* Mês bar */}
      <div className="sticky top-[54px] z-[95] bg-white border-b-2 border-border overflow-x-auto px-5">
        <div className="flex items-stretch gap-0">
          <MesBtn
            active={mesFiltro === "all"}
            onClick={() => { setMesFiltro("all"); setP1(1); setP2(1); setP3(1); }}
            top="Todos"
            mid={`${base} emp.`}
          />
          {meses.map((m) => {
            const s = statsMes[m] ?? { aut: 0, total: 0 };
            return (
              <MesBtn
                key={m}
                active={mesFiltro === m}
                onClick={() => { setMesFiltro(m); setP1(1); setP2(1); setP3(1); }}
                top={competenciaLabel(m)}
                mid={`${s.total} apurac.`}
                sub={`${s.aut} Auto`}
              />
            );
          })}
          {!meses.length && (
            <span className="py-3 px-2 text-[11px] text-muted-foreground">Nenhuma competência importada ainda.</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[108px] z-[89] bg-white border-b-2 border-border flex px-5 overflow-x-auto">
        <TabBtn active={tab === "geral"} onClick={() => setTab("geral")}>📊 Visão Geral</TabBtn>
        <TabBtn active={tab === "empresa"} onClick={() => setTab("empresa")}>
          📋 Por Empresa <Bg>{base}</Bg>
        </TabBtn>
        <TabBtn active={tab === "auto"} onClick={() => setTab("auto")}>
          🤖 Automatização <Bg tone="b">{nAut}</Bg>
        </TabBtn>
        <TabBtn active={tab === "sem"} onClick={() => setTab("sem")}>
          ❌ Sem Apuração <Bg tone="r">{nSem}</Bg>
        </TabBtn>
      </div>

      <div className="max-w-[1500px] mx-auto px-5 py-4 pb-20">
        {tab === "geral" && (
          <>
            <div className="flex flex-wrap gap-2.5 mb-4">
              <Card tone="t" label="Base LP — Equipe Fiscal" value={base} sub="sem filial · sem CC" />
              <Card tone="g" label="🤖 Automatização" value={nAut} sub={`${pct(nAut, base)}% da base`} barPct={pct(nAut, base)} barColor="teal" />
              <Card tone="r" label="❌ Sem apuração" value={nSem} sub={`${pct(nSem, base)}% da base`} barPct={pct(nSem, base)} barColor="red" />
              <Card tone="" label="Uploads" value={uploads.length} sub={`${meses.length} competência(s)`} />
            </div>

            <div className="bg-white border border-border rounded-xl p-4">
              <div className="text-[12px] font-bold text-charcoal mb-3">
                👥 Por equipe fiscal{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  {mesFiltro !== "all" ? `— ${competenciaLabel(mesFiltro)}` : ""}
                </span>
              </div>
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[9px] uppercase text-muted-foreground border-b-2 border-border">
                    <th className="text-left py-1.5">Equipe</th>
                    <th className="text-right">Base LP</th>
                    <th className="text-right text-teal-600">Automat.</th>
                    <th className="text-right">Cobertos</th>
                    <th className="text-right">% Cobertura</th>
                    <th className="text-right text-red-600">Sem dados</th>
                  </tr>
                </thead>
                <tbody>
                  {porEquipe.map((r) => {
                    const p = pct(r.aut, r.base);
                    const c = p >= 70 ? "text-emerald-600" : p >= 40 ? "text-orange-500" : "text-red-600";
                    const cBg = p >= 70 ? "bg-emerald-500" : p >= 40 ? "bg-orange-500" : "bg-red-500";
                    return (
                      <tr key={r.equipe} className="border-b border-muted last:border-0 hover:bg-muted/40">
                        <td className="py-1.5 font-bold">{r.equipe}</td>
                        <td className="text-right font-bold">{r.base}</td>
                        <td className="text-right font-bold text-teal-600">{r.aut}</td>
                        <td className="text-right font-bold">{r.aut}</td>
                        <td className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="w-12 h-1.5 bg-muted rounded overflow-hidden">
                              <div className={`h-full ${cBg}`} style={{ width: `${p}%` }} />
                            </div>
                            <span className={`text-[11px] font-bold ${c}`}>{p}%</span>
                          </div>
                        </td>
                        <td className={`text-right font-bold ${r.sem > 0 ? "text-red-600" : "text-muted-foreground"}`}>{r.sem}</td>
                      </tr>
                    );
                  })}
                  {!porEquipe.length && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma empresa.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "empresa" && (
          <>
            <Toolbar>
              <SearchIn value={q1} onChange={(v) => { setQ1(v); setP1(1); }} placeholder="Empresa, CNPJ ou grupo..." />
              <EqSel value={ef1} onChange={(v) => { setEf1(v); setP1(1); }} opts={equipesOpts} />
              <select className="sel" value={src1} onChange={(e) => { setSrc1(e.target.value); setP1(1); }}>
                <option value="">Todas as situações</option>
                <option value="so_automatizacao">🤖 Automatização</option>
                <option value="sem_dados">❌ Sem apuração</option>
              </select>
              <Cnt>{fil1.length.toLocaleString("pt-BR")} empresas</Cnt>
            </Toolbar>
            <TableWrap>
              <table className="w-full text-[11.5px] min-w-[1050px] border-collapse">
                <TH cols={["Empresa","CNPJ","Grupo","Equipe Fiscal","Situação","Último Bal.", ...meses.map(competenciaLabel)]} />
                <tbody>
                  {sl1.map((r) => (
                    <tr key={r.cn} className="border-b border-border hover:bg-teal-50/50">
                      <td className="px-2.5 py-1.5 font-semibold text-charcoal truncate max-w-[240px]" title={r.em}>{r.em}</td>
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{fmtCnpj(r.cn)}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[140px]" title={r.gr}>{r.gr || "—"}</td>
                      <td className="px-2.5 py-1.5 text-[11px] whitespace-nowrap">{r.ef || "—"}</td>
                      <td className="px-2.5 py-1.5">{sitBadge(r.sit)}</td>
                      <td className="px-2.5 py-1.5 text-[10.5px] font-semibold text-teal-600">{r.ult ? `✅ ${r.ult}` : "—"}</td>
                      {meses.map((m) => (
                        <td key={m} className="text-center px-1.5">{apCell(r.ap_aut[m])}</td>
                      ))}
                    </tr>
                  ))}
                  {!sl1.length && (
                    <tr><td colSpan={6 + meses.length} className="p-8 text-center text-muted-foreground">Nenhuma empresa.</td></tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pag total={tp1} page={p1} onPage={setP1} />
          </>
        )}

        {tab === "auto" && (
          <>
            <Nota tone="b">🤖 Empresas LP no sistema de <strong>automatização</strong> (controle_gerencial_balancetes). Colunas acumuladas até o último balancete.</Nota>
            <Toolbar>
              <SearchIn value={q2} onChange={(v) => { setQ2(v); setP2(1); }} placeholder="Buscar empresa..." />
              <EqSel value={ef2} onChange={(v) => { setEf2(v); setP2(1); }} opts={equipesOpts} />
              <Cnt>{fil2.length.toLocaleString("pt-BR")} empresas</Cnt>
            </Toolbar>
            <TableWrap>
              <table className="w-full text-[11.5px] min-w-[1000px] border-collapse">
                <TH cols={["Empresa","CNPJ","Grupo","Equipe Fiscal","Último Bal.", ...meses.map(competenciaLabel)]} />
                <tbody>
                  {sl2.map((r) => (
                    <tr key={r.cn} className="border-b border-border hover:bg-teal-50/50">
                      <td className="px-2.5 py-1.5 font-semibold text-charcoal truncate max-w-[240px]" title={r.em}>{r.em}</td>
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{fmtCnpj(r.cn)}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[140px]" title={r.gr}>{r.gr || "—"}</td>
                      <td className="px-2.5 py-1.5 text-[11px] whitespace-nowrap">{r.ef || "—"}</td>
                      <td className="px-2.5 py-1.5 text-[10.5px] font-semibold text-teal-600">{r.ult ? `✅ ${r.ult}` : "—"}</td>
                      {meses.map((m) => (
                        <td key={m} className="text-center px-1.5">{apCell(r.ap_aut[m])}</td>
                      ))}
                    </tr>
                  ))}
                  {!sl2.length && (
                    <tr><td colSpan={5 + meses.length} className="p-8 text-center text-muted-foreground">Nenhuma empresa.</td></tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pag total={tp2} page={p2} onPage={setP2} />
          </>
        )}

        {tab === "sem" && (
          <>
            <Nota tone="r">❌ Empresas LP + Equipe Fiscal sem registro na automatização no período selecionado.</Nota>
            <Toolbar>
              <SearchIn value={q3} onChange={(v) => { setQ3(v); setP3(1); }} placeholder="Buscar empresa..." />
              <EqSel value={ef3} onChange={(v) => { setEf3(v); setP3(1); }} opts={equipesOpts} />
              <Cnt>{fil3.length.toLocaleString("pt-BR")} empresas</Cnt>
            </Toolbar>
            <TableWrap>
              <table className="w-full text-[11.5px] min-w-[700px] border-collapse">
                <TH cols={["Empresa","CNPJ","Grupo","Equipe Fiscal"]} />
                <tbody>
                  {sl3.map((r) => (
                    <tr key={r.cn} className="border-b border-border hover:bg-teal-50/50">
                      <td className="px-2.5 py-1.5 font-semibold text-charcoal truncate max-w-[240px]" title={r.em}>{r.em}</td>
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{fmtCnpj(r.cn)}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[140px]" title={r.gr}>{r.gr || "—"}</td>
                      <td className="px-2.5 py-1.5 text-[11px] whitespace-nowrap">{r.ef || "—"}</td>
                    </tr>
                  ))}
                  {!sl3.length && (
                    <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhuma empresa.</td></tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pag total={tp3} page={p3} onPage={setP3} />
          </>
        )}
      </div>

      {openImport && (
        <ImportModal
          onClose={() => setOpenImport(false)}
          autor={nome ?? user?.email ?? null}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["irpj-lp-auto"] });
            qc.invalidateQueries({ queryKey: ["irpj-lp-uploads"] });
          }}
        />
      )}
    </div>
  );
}

function ImportModal({ onClose, autor, onDone }: { onClose: () => void; autor: string | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [comp, setComp] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) return setMsg("Selecione o arquivo (.csv ou .xlsx).");
    if (!/^\d{4}-\d{2}$/.test(comp)) return setMsg("Informe a competência no formato AAAA-MM.");
    setBusy(true);
    setMsg("");
    try {
      const r = await importIrpjLp(file, comp, autor ?? undefined);
      setMsg(`Importado: ${r.total} empresas em ${comp}.`);
      onDone();
      setTimeout(onClose, 900);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[200] grid place-items-center p-4">
      <div className="bg-white rounded-xl border border-border w-full max-w-md p-5">
        <div className="text-[14px] font-bold text-charcoal mb-3">Atualizar Automatização (IRPJ/CSLL LP)</div>
        <div className="text-[12px] text-muted-foreground mb-3">
          Cada upload cria/atualiza apenas a competência informada. Meses anteriores permanecem intactos.
        </div>
        <label className="block text-[11px] font-semibold mb-1">Competência (AAAA-MM)</label>
        <input type="month" className="w-full text-[12px] px-3 py-1.5 rounded-md border border-border mb-3" value={comp} onChange={(e) => setComp(e.target.value)} />
        <label className="block text-[11px] font-semibold mb-1">Planilha (.csv ou .xlsx)</label>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-[12px] mb-3" />
        {msg && <div className="text-[11.5px] mb-2 text-charcoal">{msg}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={busy} className="text-[12px] px-3 py-1.5 rounded-md border border-border">Cancelar</button>
          <button onClick={submit} disabled={busy} className="text-[12px] px-3 py-1.5 rounded-md bg-charcoal text-white disabled:opacity-50">
            {busy ? "Importando..." : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── helpers UI ────────────────────────────────────────────────
function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[12px] font-semibold px-4 py-2.5 border-b-2 -mb-[2px] flex items-center gap-1.5 whitespace-nowrap ${
        active ? "border-teal-400 text-teal-600" : "border-transparent text-muted-foreground hover:text-charcoal"
      }`}
    >
      {children}
    </button>
  );
}
function MesBtn({ active, top, mid, sub, onClick }: { active: boolean; top: string; mid: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 border-b-2 -mb-[2px] flex flex-col items-center gap-0.5 min-w-[80px] whitespace-nowrap transition-colors ${
        active ? "border-teal-400 text-teal-600" : "border-transparent text-muted-foreground hover:text-charcoal"
      }`}
    >
      <span className="text-[11.5px] font-bold">{top}</span>
      <span className="text-[10px] font-bold">{mid}</span>
      {sub && <span className={`text-[9px] ${active ? "text-teal-500/70" : "text-muted-foreground/50"}`}>{sub}</span>}
    </button>
  );
}
function Bg({ children, tone }: { children: React.ReactNode; tone?: "b" | "r" }) {
  const cls = tone === "r" ? "bg-red-100 text-red-700" : tone === "b" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{children}</span>;
}
function Card({ tone, label, value, sub, barPct, barColor }: { tone: "t" | "g" | "r" | ""; label: string; value: number; sub: string; barPct?: number; barColor?: "teal" | "red" }) {
  const border =
    tone === "t" ? "border-teal-200 bg-teal-50" :
    tone === "g" ? "border-emerald-200 bg-emerald-50" :
    tone === "r" ? "border-red-200 bg-red-50" :
    "border-border bg-white";
  const vc =
    tone === "t" ? "text-teal-600" :
    tone === "g" ? "text-emerald-600" :
    tone === "r" ? "text-red-600" :
    "text-charcoal";
  return (
    <div className={`rounded-xl border p-3 flex-1 min-w-[120px] ${border}`}>
      <div className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className={`text-[26px] font-extrabold leading-tight ${vc}`}>{value.toLocaleString("pt-BR")}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      {barPct !== undefined && (
        <div className="h-1 rounded mt-1.5 bg-muted overflow-hidden">
          <div className={`h-full rounded ${barColor === "teal" ? "bg-teal-500" : "bg-red-500"}`} style={{ width: `${barPct}%` }} />
        </div>
      )}
    </div>
  );
}
function Nota({ tone, children }: { tone: "b" | "r"; children: React.ReactNode }) {
  const cls = tone === "b" ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-red-50 border-red-300 text-red-700";
  return <div className={`rounded-lg border px-3 py-2 text-[12px] mb-3 leading-relaxed ${cls}`}>{children}</div>;
}
function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 mb-2.5 flex-wrap">{children}<style>{`
    .sel{font-size:12px;padding:6px 10px;border:1px solid hsl(var(--border));border-radius:9px;background:white;outline:none;cursor:pointer}
    .sel:focus{border-color:#2DD4BF}
  `}</style></div>;
}
function SearchIn({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-[160px] max-w-[260px]">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[12px] pl-8 pr-3 py-1.5 rounded-lg border border-border bg-white outline-none focus:border-teal-400"
      />
    </div>
  );
}
function EqSel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todas as equipes</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Cnt({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">{children}</span>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-border rounded-xl overflow-x-auto">{children}</div>;
}
function TH({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="bg-muted/40 border-b border-border">
        {cols.map((c, i) => {
          const center = i >= 6 || (cols.length <= 6 && i >= 4);
          return (
            <th key={i} className={`px-2.5 py-2 text-[9px] font-bold uppercase text-muted-foreground tracking-wider whitespace-nowrap ${center ? "text-center" : "text-left"}`}>
              {c}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
function Pag({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-2 mt-3">
      <button className="text-[11px] font-semibold px-3 py-1 rounded-lg border border-border bg-white hover:border-teal-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-default" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>← Anterior</button>
      <span className="text-[11px] text-muted-foreground min-w-[80px] text-center">Página {page} de {total}</span>
      <button className="text-[11px] font-semibold px-3 py-1 rounded-lg border border-border bg-white hover:border-teal-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-default" disabled={page >= total} onClick={() => onPage(Math.min(total, page + 1))}>Próxima →</button>
    </div>
  );
}
function sitBadge(sit: "so_automatizacao" | "sem_dados") {
  if (sit === "so_automatizacao") {
    return <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-200">🤖 Automat.</span>;
  }
  return <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">❌ Sem dados</span>;
}
function apCell(v: boolean | null | undefined) {
  if (v === true) return <span className="inline-grid place-items-center w-[22px] h-[22px] rounded-md bg-emerald-50 text-emerald-600 text-[12px] font-bold">✓</span>;
  if (v === false) return <span className="inline-grid place-items-center w-[22px] h-[22px] rounded-md bg-red-50 text-red-600 text-[12px] font-bold">✗</span>;
  return <span className="inline-grid place-items-center w-[22px] h-[22px] rounded-md bg-muted text-muted-foreground text-[12px]">—</span>;
}
function pct(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0; }
function fmtCnpj(d: string) {
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
