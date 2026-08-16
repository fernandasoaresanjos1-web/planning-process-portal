import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import ComposicaoContabil from "@/components/ComposicaoContabil";

export const Route = createFileRoute("/processo/composicao-contabil")({
  head: () => ({
    meta: [
      { title: "Composição Contábil — Planning Hub" },
      { name: "description", content: "Composição de balancetes contábeis por empresa e regime." },
    ],
  }),
  component: () => (
    <HubShell>
      <ComposicaoContabil />
    </HubShell>
  ),
});
