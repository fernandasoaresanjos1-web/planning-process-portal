import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export function ForcePasswordChange({ onDone }: { onDone: () => void }) {
  const { user, signOut } = useAuth();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p1.length < 6) return toast.error("Mínimo 6 caracteres.");
    if (p1 !== p2) return toast.error("As senhas não coincidem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      if (user) {
        await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", user.id);
      }
      toast.success("Senha atualizada.");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao atualizar senha");
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
        <div>
          <div className="text-sm font-bold text-charcoal">Definir nova senha</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
            Primeiro acesso · {user?.email}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Por segurança, defina uma nova senha antes de continuar.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-charcoal">Nova senha</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            minLength={6}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-charcoal">Confirmar senha</label>
          <input
            type="password"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand py-2 text-sm font-bold text-charcoal disabled:opacity-60"
        >
          {loading ? "Salvando…" : "Salvar e continuar"}
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full text-[11px] text-muted-foreground hover:underline"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
