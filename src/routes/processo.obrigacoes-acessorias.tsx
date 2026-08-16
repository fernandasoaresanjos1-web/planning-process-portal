import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import ObrigacoesAcessorias from "@/components/ObrigacoesAcessorias";

export const Route = createFileRoute("/processo/obrigacoes-acessorias")({
  head: () => ({
    meta: [
      { title: "Obrigações Acessórias — Planning Hub" },
      { name: "description", content: "Controle de obrigações acessórias por departamento, com análise de risco (multa sem robô)." },
    ],
  }),
  component: () => (
    <HubShell>
      <ObrigacoesAcessorias />
    </HubShell>
  ),
});
