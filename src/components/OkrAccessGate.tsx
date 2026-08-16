import { useEffect, useState } from "react";
import { autenticar, gravarSessao, lerSessao, limparSessao, listarAcessos, removerAcesso, salvarAcesso, type OkrAcesso, type OkrSessao } from "@/lib/okr-acessos";
import { LogOut, Settings, Trash2, UserPlus } from "lucide-react";

type Props = { children: (session: OkrSessao, logout: () => void) => React.ReactNode };

export function OkrAccessGate({ children }: Props) {
  const [sessao, setSessao] = useState<OkrSessao | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    setSessao(lerSessao());
    setCarregado(true);
  }, []);

  if (!carregado) return null;

  const logout = () => {
    limparSessao();
    setSessao(null);
  };

  if (sessao) return <>{children(sessao, logout)}</>;
  return <LoginScreen onEntrar={(s) => { gravarSessao(s); setSessao(s); }} />;
}

function LoginScreen({ onEntrar }: { onEntrar: (s: OkrSessao) => void }) {
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<"gestor" | "colaborador">("colaborador");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [abrirAdmin, setAbrirAdmin] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const acesso = await autenticar(nome, perfil);
      if (!acesso) {
        setErro("Usuário não cadastrado, inativo ou perfil diferente do permitido.");
        return;
      }
      onEntrar({ nome: acesso.nome, perfil, em: Date.now() });
    } catch (err: any) {
      setErro(err?.message ?? "Falha ao validar acesso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 px-4">
      <div className="w-full max-w-md bg-white border border-border rounded-2xl shadow-xl p-8">
        <div className="w-12 h-12 rounded-xl bg-emerald-400 flex items-center justify-center mb-5">
          <span className="text-2xl font-black text-charcoal">O</span>
        </div>
        <h1 className="text-2xl font-bold text-charcoal">Painel de OKRs</h1>
        <p className="text-sm text-muted-foreground mt-1">Acesso controlado pela equipe</p>

        <form onSubmit={entrar} className="mt-6 space-y-4">
          <div>
            <label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Seu nome</label>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Ex: Fernanda"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Perfil</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["gestor", "colaborador"] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPerfil(p)}
                  className={`border rounded-lg py-2.5 text-sm font-semibold capitalize transition ${
                    perfil === p ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-border bg-white text-charcoal hover:bg-secondary"
                  }`}
                >
                  {p === "gestor" ? "👔 Gestor" : "👤 Colaborador"}
                </button>
              ))}
            </div>
          </div>

          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{erro}</p>}

          <button
            type="submit"
            disabled={loading || !nome.trim()}
            className="w-full bg-emerald-400 hover:bg-emerald-500 disabled:opacity-50 text-charcoal font-bold rounded-lg py-3 text-sm"
          >
            {loading ? "Validando..." : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => setAbrirAdmin(true)}
            className="w-full text-xs text-muted-foreground hover:text-charcoal flex items-center justify-center gap-1.5"
          >
            <Settings size={12} /> Gerenciar usuários
          </button>
        </form>
      </div>

      {abrirAdmin && <AdminUsuarios onFechar={() => setAbrirAdmin(false)} />}
    </div>
  );
}

function AdminUsuarios({ onFechar }: { onFechar: () => void }) {
  const [lista, setLista] = useState<OkrAcesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<"gestor" | "colaborador">("colaborador");

  async function recarregar() {
    setLoading(true);
    try {
      setLista(await listarAcessos());
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { recarregar(); }, []);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      await salvarAcesso({ nome, perfil, ativo: true });
      setNome("");
      await recarregar();
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao salvar.");
    }
  }

  async function toggleAtivo(u: OkrAcesso) {
    await salvarAcesso({ id: u.id, nome: u.nome, perfil: u.perfil, ativo: !u.ativo });
    recarregar();
  }
  async function trocarPerfil(u: OkrAcesso, p: "gestor" | "colaborador") {
    await salvarAcesso({ id: u.id, nome: u.nome, perfil: p, ativo: u.ativo });
    recarregar();
  }
  async function excluir(u: OkrAcesso) {
    if (!confirm(`Remover ${u.nome}?`)) return;
    await removerAcesso(u.id);
    recarregar();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-charcoal">Usuários do Painel de OKRs</h2>
          <button onClick={onFechar} className="text-sm text-muted-foreground hover:text-charcoal">Fechar</button>
        </div>

        <form onSubmit={adicionar} className="px-6 py-4 border-b border-border bg-secondary/30 flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm" placeholder="Nome completo" />
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Perfil</label>
            <select value={perfil} onChange={(e) => setPerfil(e.target.value as any)} className="border border-border rounded-md px-3 py-2 text-sm">
              <option value="colaborador">Colaborador</option>
              <option value="gestor">Gestor</option>
            </select>
          </div>
          <button className="bg-emerald-400 hover:bg-emerald-500 text-charcoal font-bold rounded-md px-4 py-2 text-sm inline-flex items-center gap-1.5">
            <UserPlus size={14} /> Adicionar
          </button>
        </form>

        <div className="flex-1 overflow-auto">
          {erro && <p className="text-xs text-red-600 px-6 py-2">{erro}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground px-6 py-6">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 py-6">Nenhum usuário cadastrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-6 py-2">Nome</th>
                  <th className="text-left px-3 py-2">Perfil</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-6 py-2 font-medium text-charcoal">{u.nome}</td>
                    <td className="px-3 py-2">
                      <select value={u.perfil} onChange={(e) => trocarPerfil(u, e.target.value as any)} className="border border-border rounded px-2 py-1 text-xs">
                        <option value="colaborador">Colaborador</option>
                        <option value="gestor">Gestor</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleAtivo(u)} className={`text-[11px] font-bold px-2 py-1 rounded ${u.ativo ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                        {u.ativo ? "ATIVO" : "INATIVO"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => excluir(u)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function OkrSessionBadge({ sessao, onLogout }: { sessao: OkrSessao; onLogout: () => void }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-muted-foreground border border-border rounded-md px-2 py-1 bg-white">
      <span className="font-semibold text-charcoal">{sessao.nome}</span>
      <span className="text-emerald-700 bg-emerald-50 px-1.5 rounded">{sessao.perfil}</span>
      <button onClick={onLogout} className="hover:text-charcoal inline-flex items-center gap-1"><LogOut size={11} /> sair</button>
    </div>
  );
}
