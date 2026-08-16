import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import ControleEmpresasPorTag from "@/components/ControleEmpresasPorTag";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/processo/controle-tags")({
  head: () => ({ meta: [{ title: "Controle de TAGs — Planning Hub" }] }),
  component: ControleTagsPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function ControleTagsPage() {
  return (
    <HubShell>
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Link to="/processos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-charcoal mb-3">
          <ChevronLeft size={14} /> Voltar para Processos
        </Link>
        <ControleEmpresasPorTag />
      </div>
    </HubShell>
  );
}
