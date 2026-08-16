import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import AuditoriaCadastral from "@/components/AuditoriaCadastral";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/processo/auditoria-cadastral")({
  head: () => ({ meta: [{ title: "Auditoria Cadastral — Planning Hub" }] }),
  component: AuditoriaPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function AuditoriaPage() {
  return (
    <HubShell>
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Link to="/processos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-charcoal mb-3">
          <ChevronLeft size={14} /> Voltar para Processos
        </Link>
        <AuditoriaCadastral />
      </div>
    </HubShell>
  );
}
