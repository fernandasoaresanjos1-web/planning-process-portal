import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { getProcesso } from "@/lib/hub-data";
import { getVersaoAtivaHtml } from "@/lib/processos-versoes";
import { ChevronLeft, ExternalLink } from "lucide-react";


const procQO = (slug: string) =>
  queryOptions({ queryKey: ["processo", slug], queryFn: () => getProcesso(slug) });

const htmlQO = (slug: string) =>
  queryOptions({
    queryKey: ["processo-html", slug],
    queryFn: () => getVersaoAtivaHtml(slug),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

export const Route = createFileRoute("/processo/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — Planning Hub` }] }),
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(procQO(params.slug));
    if (!p) throw notFound();
    await context.queryClient.fetchQuery(htmlQO(params.slug));
  },
  component: ProcessoPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-10">Processo não encontrado.</div>,
});

function ProcessoPage() {
  const { slug } = Route.useParams();
  const { data: processo } = useSuspenseQuery(procQO(slug));
  const { data: htmlContent } = useSuspenseQuery(htmlQO(slug));

  const fallbackSrc = `/processos/${slug}.html`;
  const useStaticHtml = !htmlContent;

  return (
    <HubShell>
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/processos" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal shrink-0">
              <ChevronLeft size={13} /> Processos
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ background: processo!.cor + "22", color: processo!.cor }}>
              {processo!.slug}
            </span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight truncate">{processo!.nome}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={fallbackSrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-charcoal border border-border rounded-md px-3 py-1.5 hover:bg-secondary">
              Abrir em tela cheia <ExternalLink size={12} />
            </a>
            <Link to="/admin" className="text-[12px] font-semibold text-[var(--brand-dark)] hover:underline">
              Atualizar HTML ↗
            </Link>
          </div>
        </div>
        {!useStaticHtml ? (
          <iframe
            srcDoc={htmlContent}
            sandbox="allow-scripts allow-forms allow-popups allow-downloads"
            title={`${processo!.nome} — análise`}
            className="w-full border border-border rounded-xl bg-white"
            style={{ height: "calc(100vh - 90px)", border: 0 }}
          />

        ) : (
          <iframe
            src={fallbackSrc}
            title={`${processo!.nome} — análise`}
            className="w-full border border-border rounded-xl bg-white"
            style={{ height: "calc(100vh - 90px)", border: 0 }}
          />
        )}
      </div>
    </HubShell>
  );
}
