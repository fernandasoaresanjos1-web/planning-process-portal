// Obrigações reais sincronizadas da API do Acessórias (tabela acessorias_api_empresas)
import { supabase } from "@/integrations/supabase/client";
import type { ObrigacaoReal } from "@/lib/auditoria-obrigacoes";

export type AcessoriasEmpresaApi = {
  cnpj: string;
  razao: string;
  status: string;
  uf: string;
  regime: string;
  inscricoes_estaduais: unknown;
  departamentos: unknown;
  obrigacoes: string[];
  sincronizado_em: string;
};

export async function carregarObrigacoesApi(): Promise<{ empresas: AcessoriasEmpresaApi[]; reais: ObrigacaoReal[]; sincronizadoEm: string | null }> {
  const empresas: AcessoriasEmpresaApi[] = [];
  const passo = 1000;
  for (let from = 0; ; from += passo) {
    const { data, error } = await supabase
      .from("acessorias_api_empresas")
      .select("*")
      .order("cnpj")
      .range(from, from + passo - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as unknown as AcessoriasEmpresaApi[];
    empresas.push(...rows.map((r) => ({ ...r, obrigacoes: Array.isArray(r.obrigacoes) ? r.obrigacoes : [] })));
    if (rows.length < passo) break;
  }
  const reais: ObrigacaoReal[] = [];
  empresas.forEach((e) => e.obrigacoes.forEach((o) => reais.push({ cnpj: e.cnpj, obrigacao: o })));
  const sincronizadoEm = empresas.reduce<string | null>((max, e) => (!max || e.sincronizado_em > max ? e.sincronizado_em : max), null);
  return { empresas, reais, sincronizadoEm };
}
