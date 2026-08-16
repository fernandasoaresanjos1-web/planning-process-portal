import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export type Colaborador = {
  id: string;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  email: string | null;
  ativo: boolean;
  criado_em: string;
};

export type Vinculo = {
  id: string;
  colaborador_id: string | null;
  grupo: string | null;
  departamento: string;
  dt_inicio: string;
  dt_fim: string | null;
  status: string;
  motivo: string | null;
  criado_em: string;
};

export type HistoricoItem = {
  id: string;
  vinculo_id: string | null;
  colaborador_id: string | null;
  colaborador_nome: string | null;
  colaborador_cargo: string | null;
  grupo: string | null;
  departamento: string | null;
  evento: string;
  dt_vigencia: string | null;
  motivo: string | null;
  registrado_em: string;
};

export type Trava = { travado: boolean; dt_liberacao: string | null };

export const CARTEIRA_DEPTOS = ["Contábil", "Fiscal", "Pessoal/DP"] as const;
export type CarteiraDepto = (typeof CARTEIRA_DEPTOS)[number];
export const CARTEIRA_CARGOS = ["Analista", "Assistente", "Auxiliar", "Estagiário"];
const CARGOS_GESTAO = /gerente|coordenador|supervisor/i;

export function isCargoGestao(cargo?: string | null): boolean {
  return CARGOS_GESTAO.test(cargo || "");
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtData(v: string | null): string {
  if (!v) return "—";
  const d = v.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : v;
}

export function normDepto(v: string | null | undefined): string {
  const s = (v || "").toLowerCase();
  if (/cont/.test(s)) return "Contábil";
  if (/fisc/.test(s)) return "Fiscal";
  if (/dp|pessoal|folha|rh/.test(s)) return "Pessoal/DP";
  return (v || "").trim();
}

/** Detecta a TAG de equipe do departamento para um CNPJ. */
export function getTagDepto(
  cnpj: string,
  dep: "dp" | "cont" | "fisc",
  tagsMap: Record<string, string[]>,
): string {
  const tags = tagsMap[(cnpj || "").replace(/\D/g, "")] || [];
  return (
    tags.find((t) => {
      if (dep === "dp") return /equipe\s+dp\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t);
      if (dep === "cont") return /equipe\s+cont[aá]bil\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t);
      if (dep === "fisc") return /equipe\s+fiscal\s*\d+/i.test(t) || /equipe\s+dedicada/i.test(t) || /equipe\s+cbf/i.test(t);
      return false;
    }) || ""
  );
}

export type TagLideranca = { label: string; gerente: string; coord: string; supers: string[] };

