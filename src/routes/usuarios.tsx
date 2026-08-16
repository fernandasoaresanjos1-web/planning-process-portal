import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import {
  listUsuarios,
  criarUsuario,
  alterarPapel,
  removerUsuario,
  resetSenha,
} from "@/lib/auth.functions";
import { toast } from "sonner";
import { Trash2, KeyRound, UserPlus } from "lucide-react";

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Planning Hub" }] }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsuarios);
  const fnCriar = useServerFn(criarUsuario);
  const fnPapel = useServerFn(alterarPapel);
  const fnRemover = useServerFn(removerUsuario);
  const fnReset = useServerFn(resetSenha);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });

  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "colaborador" as const });

  if (!isAdmin) {
    return (
      <HubShell>
        <div className="max-w-3xl mx-auto p-10 text-charcoal">
          <h1 className="text-2xl font-extrabold">Acesso restrito</h1>
          <p className="text-muted-foreground mt-2">Apenas administradores podem gerenciar usuários.</p>
        </div>
      </HubShell>
    );
  }

  const reload = () => qc.invalidateQueries({ queryKey: ["usuarios"] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fnCriar({ data: form });
      toast.success("Usuário criado");
      setForm({ nome: "", email: "", password: "", role: "colaborador" });
      reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao criar");
    }
  };

  return (
    <HubShell>
      <div className="max-w-[1100px] mx-auto px-8 py-8">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Configuração</div>
        <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Usuários e permissões</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-7">
          Crie acessos, ajuste papéis (admin · gestor · colaborador) e redefina senhas.
        </p>

        <form onSubmit={submit} className="rounded-xl border bg-card p-5 grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
          <input
            placeholder="Nome"
            className="rounded-md border px-3 py-2 text-sm md:col-span-1"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="E-mail"
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Senha (mín 6)"
            className="rounded-md border px-3 py-2 text-sm"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={6}
            required
          />
          <div className="flex gap-2">
            <select
              className="rounded-md border px-2 py-2 text-sm flex-1"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}
            >
              <option value="colaborador">Colaborador</option>
              <option value="gestor">Gestor</option>
              <option value="admin">Admin</option>
            </select>
            <button className="rounded-md bg-brand px-3 py-2 text-sm font-bold text-charcoal flex items-center gap-1">
              <UserPlus size={14} /> Criar
            </button>
          </div>
        </form>

        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-left px-4 py-2">E-mail</th>
                <th className="text-left px-4 py-2">Papel</th>
                <th className="text-right px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Carregando…</td>
                </tr>
              )}
              {users.map((u: any) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2 font-medium text-charcoal">{u.nome ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2">
                    <select
                      defaultValue={u.roles[0] ?? "colaborador"}
                      onChange={async (e) => {
                        try {
                          await fnPapel({ data: { user_id: u.id, role: e.target.value as any } });
                          toast.success("Papel atualizado");
                          reload();
                        } catch (err: any) {
                          toast.error(err?.message ?? "Falha");
                        }
                      }}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      <option value="colaborador">Colaborador</option>
                      <option value="gestor">Gestor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      title="Redefinir senha"
                      className="inline-flex items-center gap-1 text-xs text-charcoal hover:underline mr-3"
                      onClick={async () => {
                        const p = prompt("Nova senha (mín 6 caracteres):");
                        if (!p || p.length < 6) return;
                        try {
                          await fnReset({ data: { user_id: u.id, password: p } });
                          toast.success("Senha redefinida");
                        } catch (err: any) {
                          toast.error(err?.message ?? "Falha");
                        }
                      }}
                    >
                      <KeyRound size={13} /> Senha
                    </button>
                    {u.id !== user?.id && (
                      <button
                        title="Remover"
                        className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                        onClick={async () => {
                          if (!confirm(`Remover ${u.email}?`)) return;
                          try {
                            await fnRemover({ data: { user_id: u.id } });
                            toast.success("Removido");
                            reload();
                          } catch (err: any) {
                            toast.error(err?.message ?? "Falha");
                          }
                        }}
                      >
                        <Trash2 size={13} /> Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </HubShell>
  );
}
