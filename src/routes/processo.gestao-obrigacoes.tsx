import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import GestaoObrigacoes from "@/components/GestaoObrigacoes";

export const Route = createFileRoute("/processo/gestao-obrigacoes")({
  head: () => ({
    meta: [
      { title: "Gestão de Obrigações — Sistema de Auditoria" },
      { name: "description", content: "Auditoria das obrigações cadastradas no Acessórias contra a base esperada por regime, periodicidade contábil e folha." },
      { property: "og:title", content: "Gestão de Obrigações — Sistema de Auditoria" },
      { property: "og:description", content: "Cruzamento automático entre o motor de regras e as obrigações cadastradas por empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <HubShell>
      <GestaoObrigacoes />
    </HubShell>
  ),
});
