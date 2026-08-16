import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listTarefasFixas from "./tools/list-tarefas-fixas";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "planning-hub-mcp",
  title: "Planning Hub MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do Planning Hub. Use `whoami` para verificar o usuário conectado e `list_tarefas_fixas` para consultar as tarefas recorrentes visíveis a esse usuário (respeita RLS).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listTarefasFixas],
});
