import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "whoami",
  title: "Quem sou eu",
  description: "Retorna o usuário autenticado no Planning Hub e seus papéis.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = ctx.getUserId();
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("nome, email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const payload = {
      user_id: userId,
      email: ctx.getUserEmail() ?? profile?.email ?? null,
      nome: profile?.nome ?? null,
      roles: (roles ?? []).map((r: { role: string }) => r.role),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
