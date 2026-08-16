import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import MatrizRaci from "@/components/MatrizRaci";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/consulta/matriz-raci")({
  head: () => ({ meta: [{ title: "Matriz RACI - Chamados — Planning Hub" }] }),
  component: MatrizRaciPage,
});

function MatrizRaciPage() {
  return (
    <HubShell>
      <div className="w-full px-4 py-3">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Link to="/consultas" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-charcoal">
            <ArrowLeft size={13} /> Consultas
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <h1 className="text-[15px] font-bold text-charcoal leading-tight">Matriz RACI - Chamados</h1>
        </div>
        <div className="w-full bg-white border border-border rounded-xl overflow-hidden">
          <MatrizRaci />
        </div>
      </div>
    </HubShell>
  );
}