const normTag = (v: string) =>
  (v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\bequipe\b/gi, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Mapa TAG normalizada -> liderança (gerente / coordenador / supervisores). */
export async function carregarLideranca(): Promise<Record<string, TagLideranca>> {
  const { data, error } = await supabase.from("tags_base").select("key,label,coord,gerente,supers");
  if (error) throw error;
  const out: Record<string, TagLideranca> = {};
  (data || []).forEach((t) => {
    const info: TagLideranca = {
      label: String(t.label ?? t.key ?? ""),
      gerente: String(t.gerente ?? ""),
      coord: String(t.coord ?? ""),
      supers: Array.isArray(t.supers) ? (t.supers as string[]).map(String) : [],
    };
    [t.label, t.key].forEach((v) => {
      const k = normTag(String(v ?? ""));
      if (k) out[k] = info;
    });
  });
  return out;
}

export function lideranca(tag: string, map: Record<string, TagLideranca>): TagLideranca | null {
  return map[normTag(tag)] ?? null;
}

/* ─── Trava ─────────────────────────────────────────────────── */

export async function carregarTrava(): Promise<Trava> {
  const { data, error } = await supabase
    .from("carteira_trava")
    .select("travado,dt_liberacao")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return { travado: Boolean(data?.travado), dt_liberacao: (data?.dt_liberacao as string | null) ?? null };
}

export async function salvarTrava(t: Trava, autor?: string) {
  const { error } = await supabase
    .from("carteira_trava")
    .update({
      travado: t.travado,
      dt_liberacao: t.dt_liberacao || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: autor || null,
    })
    .eq("id", 1);
  if (error) throw error;
}

/* ─── Colaboradores ─────────────────────────────────────────── */

export async function listColaboradores(): Promise<Colaborador[]> {
  const { data, error } = await supabase.from("colaboradores").select("*").order("nome");
  if (error) throw error;
  return (data ?? []) as Colaborador[];
}

export async function salvarColaborador(c: {
  id?: string;
  nome: string;
  cargo?: string;
  departamento?: string;
  email?: string;
  ativo?: boolean;
}) {
  const payload = {
    nome: c.nome.trim(),
    cargo: c.cargo?.trim() || null,
    departamento: normDepto(c.departamento) || null,
    email: c.email?.trim() || null,
    ativo: c.ativo ?? true,
  };
  if (c.id) {
    const { error } = await supabase.from("colaboradores").update(payload).eq("id", c.id);
    if (error) throw error;
    return c.id;
  }
  const { data, error } = await supabase.from("colaboradores").insert(payload).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function excluirColaborador(id: string) {
  const { error } = await supabase.from("colaboradores").delete().eq("id", id);
  if (error) throw error;
}

export type ColabImportRow = { nome: string; cargo: string; departamento: string; email: string };

/** Lê planilha/CSV de colaboradores (colunas nome, cargo, departamento, email). */
export async function lerPlanilhaColaboradores(file: File): Promise<ColabImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out: ColabImportRow[] = [];
  for (const r of json) {
    const map: Record<string, string> = {};
    Object.keys(r).forEach((k) => (map[norm(k)] = String(r[k] ?? "").trim()));
    const nome = map["nome"] || map["colaborador"] || map["nome completo"] || "";
    if (!nome) continue;
    const cargo = map["cargo"] || map["funcao"] || "";
    if (isCargoGestao(cargo)) continue; // gestão vem das TAGs
    out.push({
      nome,
      cargo,
      departamento: map["departamento"] || map["depto"] || map["equipe"] || "",
      email: map["email"] || map["e-mail"] || "",
    });
  }
  return out;
}

/** Upsert dos colaboradores por email (ou nome quando email vazio). */
export async function importarColaboradores(rows: ColabImportRow[]) {
  const existentes = await listColaboradores();
  const porEmail = new Map(existentes.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]));
  const porNome = new Map(existentes.map((c) => [c.nome.trim().toLowerCase(), c]));
  let criados = 0;
  let atualizados = 0;
  for (const r of rows) {
    const atual = (r.email && porEmail.get(r.email.toLowerCase())) || porNome.get(r.nome.trim().toLowerCase());
    await salvarColaborador({
      id: atual?.id,
      nome: r.nome,
      cargo: r.cargo,
      departamento: r.departamento,
      email: r.email,
      ativo: true,
    });
    if (atual) atualizados++;
    else criados++;
  }
  return { criados, atualizados, total: rows.length };
}

/* ─── Vínculos ──────────────────────────────────────────────── */

