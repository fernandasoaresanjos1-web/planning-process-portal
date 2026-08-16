import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Workflow, Database, Settings, Upload, Search, ListChecks, Building2, Users, LogOut, LayoutList, BarChart2, Briefcase, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

type NavId = "geral" | "contabil" | "fiscal" | "folha" | "clientes" | "timeline" | "tarefas" | "processos";

const perfSubnav: Array<{ id: NavId; label: string }> = [
  { id: "geral",     label: "Resumo Geral" },
  { id: "contabil",  label: "Contábil" },
  { id: "fiscal",    label: "Fiscal" },
  { id: "folha",     label: "Folha / DP" },
  { id: "clientes",  label: "Por Cliente" },
  { id: "timeline",  label: "Linha do Tempo" },
  { id: "tarefas",   label: "Tarefas" },
  { id: "processos", label: "Processos" },
];

const nav = [
  { to: "/tarefas", label: "Gestão de Tarefas", icon: ListChecks },
  { to: "/processos", label: "Processos", icon: Workflow },
  { to: "/carteira", label: "Carteira de Clientes", icon: Briefcase },
  { to: "/consultas", label: "Consultas", icon: Search },
  { to: "/base-empresas", label: "Base Empresas", icon: Building2 },
  { to: "/base-informacoes-empresas", label: "Base Info Empresas", icon: LayoutList },
  { to: "/dados", label: "Base de dados", icon: Database },
  { to: "/admin", label: "Atualizar HTML", icon: Upload },
];

const adminNav = [{ to: "/usuarios", label: "Usuários", icon: Users }];

// Contexto global para passar navId ao DashboardPerformanceV2
import { createContext, useContext } from "react";
export const PerfNavContext = createContext<{ navId: NavId; setNavId: (id: NavId) => void }>({
  navId: "geral",
  setNavId: () => {},
});
export function usePerfNav() { return useContext(PerfNavContext); }

export function HubShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { nome, user, isAdmin, signOut } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [perfNavId, setPerfNavId] = useState<NavId>("geral");
  const [perfOpen, setPerfOpen] = useState(false);
  const navigate = useNavigate();
  const items = [...nav, ...(isAdmin ? adminNav : [])];
  const isPerfActive = path.startsWith("/performance");

  return (
    <PerfNavContext.Provider value={{ navId: perfNavId, setNavId: setPerfNavId }}>
      <div className="flex min-h-screen bg-background">
        <aside
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          style={{ width: expanded ? 220 : 56, transition: "width 250ms ease" }}
          className="shrink-0 overflow-hidden bg-[#0C0C0C] text-white sticky top-0 h-screen flex flex-col"
        >
          <div className="px-3 py-6 flex items-center gap-3 border-b border-white/5">
            <div className="w-10 h-10 shrink-0 rounded-[10px] bg-brand flex items-center justify-center font-extrabold text-charcoal text-base">P</div>
            {expanded && (
              <div className="min-w-0">
                <div className="text-[13px] font-bold leading-tight whitespace-nowrap">Planning Hub</div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold whitespace-nowrap">Operacional</div>
              </div>
            )}
          </div>

          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
            {/* Dashboard Acessórias — item expansível */}
            <div>
              <button
                onClick={() => {
                  if (!isPerfActive) void navigate({ to: "/performance" });
                  if (expanded) setPerfOpen(o => !o);
                  else { setExpanded(true); setPerfOpen(true); }
                }}
                title="Dashboard Acessórias"
                className={`w-full flex items-center gap-3 ${expanded ? "px-3" : "px-2 justify-center"} py-2.5 rounded-md text-[13px] font-medium transition ${
                  isPerfActive ? "bg-brand text-charcoal" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <BarChart2 size={16} className="shrink-0" />
                {expanded && (
                  <>
                    <span className="whitespace-nowrap flex-1 text-left">Dashboard Acessórias</span>
                    <ChevronDown size={12} className={`shrink-0 transition-transform ${perfOpen ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>

              {/* Subitens */}
              {expanded && isPerfActive && (
                <div className="mt-1 ml-4 space-y-0.5 border-l border-white/10 pl-3">
                  {perfSubnav.map(sub => {
                    const isSubActive = isPerfActive && perfNavId === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setPerfNavId(sub.id);
                          if (!isPerfActive) void navigate({ to: "/performance" });
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-[12px] font-medium transition whitespace-nowrap ${
                          isSubActive ? "text-brand font-semibold" : "text-white/50 hover:text-white/80"
                        }`}
                      >
                        {isSubActive && <span className="mr-1">•</span>}{sub.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Demais itens */}
            {items.map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  title={n.label}
                  className={`flex items-center gap-3 ${expanded ? "px-3" : "px-2 justify-center"} py-2.5 rounded-md text-[13px] font-medium transition ${
                    active ? "bg-brand text-charcoal" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {expanded && <span className="whitespace-nowrap">{n.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="px-2 py-3 border-t border-white/5 space-y-2">
            {expanded && (
              <div className="text-[11px] text-white/70 px-1">
                <div className="font-semibold text-white truncate">{nome ?? user?.email}</div>
                <div className="text-white/40 truncate">{user?.email}</div>
              </div>
            )}
            <button
              onClick={() => signOut()}
              title="Sair"
              className="w-full flex items-center justify-center gap-2 rounded-md bg-white/5 hover:bg-white/10 text-white/80 text-[12px] py-1.5"
            >
              <LogOut size={13} /> {expanded && "Sair"}
            </button>
            {expanded && (
              <div className="flex items-center gap-1 text-white/30 text-[10px] px-1">
                <Settings size={11} /> v0.2
              </div>
            )}
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </PerfNavContext.Provider>
  );
}
