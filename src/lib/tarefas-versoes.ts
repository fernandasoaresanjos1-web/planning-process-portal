import { supabase } from "@/integrations/supabase/client";

export type TarefaVersao = {
  id: string;
  tarefa_slug: string;
  arquivo_nome: string;
  html_content: string;
  tamanho_bytes: number;
  ativo: boolean;
  observacao: string | null;
  created_at: string;
};

export async function listVersoesTarefa(slug: string): Promise<Omit<TarefaVersao, "html_content">[]> {
  const { data, error } = await supabase
    .from("tarefas_versoes")
    .select("id,tarefa_slug,arquivo_nome,tamanho_bytes,ativo,observacao,created_at")
    .eq("tarefa_slug", slug)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Omit<TarefaVersao, "html_content">[];
}

export async function listAllVersoesTarefa(): Promise<Omit<TarefaVersao, "html_content">[]> {
  const { data, error } = await supabase
    .from("tarefas_versoes")
    .select("id,tarefa_slug,arquivo_nome,tamanho_bytes,ativo,observacao,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Omit<TarefaVersao, "html_content">[];
}

export async function getVersaoAtivaHtmlTarefa(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("tarefas_versoes")
    .select("html_content")
    .eq("tarefa_slug", slug)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.html_content as string) ?? null;
}

export async function uploadVersaoTarefa(args: {
  slug: string;
  arquivo_nome: string;
  html_content: string;
  observacao?: string;
}) {
  const { data, error } = await supabase
    .from("tarefas_versoes")
    .insert({
      tarefa_slug: args.slug,
      arquivo_nome: args.arquivo_nome,
      html_content: args.html_content,
      tamanho_bytes: new Blob([args.html_content]).size,
      ativo: true,
      observacao: args.observacao ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: deactivateError } = await supabase
    .from("tarefas_versoes")
    .update({ ativo: false })
    .eq("tarefa_slug", args.slug)
    .neq("id", data.id);
  if (deactivateError) throw deactivateError;
}

export async function ativarVersaoTarefa(id: string) {
  const { data: versao, error: fetchError } = await supabase
    .from("tarefas_versoes")
    .select("tarefa_slug")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from("tarefas_versoes").update({ ativo: true }).eq("id", id);
  if (error) throw error;

  const { error: deactivateError } = await supabase
    .from("tarefas_versoes")
    .update({ ativo: false })
    .eq("tarefa_slug", versao.tarefa_slug)
    .neq("id", id);
  if (deactivateError) throw deactivateError;
}

export async function excluirVersaoTarefa(id: string) {
  const { error } = await supabase.from("tarefas_versoes").delete().eq("id", id);
  if (error) throw error;
}