export async function listVinculos(): Promise<Vinculo[]> {
  const PAGE = 1000;
  const out: Vinculo[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("carteira_vinculos")
      .select("id,colaborador_id,grupo,departamento,dt_inicio,dt_fim,status,motivo,criado_em")
      .order("dt_inicio", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Vinculo[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function registrarHistorico(h: {
  vinculo_id?: string | null;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  colaborador_cargo?: string | null;
  grupo?: string | null;
  departamento?: string | null;
  evento: string;
  dt_vigencia?: string | null;
  motivo?: string | null;
}) {
  const { error } = await supabase.from("carteira_historico").insert({
    vinculo_id: h.vinculo_id ?? null,
    colaborador_id: h.colaborador_id ?? null,
    colaborador_nome: h.colaborador_nome ?? null,
    colaborador_cargo: h.colaborador_cargo ?? null,
    grupo: h.grupo ?? null,
    departamento: h.departamento ?? null,
    evento: h.evento,
    dt_vigencia: h.dt_vigencia ?? null,
    motivo: h.motivo ?? null,
  } as never);
  if (error) throw error;
}

export async function criarVinculo(v: {
  colaborador: Colaborador;
  grupo: string;
  departamento: string;
  dt_inicio: string;
  motivo?: string;
}) {
  const futuro = v.dt_inicio > hoje();
  const status = futuro ? "pendente" : "ativo";
  const { data, error } = await supabase
    .from("carteira_vinculos")
    .insert({
      colaborador_id: v.colaborador.id,
      grupo: v.grupo,
      departamento: v.departamento,
      dt_inicio: v.dt_inicio,
      status,
      motivo: v.motivo?.trim() || null,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  await registrarHistorico({
    vinculo_id: id,
    colaborador_id: v.colaborador.id,
    colaborador_nome: v.colaborador.nome,
    colaborador_cargo: v.colaborador.cargo,
    grupo: v.grupo,
    departamento: v.departamento,
    evento: futuro ? "pendente_criado" : "entrada",
    dt_vigencia: v.dt_inicio,
    motivo: v.motivo,
  });
  return { id, status };
}

function dadosColab(c?: Colaborador | null) {
  return { colaborador_nome: c?.nome ?? null, colaborador_cargo: c?.cargo ?? null };
}

export async function publicarVinculo(v: Vinculo, colab?: Colaborador | null) {
  const { error } = await supabase.from("carteira_vinculos").update({ status: "ativo" }).eq("id", v.id);
  if (error) throw error;
  await registrarHistorico({
    vinculo_id: v.id,
    colaborador_id: v.colaborador_id,
    ...dadosColab(colab),
    grupo: v.grupo,
    departamento: v.departamento,
    evento: "publicado",
    dt_vigencia: v.dt_inicio,
    motivo: v.motivo,
  });
}

export async function cancelarVinculo(v: Vinculo, motivo?: string, colab?: Colaborador | null) {
  const { error } = await supabase
    .from("carteira_vinculos")
    .update({ status: "encerrado", dt_fim: hoje(), motivo: motivo?.trim() || v.motivo })
    .eq("id", v.id);
  if (error) throw error;
  await registrarHistorico({
    vinculo_id: v.id,
    colaborador_id: v.colaborador_id,
    ...dadosColab(colab),
    grupo: v.grupo,
    departamento: v.departamento,
    evento: "cancelado",
    dt_vigencia: v.dt_inicio,
    motivo: motivo || v.motivo,
  });
}

export async function encerrarVinculo(v: Vinculo, motivo?: string, colab?: Colaborador | null) {
  const dtFim = hoje();
  const { error } = await supabase
    .from("carteira_vinculos")
    .update({ dt_fim: dtFim, status: "encerrado", motivo: motivo?.trim() || v.motivo })
    .eq("id", v.id);
  if (error) throw error;
  await registrarHistorico({
    vinculo_id: v.id,
    colaborador_id: v.colaborador_id,
    ...dadosColab(colab),
    grupo: v.grupo,
    departamento: v.departamento,
    evento: "saida",
    dt_vigencia: dtFim,
    motivo,
  });
}

export async function publicarPendentesAte(
  pendentes: Vinculo[],
  ate: string,
  colabs: Record<string, Colaborador>,
) {
  const alvo = pendentes.filter((v) => v.status === "pendente" && v.dt_inicio <= ate);
  for (const v of alvo) await publicarVinculo(v, v.colaborador_id ? colabs[v.colaborador_id] : null);
  return alvo.length;
}

/* ─── Histórico ─────────────────────────────────────────────── */

export async function listHistorico(): Promise<HistoricoItem[]> {
  const { data, error } = await supabase
    .from("carteira_historico")
    .select("id,vinculo_id,colaborador_id,colaborador_nome,colaborador_cargo,grupo,departamento,evento,dt_vigencia,motivo,registrado_em")
    .order("registrado_em", { ascending: false })
    .limit(3000);
  if (error) throw error;
  return (data ?? []) as unknown as HistoricoItem[];
}
