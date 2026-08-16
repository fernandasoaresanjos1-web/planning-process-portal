import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import DashboardPerformanceV2 from "@/components/DashboardPerformanceV2";

export const Route = createFileRoute("/performance")({
  head: () => ({
    meta: [
      { title: "Dashboard Acessórias — Planning Hub" },
      { name: "description", content: "Performance de entregas, tarefas e processos integrada à API Acessórias." },
      { property: "og:title", content: "Dashboard Acessórias — Planning Hub" },
      { property: "og:description", content: "Performance de entregas, tarefas e processos por equipe e cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <HubShell>
      <DashboardPerformanceV2 />
    </HubShell>
  ),
});
