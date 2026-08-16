import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_tarefas_fixas",
  title: "Listar tarefas fixas",
  description:
    "Lista as tarefas fixas (recorrentes) visíveis para o usuário autenticado, com periodicidade e próxima execução.",
  inputSchema: {
    apenas_minhas: z
      .boolean()
      .optional()
      .describe("Se true, retorna apenas as tarefas criadas por ou atribuídas ao usuário."),
    limite: z.number().int().min(1).max(200).optional().describe("Máximo de registros (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ apenas_minhas, limite }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let q = supabase
      .from("tarefas_fixas")
      .select("id, titulo, descricao, periodicidade, proxima_execucao, ultima_execucao, processo_slug, responsavel_id, criado_por")
      .order("proxima_execucao", { ascending: true })
      .limit(limite ?? 50);
    if (apenas_minhas) {
      const uid = ctx.getUserId();
      q = q.or(`responsavel_id.eq.${uid},criado_por.eq.${uid}`);
    }
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
