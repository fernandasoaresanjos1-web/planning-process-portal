import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HubShell } from "@/components/HubShell";
import PainelOKR from "@/components/PainelOKR";
import TarefasFixas from "@/components/TarefasFixas";
import { Target, Repeat } from "lucide-react";

export const Route = createFileRoute("/tarefas")({
  head: () => ({ meta: [{ title: "Gestão de Tarefas — Planning Hub" }] }),
  component: TarefasPage,
});

function TarefasPage() {
  const [aba, setAba] = useState<"okr" | "fixas">("okr");
  return (
    <HubShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Execução</div>
        <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Gestão de Tarefas</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          Painel de OKRs e rotinas fixas — acompanhamento das atividades da equipe.
        </p>
        <div className="flex items-center gap-1 border-b border-border mb-5">
          <button
            onClick={() => setAba("okr")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px ${
              aba === "okr" ? "border-charcoal text-charcoal" : "border-transparent text-muted-foreground hover:text-charcoal"
            }`}
          >
            <Target size={14} /> Painel de OKRs
          </button>
          <button
            onClick={() => setAba("fixas")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px ${
              aba === "fixas" ? "border-charcoal text-charcoal" : "border-transparent text-muted-foreground hover:text-charcoal"
            }`}
          >
            <Repeat size={14} /> Tarefas fixas
          </button>
        </div>
        {aba === "okr" ? <PainelOKR /> : <TarefasFixas />}
      </div>
    </HubShell>
  );
}
