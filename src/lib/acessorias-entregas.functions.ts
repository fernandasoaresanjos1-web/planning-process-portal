// src/lib/acessorias-entregas.functions.ts
// Server functions para sincronizar Entregas e Processos da API Acessórias
// Padrão idêntico ao acessorias.functions.ts já existente no projeto

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const API_BASE = "https://api.acessorias.com";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Extrai a lista de registros, aceitando array direto ou envelopado. */
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of [
      "data", "dados", "result", "results", "items", "list", "Lista", "lista",
      "Entregas", "entregas", "Empresas", "empresas", "Processos", "processos",
    ]) {
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

// ─── Tipos internos ───────────────────────────────────────────────────────

type EntregaRow = {
  id: string;
  competencia: string;
  cnpj: string;
  razao: string;
  nome_entrega: string;
  tipo: string;
  status: string;
  departamento: string;
  resp_entrega: string;
  resp_prazo: string;
  dt_prazo: string;
  dt_finalizacao: string;
  sincronizado_em: string;
};


type ProcessoRow = {
  id: string;
  cnpj: string;
  razao: string;
  nome_processo: string;
  status: string;
  porcentagem: number;
  departamento: string;
  gestor: string;
  dt_inicio: string;
  dt_conclusao: string;
  sincronizado_em: string;
};

export type SyncEntregasResult = {
  configurado: boolean;
  /** Quantas empresas foram consultadas neste lote. */
  empresas: number;
  recebidas: number;
  gravadas: number;
  error?: string;
  /** Diagnóstico: presente só quando nada foi recebido. Nunca contém token. */
  debug?: {
    http: number;
    url: string;
    bodyLen: number;
    sample: string;
  };
};

export type SyncProcessosResult = {
  configurado: boolean;
  pagina: number;
  recebidas: number;
  gravadas: number;
  fim: boolean;
  error?: string;
  debug?: { http: number; url: string; bodyLen: number; sample: string };
};

/** Faz o GET e devolve status + texto, sem nunca expor o token. */
async function apiGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const text = res.status === 204 ? "" : await res.text();
  return { status: res.status, ok: res.ok, text };
}

/** URL sem querystring sensível — usada só em diagnóstico. */
function safeUrl(url: string) {
  return url.replace(/(token|apikey)=[^&]*/gi, "$1=***");
}

// ─── Sincronizar Entregas / Tarefas (/deliveries/{CNPJ}) ─────────────────
// Entregas e Tarefas vêm do mesmo endpoint (Config.Tipo = "O" obrigação, "T" tarefa).
// A consulta por competência/período só funciona por empresa: /deliveries/{CNPJ}/.
// O ListAll + DtLastDH é apenas sincronização incremental (hoje/ontem) — não usado aqui.

