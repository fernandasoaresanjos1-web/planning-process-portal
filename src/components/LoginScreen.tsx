import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { ensureFirstAdmin, hasAnyAdmin } from "@/lib/auth.functions";
import { toast } from "sonner";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsFirstAdmin, setNeedsFirstAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const checkAdmin = useServerFn(hasAnyAdmin);
  const createFirst = useServerFn(ensureFirstAdmin);

  useEffect(() => {
    checkAdmin()
      .then((r) => setNeedsFirstAdmin(!r.exists))
      .finally(() => setChecking(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (needsFirstAdmin) {
        await createFirst({ data: { email, password, nome: nome || email } });
        toast.success("Administrador criado. Entrando…");
        await signIn(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha no acesso");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0C0C0C] px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[10px] bg-brand flex items-center justify-center font-extrabold text-charcoal text-lg">
            P
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-charcoal">Planning Hub</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {needsFirstAdmin ? "Configurar 1º admin" : "Acesso ao portal"}
            </div>
          </div>
        </div>

        {checking ? (
          <div className="text-sm text-muted-foreground">Verificando…</div>
        ) : (
          <>
            {needsFirstAdmin && (
              <div>
                <label className="text-xs font-semibold text-charcoal">Nome</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-charcoal">E-mail</label>
              <input
                type="email"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-charcoal">Senha</label>
              <input
                type="password"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand py-2 text-sm font-bold text-charcoal disabled:opacity-60"
            >
              {loading ? "Aguarde…" : needsFirstAdmin ? "Criar admin e entrar" : "Entrar"}
            </button>
            {!needsFirstAdmin && (
              <p className="text-[11px] text-muted-foreground text-center">
                Esqueceu o acesso? Peça ao administrador.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}
