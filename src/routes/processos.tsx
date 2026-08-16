import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { HubShell } from "@/components/HubShell";
import { listProcessos } from "@/lib/hub-data";
import { ArrowUpRight } from "lucide-react";

const processosQO = queryOptions({ queryKey: ["processos"], queryFn: listProcessos });

export const Route = createFileRoute("/processos")({
  head: () => ({ meta: [{ title: "Processos — Planning Hub" }] }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(processosQO);
  },
  component: ProcessosPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

type Categoria = {
  id: string;
  nome: string;
  slugs: string[];
};

const categorias: Categoria[] = [
  { id: "todos", nome: "Todos", slugs: [] },
  { id: "contabeis", nome: "Contábeis", slugs: ["entregas-contabil", "irpj-csll", "composicao-contabil"] },
  { id: "fiscal", nome: "Fiscal", slugs: ["fiscal-estados", "procuracoes", "irpj-csll-lp"] },
  { id: "folha", nome: "Folha", slugs: [] },
  { id: "sittax", nome: "Sittax", slugs: ["sittax-sn", "sittax-monitora", "monitor-dte", "sittax-token"] },
  { id: "acessorias", nome: "Acessórias", slugs: ["auditoria-cadastral", "validacao-cadastro", "controle-tags", "obrigacoes-acessorias", "gestao-obrigacoes"] },
  { id: "saam", nome: "SAAM", slugs: ["saam"] },
  { id: "sistemas-gerais", nome: "Sistemas Gerais", slugs: ["pdca-monitoramento"] },
];

// Processos virtuais (não vivem na tabela `processos` — apontam para rotas dedicadas)
const processosVirtuais: Array<{ slug: string; nome: string; descricao: string; cor: string; to: string }> = [
  {
    slug: "sittax-token",
    nome: "Sittax Token",
    descricao: "Controle de certificados digitais instalados via ByToken e Agilizza.",
    cor: "#16a34a",
    to: "/certificados",
  },
  {
    slug: "fiscal-estados",
    nome: "Fiscal por Estado",
    descricao: "Distribuição da base com TAG Fiscal por UF, regime e equipe.",
    cor: "#F59E0B",
    to: "/processo/fiscal-estados",
  },
  {
    slug: "procuracoes",
    nome: "Procurações x Acessórias",
    descricao: "Empresas fiscal da base de Acessórias com e sem procuração cadastrada.",
    cor: "#F59E0B",
    to: "/processo/procuracoes",
  },
  {
    slug: "irpj-csll-lp",
    nome: "IRPJ/CSLL Lucro Presumido",
    descricao: "Cruzamento mensal das empresas Lucro Presumido da base com o controle gerencial de balancetes.",
    cor: "#F59E0B",
    to: "/processo/irpj-csll-lp",
  },
  {
    slug: "irpj-csll",
    nome: "IRPJ / CSLL",
    descricao: "Controle de autopagamento e domésticas de IRPJ/CSLL por competência.",
    cor: "#8B5CF6",
    to: "/processo/irpj-csll",
  },
  {
    slug: "composicao-contabil",
    nome: "Composição Contábil",
    descricao: "Composição de balancetes contábeis por empresa e regime.",
    cor: "#0EA5E9",
    to: "/processo/composicao-contabil",
  },
  {
    slug: "obrigacoes-acessorias",
    nome: "Obrigações Acessórias",
    descricao: "Controle das obrigações acessórias por departamento, com análise de risco (multa sem robô).",
    cor: "#0AE18C",
    to: "/processo/obrigacoes-acessorias",
  },
  {
    slug: "gestao-obrigacoes",
    nome: "Gestão de Obrigações — Sistema de Auditoria",
    descricao: "Auditoria das obrigações cadastradas no Acessórias contra a base esperada por regime, periodicidade contábil e folha.",
    cor: "#7C3AED",
    to: "/processo/gestao-obrigacoes",
  },
  {
    slug: "pdca-monitoramento",
    nome: "PDCA — Monitoramento por Grupo",
    descricao: "Monitoramento PDCA por grupo econômico, com cruzamento S3D e situação por departamento.",
    cor: "#F59E0B",
    to: "/processo/pdca-monitoramento",
  },
];



function ProcessosPage() {
  const { data: processosDb } = useSuspenseQuery(processosQO);
  const [cat, setCat] = useState("todos");

  const processos = useMemo(() => {
    const virtuais = processosVirtuais.map((v) => ({
      slug: v.slug,
      nome: v.nome,
      descricao: v.descricao,
      cor: v.cor,
      icone: null,
      ordem: 999,
      __to: v.to,
    }));
    return [...processosDb, ...virtuais] as Array<(typeof processosDb)[number] & { __to?: string }>;
  }, [processosDb]);

  const visiveis = useMemo(() => {
    const c = categorias.find((x) => x.id === cat);
    if (!c || c.slugs.length === 0) return processos;
    return processos.filter((p) => c.slugs.includes(p.slug));
  }, [processos, cat]);

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Catálogo</div>
        <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Processos</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">Clique em um processo para abrir o dashboard original.</p>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
          {categorias.map((c) => {
            const ativo = cat === c.id;
            const count = c.id === "todos" ? processos.length : processos.filter((p) => c.slugs.includes(p.slug)).length;
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-4 py-2 rounded-md text-[13px] font-semibold transition flex items-center gap-2 ${
                  ativo ? "bg-charcoal text-white" : "bg-muted text-charcoal hover:bg-muted/70"
                }`}
              >
                {c.nome}
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${ativo ? "bg-white/20" : "bg-background text-charcoal"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {visiveis.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Nenhum processo nesta categoria.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {visiveis.map((p) => {
              const linkProps = p.__to
                ? ({ to: p.__to } as any)
                : ({ to: "/processo/$slug", params: { slug: p.slug } } as any);
              return (
                <Link
                  key={p.slug}
                  {...linkProps}
                  className="group bg-card border border-border rounded-xl p-6 hover:border-charcoal hover:shadow-lg transition relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: p.cor }} />
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-3" style={{ background: p.cor + "22", color: p.cor }}>{p.slug}</div>
                      <h2 className="text-lg font-bold text-charcoal mb-1">{p.nome}</h2>
                      <p className="text-[13px] text-muted-foreground">{p.descricao}</p>
                    </div>
                    <ArrowUpRight className="text-muted-foreground group-hover:text-charcoal transition" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </HubShell>
  );
}