export const sincronizarPaginaEntregas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { dtInicial: string; dtFinal: string; cnpjs: string[]; pagina?: number }) => ({
      dtInicial: input?.dtInicial || new Date().toISOString().slice(0, 10),
      dtFinal:   input?.dtFinal   || new Date().toISOString().slice(0, 10),
      cnpjs:     (Array.isArray(input?.cnpjs) ? input.cnpjs : [])
                   .map((c) => String(c || "").replace(/\D/g, ""))
                   .filter((c) => c.length >= 11)
                   .slice(0, 20),
      pagina:    Math.max(1, Math.floor(input?.pagina || 1)),
    })
  )
  .handler(async ({ data, context }): Promise<SyncEntregasResult> => {
    const token = process.env["ACESSORIAS_API_TOKEN"];
    const base  = process.env["ACESSORIAS_API_URL"] || API_BASE;
    const competencia = data.dtInicial.slice(0, 7); // "YYYY-MM"

    if (!token) {
      return { configurado: false, empresas: 0, recebidas: 0, gravadas: 0,
        error: "Token não configurado. Informe ACESSORIAS_API_TOKEN nas variáveis de ambiente." };
    }
    console.log("[sync-entregas] cnpjs recebidos:", data.cnpjs.length, data.cnpjs.slice(0, 3), data.dtInicial, data.dtFinal);
    if (data.cnpjs.length === 0) {
      return { configurado: true, empresas: 0, recebidas: 0, gravadas: 0,
        error: "Nenhum CNPJ válido recebido no lote." };
    }

    const { data: compFechada } = await context.supabase
      .from("competencias_fechadas")
      .select("competencia")
      .eq("competencia", competencia)
      .maybeSingle();

    if (compFechada) {
      return { configurado: true, empresas: data.cnpjs.length, recebidas: 0, gravadas: 0,
        error: `Competência ${competencia} já está fechada e não pode ser sobrescrita.` };
    }


    const root = base.replace(/\/+$/, "");
    const rows: EntregaRow[] = [];
    let recebidas = 0;
    let ultimoDebug: SyncEntregasResult["debug"];

    for (const cnpj of data.cnpjs) {
      const url = `${root}/deliveries/${cnpj}/?DtInitial=${data.dtInicial}&DtFinal=${data.dtFinal}&config&Pagina=${data.pagina}`;
      let status = 0;
      let text = "";
      try {
        const res = await apiGet(url, token);
        status = res.status;
        text = res.text;
        if (!res.ok && status !== 204) continue;
      } catch {
        continue;
      }
      if (status === 204 || !text.trim()) {
        ultimoDebug = { http: status, url: safeUrl(url), bodyLen: text.length, sample: "" };
        continue;
      }

      let payload: unknown;
      try { payload = JSON.parse(text); }
      catch {
        ultimoDebug = { http: status, url: safeUrl(url), bodyLen: text.length, sample: text.slice(0, 300) };
        continue;
      }

      // A API retorna o array de ENTREGAS direto na raiz — cada item já é uma entrega.
      const entregas = Array.isArray(payload)
        ? payload
        : asArray(payload).length > 0 ? asArray(payload) : [payload];
      recebidas += entregas.length;

      entregas.forEach((ent: unknown) => {
        if (!ent || typeof ent !== "object") return;
        const en = ent as Record<string, unknown>;
        const cfgRaw = en["Config"] ?? en["config"];
        const cfg = (cfgRaw && typeof cfgRaw === "object") ? cfgRaw as Record<string, unknown> : {};

        const nome    = str(en["Nome"] ?? en["nome"]);
        const dtPrazo = str(en["EntDtPrazo"] ?? en["entdtprazo"]);
        const dtFin   = str(en["EntDtFinalizacao"] ?? en["entdtfinalizacao"]);
        const id      = str(cfg["EntID"] ?? cfg["entid"]);
        if (!id || !nome) return;

        rows.push({
          id,
          competencia,
          cnpj,
          razao: str(en["Razao"] ?? en["Fantasia"] ?? ""),
          nome_entrega:   nome,
          tipo:           str(cfg["Tipo"] ?? cfg["tipo"]) || "O",
          status:         str(en["Status"] ?? en["status"]),
          departamento:   str(cfg["DptoNome"] ?? cfg["dptonome"]),
          resp_entrega:   str(en["RespEntrega"] ?? en["respentrega"]),
          resp_prazo:     str(cfg["RespPrazo"] ?? cfg["respprazo"]),
          dt_prazo:       dtPrazo,
          dt_finalizacao: dtFin,
          sincronizado_em: new Date().toISOString(),
        });
      });
    }


    // Deduplicar por id e gravar
    const dedup = [...new Map(rows.map((r) => [r.id, r])).values()];
    let gravadas = 0;
    for (let i = 0; i < dedup.length; i += 200) {
      const lote = dedup.slice(i, i + 200);
      const { error } = await context.supabase
        .from("acessorias_entregas")
        .upsert(lote as never, { onConflict: "id,competencia" });

      if (error) {
        return { configurado: true, empresas: data.cnpjs.length, recebidas, gravadas, error: error.message };
      }
      gravadas += lote.length;
    }

    const out: SyncEntregasResult = {
      configurado: true, empresas: data.cnpjs.length, recebidas, gravadas,
    };
    if (gravadas === 0 && ultimoDebug) out.debug = ultimoDebug;
    return out;
  });

