import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthDetails = {
  client?: { name?: string; logo_uri?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
} | null;

// Beta namespace; provide a minimal typed shape locally.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  component: Consent,
});

function Consent() {
  const { authorization_id } = Route.useSearch();
  const [details, setDetails] = useState<AuthDetails>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authorization_id) {
      setError("Parâmetro authorization_id ausente.");
      setLoading(false);
      return;
    }
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setError("Faça login para continuar.");
        setLoading(false);
        return;
      }
      const { data, error } = await oauthApi().getAuthorizationDetails(authorization_id);
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      setLoading(false);
    })();
  }, [authorization_id]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0C0C0C] px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[10px] bg-brand flex items-center justify-center font-extrabold text-charcoal text-lg">
            P
          </div>
          <div>
            <div className="text-sm font-bold text-charcoal leading-tight">Planning Hub</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Autorizar aplicativo
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando autorização…</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {!loading && !error && details && (
          <>
            <p className="text-sm text-charcoal">
              <strong>{details.client?.name ?? "Um aplicativo"}</strong> quer acessar o Planning Hub em seu nome.
              Ele poderá usar as ferramentas MCP com as suas permissões (RLS aplicada).
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(true)}
                className="flex-1 rounded-md bg-brand py-2 text-sm font-bold text-charcoal disabled:opacity-60"
              >
                {busy ? "Aguarde…" : "Aprovar"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(false)}
                className="flex-1 rounded-md border border-charcoal/20 py-2 text-sm font-semibold text-charcoal disabled:opacity-60"
              >
                Negar
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
