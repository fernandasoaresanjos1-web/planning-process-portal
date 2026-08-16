import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import IrpjCsll from "@/components/IrpjCsll";

export const Route = createFileRoute("/processo/irpj-csll")({
  head: () => ({
    meta: [
      { title: "IRPJ/CSLL — Planning Hub" },
      { name: "description", content: "Controle de autopagamento e domésticas de IRPJ/CSLL por competência." },
    ],
  }),
  component: () => (
    <HubShell>
      <IrpjCsll />
    </HubShell>
  ),
});
