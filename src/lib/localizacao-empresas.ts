// Localização de cadastro das empresas (UF, município e UFs das inscrições estaduais)
// Fonte: base ativa mensal (empresas_base_mensal.dados)
import { supabase } from "@/integrations/supabase/client";
import { ufsDeInscricoes, type BILocalizacao } from "./auditoria-obrigacoes";

const digits = (v: string) => (v || "").replace(/\D/g, "");

export async function carregarLocalizacoes(): Promise<Record<string, BILocalizacao>> {
  const out: Record<string, BILocalizacao> = {};

  const { data: imp, error: eImp } = await supabase
    .from("empresas_importacoes")
    .select("id")
    .eq("ativo", true)
    .order("competencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eImp) throw eImp;
  if (!imp) return out;

  const step = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("empresas_base_mensal")
      .select("cnpj,dados")
      .eq("importacao_id", imp.id)
      .range(from, from + step - 1);
    if (error) throw error;
    const chunk = data ?? [];
    for (const r of chunk) {
      const d = (r.dados ?? {}) as Record<string, unknown>;
      const uf = String(d["UF"] ?? "").trim().toUpperCase();
      const cidade = String(d["Cidade"] ?? "").trim();
      const iesTexto = String(d["Inscrições Estaduais"] ?? "");
      const im = String(d["Insc. Municipal"] ?? d["Inscrição Municipal"] ?? "").trim();
      out[digits(String(r.cnpj ?? ""))] = {
        uf_cadastro: uf,
        municipio_cadastro: cidade,
        ies_ufs: ufsDeInscricoes(iesTexto),
        inscricao_municipal: /^(isento|nao|não|n\/a|-)$/i.test(im) ? "" : im,
      };

    }
    if (chunk.length < step) break;
    from += step;
  }
  return out;
}
