import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import PdcaMonitor from "@/components/PdcaMonitor";

export const Route = createFileRoute("/processo/pdca-monitoramento")({
  head: () => ({
    meta: [
      { title: "PDCA — Monitoramento por Grupo — Planning Hub" },
      { name: "description", content: "Monitoramento PDCA por grupo econômico, com cruzamento S3D." },
    ],
  }),
  component: () => (
    <HubShell>
      <PdcaMonitor />
    </HubShell>
  ),
});
