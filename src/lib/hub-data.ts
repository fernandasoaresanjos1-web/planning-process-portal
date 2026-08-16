import { supabase } from "@/integrations/supabase/client";

export type Processo = {
  slug: string;
  nome: string;
  descricao: string | null;
  cor: string;
  icone: string | null;
  ordem: number;
};

export type Indicador = {
  id: string;
  processo_slug: string;
  ano: number;
  mes: number;
  indicador_chave: string;
  indicador_rotulo: string;
  valor: number;
  unidade: string;
  meta: number | null;
  created_at: string;
};

export type Importacao = {
  id: string;
  processo_slug: string;
  arquivo_nome: string;
  linhas_importadas: number;
  ano_referencia: number | null;
  mes_referencia: number | null;
  observacao: string | null;
  created_at: string;
};

export async function listProcessos(): Promise<Processo[]> {
  const { data, error } = await supabase
    .from("processos")
    .select("*")
    .order("ordem");
  if (error) throw error;
  return data as Processo[];
}

export async function getProcesso(slug: string): Promise<Processo | null> {
  const { data, error } = await supabase
    .from("processos")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Processo | null;
}

export async function listIndicadores(slug: string): Promise<Indicador[]> {
  const { data, error } = await supabase
    .from("indicadores_mensais")
    .select("*")
    .eq("processo_slug", slug)
    .order("ano", { ascending: true })
    .order("mes", { ascending: true });
  if (error) throw error;
  return data as Indicador[];
}

export async function listAllIndicadores(): Promise<Indicador[]> {
  const { data, error } = await supabase
    .from("indicadores_mensais")
    .select("*")
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data as Indicador[];
}

export async function listImportacoes(slug: string): Promise<Importacao[]> {
  const { data, error } = await supabase
    .from("historico_importacoes")
    .select("*")
    .eq("processo_slug", slug)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Importacao[];
}

export async function upsertIndicadores(rows: Omit<Indicador, "id" | "created_at">[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("indicadores_mensais")
    .upsert(rows, { onConflict: "processo_slug,ano,mes,indicador_chave" });
  if (error) throw error;
}

export async function registrarImportacao(row: {
  processo_slug: string;
  arquivo_nome: string;
  linhas_importadas: number;
  ano_referencia?: number | null;
  mes_referencia?: number | null;
  observacao?: string | null;
}) {
  const { error } = await supabase.from("historico_importacoes").insert(row);
  if (error) throw error;
}
