import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import { ArrowLeft, ExternalLink } from "lucide-react";

const consultas: Record<string, { nome: string; descricao: string }> = {
  "matriz-raci": {
    nome: "Matriz RACI - Chamados",
    descricao: "Matriz de responsabilidades para atendimento de chamados.",
  },
};

export const Route = createFileRoute("/consulta/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${consultas[params.slug]?.nome ?? "Consulta"} — Planning Hub` }],
  }),
  component: ConsultaPage,
});

function ConsultaPage() {
  const { slug } = Route.useParams();
  const c = consultas[slug];
  const src = `/consultas/${slug}.html`;

  if (!c) {
    return (
      <HubShell>
        <div className="max-w-[1280px] mx-auto px-8 py-8">
          <Link to="/consultas" className="text-sm text-muted-foreground">← Voltar</Link>
          <p className="mt-6">Consulta não encontrada.</p>
        </div>
      </HubShell>
    );
  }

  return (
    <HubShell>
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/consultas" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
              <ArrowLeft size={13} /> Consultas
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <h1 className="text-[15px] font-bold text-charcoal leading-tight">{c.nome}</h1>
          </div>
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-charcoal border border-border rounded-md px-3 py-1.5 hover:bg-secondary">
            Abrir em tela cheia <ExternalLink size={12} />
          </a>
        </div>
        <iframe
          src={src}
          title={c.nome}
          className="w-full border border-border rounded-xl bg-white"
          style={{ height: "calc(100vh - 90px)" }}
        />
      </div>
    </HubShell>
  );
}
