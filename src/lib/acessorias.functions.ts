import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ObrigacaoRealDTO = { cnpj: string; obrigacao: string; departamento?: string };

export type SyncPaginaResult = {
  configurado: boolean;
  pagina: number;
  recebidas: number;
  gravadas: number;
  fim: boolean;
  error?: string;
};

const API_BASE = "https://api.acessorias.com";

function digits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["data", "dados", "Empresas", "empresas", "result", "results", "items", "Lista", "lista"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

/** Lê um campo por nome aproximado (sem acento, case-insensitive). */
function field(o: Record<string, unknown>, names: string[]): unknown {
  for (const k of Object.keys(o)) {
    const kk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (names.some((n) => kk === n || kk.includes(n))) return o[k];
  }
  return undefined;
}

function str(v: unknown) {
  return v == null ? "" : String(v).trim();
}

type EmpresaRow = {
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

function mapEmpresa(raw: unknown): EmpresaRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cnpj = digits(field(o, ["identificador", "cnpj", "documento"]));
  if (!cnpj) return null;

  const obrigacoesRaw = asArray(field(o, ["obrigacoes", "obrigacao"]));
  const obrigacoes = obrigacoesRaw
    .map((i) => {
      if (typeof i === "string") return { nome: i, status: "Ativa" };
      const x = i as Record<string, unknown>;
      return { nome: str(field(x, ["nome", "descricao", "obrigacao"])), status: str(field(x, ["status", "situacao"])) || "Ativa" };
    })
    .filter((i) => {
      if (!i.nome) return false;
      const s = i.status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      // "Ativa" entra; "Inativa nessa empresa" e "[Obrigação Inativada]" ficam fora
      if (s.includes("inativ")) return false;
      return s === "ativa" || s.startsWith("ativa");
    })
    .map((i) => i.nome);

  return {
    cnpj,
    razao: str(field(o, ["razao", "nome", "empresa"])),
    status: str(field(o, ["status", "situacao"])),
    uf: str(field(o, ["uf", "estado"])),
    regime: str(field(o, ["regime"])),
    inscricoes_estaduais: field(o, ["inscricoesestaduais", "stateregistrations", "inscricoes"]) ?? [],
    departamentos: field(o, ["departamentos", "departments"]) ?? [],
    obrigacoes: [...new Set(obrigacoes)],
    sincronizado_em: new Date().toISOString(),
  };
}

/** Sincroniza UMA página (20 empresas) da API do Acessórias e grava no banco. */
export const sincronizarPaginaAcessorias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pagina: number }) => ({ pagina: Math.max(1, Math.floor(input?.pagina || 1)) }))
  .handler(async ({ data, context }): Promise<SyncPaginaResult> => {
    const token = process.env["ACESSORIAS_API_TOKEN"];
    const base = process.env["ACESSORIAS_API_URL"] || API_BASE;
    if (!token) {
      return {
        configurado: false,
        pagina: data.pagina,
        recebidas: 0,
        gravadas: 0,
        fim: true,
        error: "Integração não configurada: informe o token da API do Acessórias nas configurações do projeto.",
      };
    }

    const url = `${base.replace(/\/+$/, "")}/companies/ListAll/?obligations&departments&stateRegistrations&ativa=S&Pagina=${data.pagina}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          configurado: true,
          pagina: data.pagina,
          recebidas: 0,
          gravadas: 0,
          fim: true,
          error: `API Acessórias respondeu ${res.status}: ${text.slice(0, 300)}`,
        };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return { configurado: true, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true, error: "Resposta da API não é JSON válido." };
      }
      const lista = asArray(payload);
      const mapeadas = lista.map(mapEmpresa).filter((r): r is EmpresaRow => !!r);
      // Deduplica por CNPJ (última ocorrência vence) — evita
      // "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const rows = [...new Map(mapeadas.map((r) => [r.cnpj, r])).values()];
      // Grava uma empresa por vez: sem conflito de chave e mais seguro
      let gravadas = 0;
      for (const row of rows) {
        const { error } = await context.supabase.from("acessorias_api_empresas").upsert(row as never, { onConflict: "cnpj" });
        if (error) {
          return { configurado: true, pagina: data.pagina, recebidas: lista.length, gravadas, fim: false, error: error.message };
        }
        gravadas++;
      }
      return {
        configurado: true,
        pagina: data.pagina,
        recebidas: lista.length,
        gravadas,
        fim: lista.length === 0,
      };
    } catch (e) {
      return { configurado: true, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true, error: (e as Error).message };
    }
  });
