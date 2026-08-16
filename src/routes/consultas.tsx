import { createFileRoute, Link } from "@tanstack/react-router";
import { HubShell } from "@/components/HubShell";
import { ArrowUpRight, Grid3x3, Users, Building2 } from "lucide-react";

export const Route = createFileRoute("/consultas")({
  head: () => ({ meta: [{ title: "Consultas — Planning Hub" }] }),
  component: ConsultasPage,
});

type Consulta = {
  slug: string;
  nome: string;
  descricao: string;
  cor: string;
  icone: typeof Grid3x3;
  to: "/consulta/$slug" | "/consulta/donos-tags" | "/consulta/empresas";
  params?: { slug: string };
};

const consultas: Consulta[] = [
  {
    slug: "empresas",
    nome: "Empresas x TAG",
    descricao:
      "Busca por CNPJ ou Grupo Econômico. Mostra TAGs, coordenador e supervisores responsáveis por cada área (DP, Fiscal, Contábil).",
    cor: "#14C8FA",
    icone: Building2,
    to: "/consulta/empresas",
  },
  {
    slug: "donos-tags",
    nome: "Gestão x TAG",
    descricao:
      "Coordenadores, gerentes e supervisores responsáveis por cada TAG/equipe. Sincronizada com o HTML de Controle de TAGs.",
    cor: "#7C3AED",
    icone: Users,
    to: "/consulta/donos-tags",
  },
  {
    slug: "matriz-raci",
    nome: "Matriz RACI - Chamados",
    descricao: "Matriz de responsabilidades para atendimento de chamados.",
    cor: "#0AE18C",
    icone: Grid3x3,
    to: "/consulta/$slug",
    params: { slug: "matriz-raci" },
  },
];

function ConsultasPage() {
  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Acesso aberto</div>
        <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Consultas</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-7">
          Área de consulta liberada para visualização de indicadores e processos.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {consultas.map((c) => {
            const Icon = c.icone;
            return (
              <Link
                key={c.slug}
                {...(c.params
                  ? { to: "/consulta/$slug" as const, params: c.params }
                  : { to: c.to as "/consulta/donos-tags" | "/consulta/empresas" })}
                className="group bg-card border border-border rounded-xl p-6 hover:border-charcoal hover:shadow-lg transition relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: c.cor }} />
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-3" style={{ background: c.cor + "22", color: c.cor }}>
                      <Icon size={12} /> {c.slug}
                    </div>
                    <h2 className="text-lg font-bold text-charcoal mb-1">{c.nome}</h2>
                    <p className="text-[13px] text-muted-foreground">{c.descricao}</p>
                  </div>
                  <ArrowUpRight className="text-muted-foreground group-hover:text-charcoal transition" />
                </div>
              </Link>

            );
          })}
        </div>
      </div>
    </HubShell>
  );
}
