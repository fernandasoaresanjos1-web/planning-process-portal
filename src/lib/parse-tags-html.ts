import { supabase } from "@/integrations/supabase/client";

export type TagRow = {
  key: string;
  label: string;
  dept: string;
  coord: string | null;
  gerente: string | null;
  supers: string[];
  ordem: number;
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Nome oficial da TAG (igual ao usado nas TAGs das empresas): "Equipe Contábil 1", "Equipe Fiscal 3", "Equipe DP 2" */
export function canonicalTagKey(value: string): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  const normalized = stripAccents(raw).toLowerCase();
  const numerada = normalized.match(/^equipe\s+(contabil|fiscal|dp|cc)\s*-?\s*(\d+)$/);
  if (numerada) {
    const dept = numerada[1] === "contabil" ? "Contábil" : numerada[1] === "fiscal" ? "Fiscal" : numerada[1].toUpperCase();
    return `Equipe ${dept} ${numerada[2]}`;
  }
  const duplicatedEquipe = raw.match(/^Equipe\s+Equipe\s+(.+)$/i);
  if (duplicatedEquipe) return `Equipe ${duplicatedEquipe[1].trim()}`;
  return raw;
}

function canonicalTagLabel(row: Pick<TagRow, "key" | "label">) {
  const canonicalKey = canonicalTagKey(row.key || row.label);
  const numerada = canonicalKey.match(/^Equipe (Contábil|Fiscal|DP|CC) (\d+)$/);
  if (numerada) return `${numerada[1]} - ${numerada[2]}`;
  return String(row.label || canonicalKey).trim().replace(/^Equipe\s+Equipe\s+/i, "Equipe ");
}

export function normalizeTagRow(row: TagRow): TagRow {
  const key = canonicalTagKey(row.key || row.label);
  return {
    ...row,
    key,
    label: canonicalTagLabel({ key, label: row.label }),
  };
}

export function dedupeTagRows(rows: TagRow[]): TagRow[] {
  const byKey = new Map<string, TagRow>();
  for (const row of rows.map(normalizeTagRow)) {
    const current = byKey.get(row.key);
    if (!current) {
      byKey.set(row.key, row);
      continue;
    }
    const currentScore = Number(Boolean(current.coord && current.coord !== "-")) + Number(Boolean(current.gerente));
    const rowScore = Number(Boolean(row.coord && row.coord !== "-")) + Number(Boolean(row.gerente));
    byKey.set(row.key, rowScore > currentScore ? { ...current, ...row, ordem: Math.min(current.ordem, row.ordem) } : current);
  }
  return Array.from(byKey.values()).sort((a, b) => (a.dept || "").localeCompare(b.dept || "") || a.ordem - b.ordem || a.label.localeCompare(b.label));
}

/**
 * Extrai o array `var TAGS = [...]` do HTML do processo de Controle de TAGs.
 * Aceita object literals com chaves sem aspas (sintaxe JS).
 */
export function extractTagsFromHtml(html: string): TagRow[] {
  const m = html.match(/var\s+TAGS\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) return [];
  // Parse safely — accept JS-style object literals by normalizing to JSON.
  // NEVER evaluate untrusted HTML content as JavaScript.
  let parsed: unknown;
  try {
    const jsonish = m[1]
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'((?:[^'\\]|\\.)*)'/g, (_s, inner: string) => JSON.stringify(inner.replace(/\\'/g, "'")))
      .replace(/,\s*([}\]])/g, "$1");
    parsed = JSON.parse(jsonish);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return dedupeTagRows(parsed.map((t, i) => {
    const o = t as Record<string, unknown>;
    const supersRaw = typeof o.supers === "string" ? (o.supers as string) : "";
    const supers = supersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      key: String(o.key ?? ""),
      label: String(o.label ?? o.key ?? ""),
      dept: String(o.dept ?? "Outra"),
      coord: o.coord ? String(o.coord) : null,
      gerente: o.gerente ? String(o.gerente) : null,
      supers,
      ordem: typeof o.id === "number" ? (o.id as number) : i,
    };
  }));
}

/** Substitui a base de TAGs no backend pelo conteúdo extraído do HTML. */
export async function sincronizarTagsBase(html: string): Promise<number> {
  const rows = extractTagsFromHtml(html);
  if (rows.length === 0) return 0;
  // limpa e re-insere — base pequena (~22 linhas)
  const { error: delErr } = await supabase
    .from("tags_base")
    .delete()
    .neq("key", "__noop__");
  if (delErr) throw delErr;
  const { error: insErr } = await supabase
    .from("tags_base")
    .insert(rows.map((r) => ({ ...r, atualizado_em: new Date().toISOString() })));
  if (insErr) throw insErr;
  return rows.length;
}

export type TagBaseRecord = TagRow & { atualizado_em: string };

export async function listTagsBase(): Promise<TagBaseRecord[]> {
  const { data, error } = await supabase
    .from("tags_base")
    .select("*")
    .order("dept")
    .order("ordem");
  if (error) throw error;
  return dedupeTagRows((data ?? []) as TagBaseRecord[]) as TagBaseRecord[];
}
