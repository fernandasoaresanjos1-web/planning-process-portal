import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import SittaxMonitora from "@/components/SittaxMonitora";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/processo/sittax-monitora")({
  head: () => ({ meta: [{ title: "Sittax Monitora — Planning Hub" }] }),
  component: SittaxMonitoraPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

function SittaxMonitoraPage() {
  return (
    <HubShell>
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Link to="/processos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-charcoal mb-3">
          <ChevronLeft size={14} /> Voltar para Processos
        </Link>
        <SittaxMonitora />
      </div>
    </HubShell>
  );
}
