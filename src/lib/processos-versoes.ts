import { supabase } from "@/integrations/supabase/client";

export type ProcessoVersao = {
  id: string;
  processo_slug: string;
  arquivo_nome: string;
  html_content: string;
  tamanho_bytes: number;
  ativo: boolean;
  observacao: string | null;
  created_at: string;
};

export async function listVersoes(slug: string): Promise<Omit<ProcessoVersao, "html_content">[]> {
  const { data, error } = await supabase
    .from("processos_versoes")
    .select("id,processo_slug,arquivo_nome,tamanho_bytes,ativo,observacao,created_at")
    .eq("processo_slug", slug)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Omit<ProcessoVersao, "html_content">[];
}

export async function listAllVersoes(): Promise<Omit<ProcessoVersao, "html_content">[]> {
  const { data, error } = await supabase
    .from("processos_versoes")
    .select("id,processo_slug,arquivo_nome,tamanho_bytes,ativo,observacao,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Omit<ProcessoVersao, "html_content">[];
}

export async function getVersaoAtivaHtml(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("processos_versoes")
    .select("html_content")
    .eq("processo_slug", slug)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.html_content as string) ?? null;
}

export async function uploadVersao(args: {
  slug: string;
  arquivo_nome: string;
  html_content: string;
  observacao?: string;
}) {
  const { data, error } = await supabase.from("processos_versoes").insert({
    processo_slug: args.slug,
    arquivo_nome: args.arquivo_nome,
    html_content: args.html_content,
    tamanho_bytes: new Blob([args.html_content]).size,
    ativo: true,
    observacao: args.observacao ?? null,
  }).select("id").single();
  if (error) throw error;

  const { error: deactivateError } = await supabase
    .from("processos_versoes")
    .update({ ativo: false })
    .eq("processo_slug", args.slug)
    .neq("id", data.id);
  if (deactivateError) throw deactivateError;
}

export async function ativarVersao(id: string) {
  const { data: versao, error: fetchError } = await supabase
    .from("processos_versoes")
    .select("processo_slug")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from("processos_versoes")
    .update({ ativo: true })
    .eq("id", id);
  if (error) throw error;

  const { error: deactivateError } = await supabase
    .from("processos_versoes")
    .update({ ativo: false })
    .eq("processo_slug", versao.processo_slug)
    .neq("id", id);
  if (deactivateError) throw deactivateError;
}

export async function excluirVersao(id: string) {
  const { error } = await supabase.from("processos_versoes").delete().eq("id", id);
  if (error) throw error;
}
