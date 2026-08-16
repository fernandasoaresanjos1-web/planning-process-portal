import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { listTagsBase, type TagBaseRecord } from "@/lib/parse-tags-html";
import { ArrowLeft, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

const tagsBaseQO = queryOptions({ queryKey: ["tags_base"], queryFn: listTagsBase });

export const Route = createFileRoute("/consulta/donos-tags")({
  head: () => ({ meta: [{ title: "Gestão x TAG — Planning Hub" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(tagsBaseQO);
  },
  component: DonosTagsPage,
  errorComponent: ({ error }) => (
    <HubShell>
      <div className="p-10 text-destructive">{error.message}</div>
    </HubShell>
  ),
});

const DEPT_COLORS: Record<string, { bg: string; fg: string }> = {
  DP: { bg: "#C9F7E2", fg: "#00BF63" },
  Fiscal: { bg: "#FFE5D2", fg: "#FA6914" },
  Contábil: { bg: "#DDF6FF", fg: "#14C8FA" },
  CC: { bg: "#EDE9FE", fg: "#7C3AED" },
  Outra: { bg: "#E8E8E8", fg: "#4A4A4A" },
};

function DonosTagsPage() {
  const { data: tags } = useSuspenseQuery(tagsBaseQO);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string>("");

  const depts = useMemo(() => {
    const s = new Set(tags.map((t) => t.dept));
    return Array.from(s);
  }, [tags]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tags.filter((t) => {
      if (dept && t.dept !== dept) return false;
      if (!term) return true;
      const hay = [
        t.label,
        t.key,
        t.coord ?? "",
        t.gerente ?? "",
        t.supers.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [tags, q, dept]);

  const grouped = useMemo(() => {
    const g: Record<string, TagBaseRecord[]> = {};
    for (const t of filtered) {
      if (!g[t.dept]) g[t.dept] = [];
      g[t.dept].push(t);
    }
    return g;
  }, [filtered]);

  const ultimaAtualizacao = tags
    .map((t) => t.atualizado_em)
    .sort()
    .at(-1);

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-6">
        <Link
          to="/consultas"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal mb-3"
        >
          <ArrowLeft size={13} /> Consultas
        </Link>

        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Consulta aberta
            </div>
            <h1 className="text-[24px] font-extrabold text-charcoal leading-tight">
              Gestão x TAG
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Coordenadores e supervisores responsáveis por cada equipe. Base sincronizada
              automaticamente quando o HTML de Controle de TAGs é atualizado no admin.
            </p>
          </div>
          {ultimaAtualizacao && (
            <div className="text-right text-[11px] text-muted-foreground">
              <div>Atualizada em</div>
              <div className="font-semibold text-charcoal">
                {new Date(ultimaAtualizacao).toLocaleString("pt-BR")}
              </div>
            </div>
          )}
        </div>

        {tags.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <Users className="mx-auto mb-3 text-muted-foreground" />
            <div className="font-semibold text-charcoal mb-1">Base ainda vazia</div>
            <p className="text-[13px] text-muted-foreground">
              Suba o HTML de <strong>Controle de TAGs</strong> em{" "}
              <Link to="/admin" className="underline">
                /admin
              </Link>{" "}
              para popular esta consulta.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[240px] max-w-[420px]">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar TAG, coordenador, gerente ou supervisor…"
                  className="w-full pl-9 pr-3 py-2 text-[13px] border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/10"
                />
              </div>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="text-[12px] border border-border rounded-md bg-white px-3 py-2"
              >
                <option value="">Todos os departamentos</option>
                {depts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-muted-foreground ml-auto">
                {filtered.length} de {tags.length} equipes
              </div>
            </div>

            <div className="space-y-6">
              {Object.entries(grouped).map(([d, lista]) => {
                const c = DEPT_COLORS[d] ?? DEPT_COLORS.Outra;
                return (
                  <div key={d}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ background: c.bg, color: c.fg }}
                      >
                        {d}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {lista.length} equipe{lista.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[180px_180px_180px_1fr] gap-3 px-4 py-2 bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                        <div>TAG</div>
                        <div>Gerente</div>
                        <div>Coordenação</div>
                        <div>Supervisores</div>
                      </div>
                      {lista.map((t) => (
                        <div
                          key={t.key}
                          className="grid grid-cols-[180px_180px_180px_1fr] gap-3 px-4 py-3 border-b border-border last:border-b-0 items-start hover:bg-muted/30"
                        >
                          <div>
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded"
                              style={{ background: c.bg, color: c.fg }}
                            >
                              {t.label}
                            </span>
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {t.key}
                            </div>
                          </div>
                          <div className="text-[12px] text-charcoal">
                            {t.gerente || <span className="text-muted-foreground">—</span>}
                          </div>
                          <div className="text-[12px] font-semibold text-charcoal">
                            {t.coord || <span className="text-muted-foreground font-normal">—</span>}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.supers.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">
                                Sem supervisores
                              </span>
                            ) : (
                              t.supers.map((s) => (
                                <span
                                  key={s}
                                  className="text-[11px] px-2 py-0.5 rounded bg-muted text-charcoal"
                                >
                                  {s}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </HubShell>
  );
}
