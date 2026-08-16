import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import CarteiraClientes from "@/components/CarteiraClientes";

export const Route = createFileRoute("/carteira")({
  head: () => ({
    meta: [
      { title: "Carteira de Clientes — Planning Hub" },
      { name: "description", content: "Vínculos de colaboradores e empresas com controle de vigência, pendências e histórico." },
      { property: "og:title", content: "Carteira de Clientes — Planning Hub" },
      { property: "og:description", content: "Gestão da carteira por colaborador, empresa e departamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <HubShell>
      <CarteiraClientes />
    </HubShell>
  ),
});
