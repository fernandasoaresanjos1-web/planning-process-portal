import { supabase } from "@/integrations/supabase/client";

export type OkrAcesso = {
  id: string;
  nome: string;
  nome_normalizado: string;
  perfil: "gestor" | "colaborador";
  ativo: boolean;
};

export function normalizaNome(s: string): string {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export async function listarAcessos(): Promise<OkrAcesso[]> {
  const { data, error } = await supabase
    .from("okr_acessos")
    .select("*")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as OkrAcesso[];
}

export async function salvarAcesso(input: {
  id?: string;
  nome: string;
  perfil: "gestor" | "colaborador";
  ativo: boolean;
}) {
  const nome_normalizado = normalizaNome(input.nome);
  if (input.id) {
    const { error } = await supabase
      .from("okr_acessos")
      .update({ nome: input.nome.trim(), nome_normalizado, perfil: input.perfil, ativo: input.ativo })
      .eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("okr_acessos")
      .upsert(
        { nome: input.nome.trim(), nome_normalizado, perfil: input.perfil, ativo: input.ativo },
        { onConflict: "nome_normalizado" },
      );
    if (error) throw error;
  }
}

export async function removerAcesso(id: string) {
  const { error } = await supabase.from("okr_acessos").delete().eq("id", id);
  if (error) throw error;
}

export async function autenticar(nome: string, perfil: "gestor" | "colaborador"): Promise<OkrAcesso | null> {
  const nn = normalizaNome(nome);
  if (!nn) return null;
  const { data, error } = await supabase
    .from("okr_acessos")
    .select("*")
    .eq("nome_normalizado", nn)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const acesso = data as OkrAcesso;
  // Gestor pode entrar como colaborador, mas colaborador não vira gestor
  if (perfil === "gestor" && acesso.perfil !== "gestor") return null;
  return acesso;
}

const STORAGE_KEY = "okr_acesso_sessao";

export type OkrSessao = { nome: string; perfil: "gestor" | "colaborador"; em: number };

export function lerSessao(): OkrSessao | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OkrSessao;
    // expira em 12h
    if (Date.now() - s.em > 12 * 60 * 60 * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export function gravarSessao(s: OkrSessao) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function limparSessao() {
  localStorage.removeItem(STORAGE_KEY);
}
