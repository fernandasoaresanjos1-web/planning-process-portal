import { supabase } from "@/integrations/supabase/client";

export type EmpresaSnapshotInput = {
  cnpj: string;
  razao: string;
  regime: string;
  grupo: string;
  tags: string[];
  sem_tag: boolean;
};

export type Snapshot = {
  id: string;
  criado_em: string;
  importacao_id: string | null;
  competencia: string | null;
  total_empresas: number;
  total_tags: number;
  total_alteradas: number;
  total_novas: number;
  total_removidas: number;
  observacao: string | null;
  criado_por: string | null;
};

export type SnapshotEmpresaRow = {
  id: string;
  snapshot_id: string;
  cnpj: string;
  razao: string | null;
  regime: string | null;
  grupo: string | null;
  tags: string[];
  sem_tag: boolean;
  diff_added: string[];
  diff_removed: string[];
  status: "ok" | "divergente" | "nova" | "removida";
};

function arrEq(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export async function listSnapshots(limit = 50): Promise<Snapshot[]> {
  const { data, error } = await supabase
    .from("controle_tags_snapshots")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as Snapshot[];
}

export async function listSnapshotRows(snapshotId: string, somenteAlterados = true): Promise<SnapshotEmpresaRow[]> {
  let q = supabase.from("controle_tags_empresa_hist").select("*").eq("snapshot_id", snapshotId);
  if (somenteAlterados) q = q.neq("status", "ok");
  const { data, error } = await q.order("status").limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as SnapshotEmpresaRow[];
}

/** Gera um novo snapshot, calculando o diff contra o snapshot anterior (se houver). */
export async function criarSnapshot(opts: {
  empresas: EmpresaSnapshotInput[];
  importacaoId?: string | null;
  competencia?: string | null;
  observacao?: string | null;
}) {
  const empresas = opts.empresas;

  // Pega último snapshot pra calcular diff
  const { data: ultimos } = await supabase
    .from("controle_tags_snapshots")
    .select("id")
    .order("criado_em", { ascending: false })
    .limit(1);

  const baseMap = new Map<string, string[]>();
  if (ultimos && ultimos.length > 0) {
    const prevId = (ultimos[0] as { id: string }).id;
    let from = 0;
    const PAGE = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("controle_tags_empresa_hist")
        .select("cnpj,tags")
        .eq("snapshot_id", prevId)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as { cnpj: string; tags: string[] }[];
      rows.forEach((r) => baseMap.set(r.cnpj, r.tags || []));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  const atualMap = new Map<string, EmpresaSnapshotInput>();
  empresas.forEach((e) => atualMap.set(e.cnpj, e));

  const cnpjs = new Set<string>([...baseMap.keys(), ...atualMap.keys()]);
  let alteradas = 0;
  let novas = 0;
  let removidas = 0;
  const linhas: Omit<SnapshotEmpresaRow, "id" | "snapshot_id">[] = [];

  cnpjs.forEach((cnpj) => {
    const atual = atualMap.get(cnpj);
    const base = baseMap.get(cnpj);
    if (atual && base) {
      const added = atual.tags.filter((t) => !base.includes(t));
      const removed = base.filter((t) => !atual.tags.includes(t));
      const status: SnapshotEmpresaRow["status"] = arrEq(atual.tags, base) ? "ok" : "divergente";
      if (status === "divergente") alteradas++;
      linhas.push({
        cnpj,
        razao: atual.razao || null,
        regime: atual.regime || null,
        grupo: atual.grupo || null,
        tags: atual.tags,
        sem_tag: atual.sem_tag,
        diff_added: added,
        diff_removed: removed,
        status,
      });
    } else if (atual && !base) {
      novas++;
      linhas.push({
        cnpj,
        razao: atual.razao || null,
        regime: atual.regime || null,
        grupo: atual.grupo || null,
        tags: atual.tags,
        sem_tag: atual.sem_tag,
        diff_added: atual.tags,
        diff_removed: [],
        status: "nova",
      });
    } else if (!atual && base) {
      removidas++;
      linhas.push({
        cnpj,
        razao: null,
        regime: null,
        grupo: null,
        tags: [],
        sem_tag: true,
        diff_added: [],
        diff_removed: base,
        status: "removida",
      });
    }
  });

  const totalTags = new Set(empresas.flatMap((e) => e.tags)).size;

  const { data: snap, error: snapErr } = await supabase
    .from("controle_tags_snapshots")
    .insert({
      importacao_id: opts.importacaoId ?? null,
      competencia: opts.competencia ?? null,
      total_empresas: empresas.length,
      total_tags: totalTags,
      total_alteradas: alteradas,
      total_novas: novas,
      total_removidas: removidas,
      observacao: opts.observacao ?? null,
    })
    .select("*")
    .single();
  if (snapErr) throw snapErr;
  const snapshot = snap as unknown as Snapshot;

  // Insere linhas em lotes
  for (let i = 0; i < linhas.length; i += 500) {
    const batch = linhas.slice(i, i + 500).map((l) => ({ ...l, snapshot_id: snapshot.id }));
    const { error } = await supabase.from("controle_tags_empresa_hist").insert(batch);
    if (error) throw error;
  }

  return { snapshot, alteradas, novas, removidas };
}