// ─── Sincronizar Processos (/processes/ListAll) ──────────────────────────

export const sincronizarPaginaProcessos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { dtInicial: string; dtFinal: string; pagina: number }) => ({
      dtInicial: input?.dtInicial || new Date().toISOString().slice(0, 10),
      dtFinal:   input?.dtFinal   || new Date().toISOString().slice(0, 10),
      pagina:    Math.max(1, Math.floor(input?.pagina || 1)),
    })
  )
  .handler(async ({ data, context }): Promise<SyncProcessosResult> => {
    const token = process.env["ACESSORIAS_API_TOKEN"];
    const base  = process.env["ACESSORIAS_API_URL"] || API_BASE;

    if (!token) {
      return { configurado: false, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true,
        error: "Token não configurado. Informe ACESSORIAS_API_TOKEN nas variáveis de ambiente." };
    }

    const url = `${base.replace(/\/+$/, "")}/processes/ListAll/?ProcInicioIni=${data.dtInicial}&ProcInicioFim=${data.dtFinal}&Pagina=${data.pagina}`;

    try {
      const { status, ok, text } = await apiGet(url, token);

      if (!ok && status !== 204) {
        return { configurado: true, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true,
          error: `API respondeu ${status}: ${text.slice(0, 300)}` };
      }

      if (status === 204 || !text.trim()) {
        return {
          configurado: true, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true,
          debug: { http: status, url: safeUrl(url), bodyLen: text.length, sample: "" },
        };
      }

      let payload: unknown;
      try { payload = JSON.parse(text); }
      catch {
        return { configurado: true, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true,
          error: "Resposta não é JSON válido.",
          debug: { http: status, url: safeUrl(url), bodyLen: text.length, sample: text.slice(0, 500) } };
      }

      const lista = asArray(payload);

      const rows: ProcessoRow[] = lista
        .map((p: unknown) => {
          if (!p || typeof p !== "object") return null;
          const o = p as Record<string, unknown>;
          const id = str(field(o, ["procid", "id"]));
          if (!id) return null;
          return {
            id,
            cnpj:          str(field(o, ["empcnpj", "cnpj", "identificador"])).replace(/\D/g, ""),
            razao:         str(field(o, ["empnome", "razao"])),
            nome_processo: str(field(o, ["procnome", "proctitulo"])),
            status:        str(field(o, ["procstatus", "status"])),
            porcentagem:   Math.round(parseFloat(str(field(o, ["procporcentagem"])) || "0")) || 0,
            departamento:  str(field(o, ["procdepartamento", "departamento"])),
            gestor:        str(field(o, ["procgestor", "gestor"])),
            dt_inicio:     str(field(o, ["procinicio"])),
            dt_conclusao:  str(field(o, ["procconclusao"])),
            sincronizado_em: new Date().toISOString(),
          } satisfies ProcessoRow;
        })
        .filter((r): r is ProcessoRow => !!r);

      const dedup = [...new Map(rows.map((r) => [r.id, r])).values()];
      let gravadas = 0;
      for (const row of dedup) {
        const { error } = await context.supabase
          .from("acessorias_processos")
          .upsert(row as never, { onConflict: "id" });
        if (error) {
          return { configurado: true, pagina: data.pagina, recebidas: lista.length, gravadas, fim: false, error: error.message };
        }
        gravadas++;
      }

      const out: SyncProcessosResult = {
        configurado: true, pagina: data.pagina, recebidas: lista.length, gravadas, fim: lista.length === 0,
      };
      if (lista.length === 0 || gravadas === 0) {
        out.debug = {
          http: status,
          url: safeUrl(url),
          bodyLen: text.length,
          sample: JSON.stringify(lista.slice(0, 2)).slice(0, 800),
        };
      }
      return out;

    } catch (e) {
      return { configurado: true, pagina: data.pagina, recebidas: 0, gravadas: 0, fim: true, error: (e as Error).message };
    }
  });
