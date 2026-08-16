import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaBaseResumo } from "@/lib/empresas-mensal";
import { listTagsBase, type TagBaseRecord } from "@/lib/parse-tags-html";
import { ArrowLeft, Building2, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

type Empresa = {
  cnpj: string;
  razao: string | null;
  regime: string | null;
  grupo: string | null;
  tags: string[];
  sem_tag: boolean;
};

async function fetchTotalEmpresas() {
  return getEmpresaBaseResumo();
}

/** Converte uma sequência de dígitos em padrão CNPJ parcial: 57464911 → 57.464.911 */
function digitsToCnpjPattern(d: string) {
  const masks = [2, 3, 3, 4, 2];
  const seps = [".", ".", "/", "-", ""];
  let out = "";
  let i = 0;
  for (let g = 0; g < masks.length && i < d.length; g++) {
    out += d.slice(i, i + masks[g]);
    i += masks[g];
    if (i < d.length) out += seps[g];
  }
  return out;
}

async function fetchEmpresas(mode: "cnpj" | "grupo", term: string): Promise<Empresa[]> {
  const t = term.trim();
  if (!t) return [];
  const resumo = await getEmpresaBaseResumo();
  if (!resumo.importacao) return [];
  let q = supabase
    .from("empresas_base_mensal")
    .select("cnpj,razao,regime,grupo,tags,sem_tag")
    .eq("importacao_id", resumo.importacao.id)
    .limit(500);
  if (mode === "cnpj") {
    const digits = t.replace(/\D/g, "");
    if (digits) {
      const pattern = digitsToCnpjPattern(digits);
      // tenta pelo padrão formatado e também pelo termo cru (caso o usuário cole já formatado)
      q = q.or(`cnpj.ilike.%${pattern}%,cnpj.ilike.%${t}%,razao.ilike.%${t}%`);
    } else {
      q = q.or(`cnpj.ilike.%${t}%,razao.ilike.%${t}%`);
    }
  } else {
    q = q.ilike("grupo", `%${t}%`);
  }
  const { data, error } = await q.order("grupo").order("razao");
  if (error) throw error;
  return (data ?? []) as Empresa[];
}

export const Route = createFileRoute("/consulta/empresas")({
  head: () => ({ meta: [{ title: "Empresas x TAG — Planning Hub" }] }),
  component: EmpresasPage,
});

function formatCnpj(c: string) {
  const d = c.replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function tagDept(tag: string): string {
  if (tag.includes("DP") && !tag.includes("Dedicada")) return "DP";
  if (tag.includes("Fiscal")) return "Fiscal";
  if (tag.includes("Cont")) return "Contábil";
  if (tag.includes(" CC") || tag.includes("Equipe CC")) return "CC";
  return "Outra";
}

const DEPT_COLORS: Record<string, { bg: string; fg: string; soft: string }> = {
  DP: { bg: "#C9F7E2", fg: "#00BF63", soft: "#F0FBF5" },
  Fiscal: { bg: "#FFE5D2", fg: "#FA6914", soft: "#FFF6EE" },
  Contábil: { bg: "#DDF6FF", fg: "#14C8FA", soft: "#F0FAFF" },
  CC: { bg: "#EDE9FE", fg: "#7C3AED", soft: "#F7F5FF" },
  Outra: { bg: "#E8E8E8", fg: "#4A4A4A", soft: "#F5F5F5" },
};

function EmpresasPage() {
  const [mode, setMode] = useState<"cnpj" | "grupo">("cnpj");
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");

  const totalQ = useQuery({ queryKey: ["empresas_base_mensal", "count"], queryFn: fetchTotalEmpresas });
  const tagsQ = useQuery<TagBaseRecord[]>({ queryKey: ["tags_base"], queryFn: listTagsBase });
  const empQ = useQuery({
    queryKey: ["empresas_tags", mode, submitted],
    queryFn: () => fetchEmpresas(mode, submitted),
    enabled: !!submitted,
  });

  const tagsMap = useMemo(() => {
    const norm = (s: string) => s.replace(/[\s\-–—]+/g, "").toLowerCase();
    const m = new Map<string, TagBaseRecord>();
    (tagsQ.data ?? []).forEach((t) => {
      m.set(t.key, t);
      m.set(norm(t.key), t);
    });
    return m;
  }, [tagsQ.data]);
  const findTag = (k: string) =>
    tagsMap.get(k) || tagsMap.get(k.replace(/[\s\-–—]+/g, "").toLowerCase());


  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(term);
  }

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-6">
        <Link to="/consultas" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal mb-3">
          <ArrowLeft size={13} /> Consultas
        </Link>

        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Consulta aberta</div>
            <h1 className="text-[24px] font-extrabold text-charcoal leading-tight">Empresas x TAG</h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Busque por CNPJ, Razão Social ou Grupo Econômico pra ver quem é o coordenador e os supervisores responsáveis em cada área.
            </p>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            <div>Base no Hub</div>
            <div className="font-semibold text-charcoal">
              {totalQ.data?.total.toLocaleString("pt-BR") ?? "—"} empresas
            </div>
            <div>{totalQ.data?.competencia ? `Competência ${String(totalQ.data.competencia).slice(5, 7)}/${String(totalQ.data.competencia).slice(0, 4)}` : "Nova base mensal"}</div>
          </div>
        </div>

        {totalQ.data?.total === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-5 text-[13px]">
            <strong className="text-amber-900">Base ainda vazia.</strong>{" "}
            <span className="text-amber-800">
              Abra a <Link to="/base-empresas" className="underline font-semibold">Base Empresas</Link>,
              carregue a planilha S3D mensal e clique em <strong>Importar e ativar base do mês</strong>.
            </span>
          </div>
        )}

        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex border border-border rounded-md overflow-hidden">
              {(["cnpj", "grupo"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 text-[12px] font-semibold ${mode === m ? "bg-charcoal text-white" : "bg-white text-charcoal hover:bg-muted"}`}
                >
                  {m === "cnpj" ? "Por CNPJ / Razão" : "Por Grupo"}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[260px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={mode === "cnpj" ? "CNPJ (com ou sem máscara) ou parte da Razão Social" : "Nome do Grupo Econômico"}
                className="w-full pl-9 pr-3 py-2 text-[13px] border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/10"
              />
            </div>
            <button
              type="submit"
              disabled={!term.trim()}
              className="px-4 py-2 rounded-md bg-charcoal text-white text-[12px] font-semibold disabled:opacity-50"
            >
              Buscar
            </button>
          </div>
        </form>

        {empQ.isFetching && submitted && (
          <div className="text-[12px] text-muted-foreground">Buscando…</div>
        )}
        {empQ.error && (
          <div className="text-[13px] text-destructive">{(empQ.error as Error).message}</div>
        )}
        {submitted && empQ.data && empQ.data.length === 0 && !empQ.isFetching && (
          <div className="text-[13px] text-muted-foreground">Nenhuma empresa encontrada para "{submitted}".</div>
        )}

        {empQ.data && empQ.data.length > 0 && (
          <div className="space-y-3">
            <div className="text-[11px] text-muted-foreground">
              {empQ.data.length} {empQ.data.length === 1 ? "resultado" : "resultados"}
              {empQ.data.length >= 500 && " (mostrando primeiros 500 — refine a busca)"}
            </div>
            {empQ.data.map((e) => (
              <div key={e.cnpj} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={14} className="text-muted-foreground" />
                      <span className="font-mono text-[12px] font-semibold text-charcoal">{formatCnpj(e.cnpj)}</span>
                      {e.regime && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">{e.regime}</span>
                      )}
                    </div>
                    <div className="text-[14px] font-bold text-charcoal">{e.razao || "—"}</div>
                    {e.grupo && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Grupo: <span className="font-semibold text-charcoal">{e.grupo}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-5 py-3">
                  {e.tags.length === 0 ? (
                    <div className="text-[12px] text-destructive font-semibold">⚠ Empresa sem TAG atribuída</div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {e.tags.map((tagKey) => {
                        const t = findTag(tagKey);
                        const dept = t?.dept ?? tagDept(tagKey);
                        const c = DEPT_COLORS[dept] ?? DEPT_COLORS.Outra;
                        return (
                          <div
                            key={tagKey}
                            className="rounded-lg p-3 border"
                            style={{ background: c.soft, borderColor: c.bg }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: c.fg }}>
                                {dept}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: c.bg, color: c.fg }}>
                                {t?.label || tagKey}
                              </span>
                            </div>
                            <div className="mb-2">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Coordenador</div>
                              <div className="text-[14px] font-bold text-charcoal">{t?.coord || "—"}</div>
                              {t?.gerente && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">Gerente: {t.gerente}</div>
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <Users size={10} /> Supervisores
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {t && t.supers.length > 0 ? (
                                  t.supers.map((s) => (
                                    <span key={s} className="text-[11px] px-2 py-0.5 rounded bg-white border border-border text-charcoal font-medium">
                                      {s}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HubShell>
  );
}
