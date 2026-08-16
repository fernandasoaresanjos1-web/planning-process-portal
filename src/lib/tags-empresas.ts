// TAGs por empresa — fonte: base ativa do Hub (empresas_base_mensal) cruzada com tags_base (TAGs com gestor)
import { supabase } from "@/integrations/supabase/client";
import { listEmpresasAtivas } from "@/lib/empresas-mensal";

const digits = (v: string) => (v || "").replace(/\D/g, "");
const limpa = (v: string) => (v || "").replace(/\u00a0/g, " ").trim();

/** "Equipe DP 1" e "DP - 1" → "dp 1" */
const normalizeTag = (v: string) =>
  (v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\bequipe\b/gi, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export async function carregarTagsEmpresas(): Promise<Record<string, string[]>> {
  try {
    const [ativas, tagsBaseRes] = await Promise.all([
      listEmpresasAtivas(),
      supabase.from("tags_base").select("key, label, coord").not("coord", "is", null).neq("coord", ""),
    ]);
    if (tagsBaseRes.error) throw tagsBaseRes.error;

    const tagsValidas = new Set<string>();
    (tagsBaseRes.data || []).forEach((t) => {
      const k = normalizeTag(String(t.key ?? ""));
      if (k) tagsValidas.add(k);
    });

    console.log("[tagsEmpresas] ativas:", ativas.length, "tagsValidas:", [...tagsValidas].slice(0, 10));

    const out: Record<string, string[]> = {};
    ativas.forEach((e) => {
      const cnpj = digits(String(e.cnpj ?? ""));
      if (!cnpj) return;
      const tagsFiltradas = (e.tags || []).map(limpa).filter((t) => tagsValidas.has(normalizeTag(t)));
      if (tagsFiltradas.length > 0) out[cnpj] = tagsFiltradas;
    });

    console.log("[tagsEmpresas] empresas com TAG válida:", Object.keys(out).length);
    return out;
  } catch (err) {
    console.error("[tagsEmpresas] erro:", err);
    return {};
  }
}


/** Observações da auditoria por CNPJ */
export async function carregarObservacoes(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("auditoria_observacoes").select("cnpj,observacao");
  if (error) throw error;
  const out: Record<string, string> = {};
  (data || []).forEach((r) => {
    const c = digits(String(r.cnpj ?? ""));
    if (c) out[c] = String(r.observacao ?? "");
  });
  return out;
}

export async function salvarObservacao(cnpj: string, observacao: string, usuario?: string) {
  const c = digits(cnpj);
  const { error } = await supabase
    .from("auditoria_observacoes")
    .upsert({ cnpj: c, observacao, usuario: usuario ?? null, atualizado_em: new Date().toISOString() }, { onConflict: "cnpj" });
  if (error) throw error;
}
