import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Okr-Key, X-Okr-Autor",
  "Access-Control-Max-Age": "86400",
};

function svc() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export const Route = createFileRoute("/api/public/okr-sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const chave = url.searchParams.get("chave") ?? "painel";
        const { data, error } = await svc()
          .from("okr_estado")
          .select("dados, atualizado_em")
          .eq("chave", chave)
          .maybeSingle();
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        return new Response(
          JSON.stringify({ dados: data?.dados ?? {}, atualizado_em: data?.atualizado_em ?? null }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      },

      POST: async ({ request }) => {
        const expectedKey = process.env.OKR_SYNC_KEY;
        const providedKey = request.headers.get("x-okr-key") ?? "";
        if (!expectedKey || providedKey.length !== expectedKey.length ||
            !providedKey || providedKey !== expectedKey) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const url = new URL(request.url);
        const chave = url.searchParams.get("chave") ?? "painel";
        if (!["painel", "implantacao"].includes(chave)) {
          return new Response(JSON.stringify({ error: "chave inválida" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "json inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const autor = request.headers.get("x-okr-autor") ?? null;
        const { error } = await svc()
          .from("okr_estado")
          .upsert(
            { chave, dados: body as object, atualizado_em: new Date().toISOString(), atualizado_por: autor },
            { onConflict: "chave" },
          );
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
