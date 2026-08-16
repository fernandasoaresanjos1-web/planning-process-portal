import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { listAllIndicadores, listProcessos } from "@/lib/hub-data";
import { Database } from "lucide-react";

const indQO = queryOptions({ queryKey: ["indicadores", "all"], queryFn: listAllIndicadores });
const procQO = queryOptions({ queryKey: ["processos"], queryFn: listProcessos });

export const Route = createFileRoute("/dados")({
  head: () => ({ meta: [{ title: "Base de dados — Planning Hub" }] }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(indQO);
    context.queryClient.ensureQueryData(procQO);
  },
  component: DadosPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function DadosPage() {
  const { data: indicadores } = useSuspenseQuery(indQO);
  const { data: processos } = useSuspenseQuery(procQO);
  const procMap = Object.fromEntries(processos.map((p) => [p.slug, p]));

  function exportCsv() {
    const header = ["processo", "ano", "mes", "indicador", "valor", "unidade"];
    const rows = indicadores.map((i) => [
      procMap[i.processo_slug]?.nome ?? i.processo_slug,
      i.ano, i.mes, i.indicador_rotulo, i.valor, i.unidade,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `planning-hub-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Banco de dados</div>
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Base de indicadores</h1>
            <p className="text-sm text-muted-foreground mt-1">{indicadores.length.toLocaleString("pt-BR")} registros consolidados.</p>
          </div>
          <button onClick={exportCsv} className="bg-charcoal text-white font-semibold text-[13px] px-4 py-2.5 rounded-md">
            Exportar CSV
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {indicadores.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground">
              <Database className="mx-auto mb-3" size={28} />
              Nenhum dado importado ainda.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-secondary text-muted-foreground text-[11px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="text-left px-5 py-3">Processo</th>
                  <th className="text-left px-5 py-3">Período</th>
                  <th className="text-left px-5 py-3">Indicador</th>
                  <th className="text-right px-5 py-3">Valor</th>
                  <th className="text-left px-5 py-3">Unidade</th>
                </tr>
              </thead>
              <tbody>
                {indicadores.slice(0, 500).map((i) => (
                  <tr key={i.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: procMap[i.processo_slug]?.cor }} />
                        {procMap[i.processo_slug]?.nome ?? i.processo_slug}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">{String(i.mes).padStart(2,"0")}/{i.ano}</td>
                    <td className="px-5 py-2.5">{i.indicador_rotulo}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-charcoal">{Number(i.valor).toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{i.unidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {indicadores.length > 500 && (
            <div className="text-center py-3 text-[12px] text-muted-foreground border-t border-border">Mostrando 500 de {indicadores.length}. Use o CSV para exportar tudo.</div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
