// Edição do motor de regras — rascunho, publicação e log de alterações (shared_state)
import { sharedGetValue, sharedSetValue } from "@/lib/import-processos";
import {
  motorPadrao,
  motorLinhas,
  norm,
  type Motor,
  type MotorItem,
  type MotorLinha,
  type Escopo,
} from "@/lib/auditoria-obrigacoes";

export type Nivel = MotorLinha["nivel"];

export type Regra = {
  nivel: Nivel;
  chave: string;
  obrigacao: string;
  departamento: string;
  dept_original: string;
  escopo: Escopo;
};

export type MotorPatch = {
  removidas: string[];
  adicionadas: Regra[];
  editadas: Record<string, Regra>;
};

export type LogAcao = "ADICAO" | "EDICAO" | "EXCLUSAO" | "PUBLICACAO" | "DESCARTE";
export type LogEntry = {
  id: string;
  ts: string;
  acao: LogAcao;
  usuario: string;
  descricao: string;
};

export const KEY_DRAFT = "motor_regras_draft";
export const KEY_PUB = "motor_regras_publicado";
export const KEY_LOG = "motor_regras_log";

export const patchVazio = (): MotorPatch => ({ removidas: [], adicionadas: [], editadas: {} });

export const regraKey = (l: { nivel: string; chave: string; departamento: string; obrigacao: string }) =>
  `${l.nivel}|${l.chave}|${l.departamento}|${norm(l.obrigacao)}`;

export const patchAlteracoes = (p: MotorPatch) =>
  p.removidas.length + p.adicionadas.length + Object.keys(p.editadas).length;

export const patchIgual = (a: MotorPatch, b: MotorPatch) => JSON.stringify(a) === JSON.stringify(b);

// ── acesso à posição da regra dentro do motor ───────────────────────────────
type Slot =
  | { kind: "item"; list: MotorItem[] }
  | { kind: "string"; list: string[] }
  | { kind: "obj"; list: { obrigacao: string; mininome?: string }[] };

function slot(m: Motor, r: Regra, criar: boolean): Slot | null {
  const dep = r.departamento as "FISCAL" | "FOLHA" | "CONTABIL";
  if (r.nivel === "FEDERAL") {
    const bloco = m.federal_por_regime[r.chave] || (criar ? (m.federal_por_regime[r.chave] = { FISCAL: [], FOLHA: [], CONTABIL: [] }) : null);
    if (!bloco) return null;
    if (!bloco[dep]) {
      if (!criar) return null;
      bloco[dep] = [];
    }
    return { kind: "item", list: bloco[dep] };
  }
  if (r.nivel === "PRODUTOR RURAL") {
    const fed = m.produtor_rural?.federal;
    if (!fed) return null;
    if (!fed[dep]) {
      if (!criar) return null;
      fed[dep] = [];
    }
    return { kind: "item", list: fed[dep] };
  }
  if (r.nivel === "PERIODICIDADE") {
    const g = m.contabil_periodicidade.grupos;
    if (!g[r.chave]) {
      if (!criar) return null;
      g[r.chave] = [];
    }
    return { kind: "string", list: g[r.chave] };
  }
  if (r.nivel === "ESTADUAL") {
    const [ufRaw, regRaw] = r.chave.split("—");
    const uf = norm(ufRaw || "");
    const reg = (regRaw || "").trim() || "Regime Normal";
    const porUf = m.estadual_normal_por_uf || (m.estadual_normal_por_uf = {});
    if (!porUf[uf]) {
      if (!criar) return null;
      porUf[uf] = {};
    }
    if (!porUf[uf][reg]) {
      if (!criar) return null;
      porUf[uf][reg] = [];
    }
    return { kind: "string", list: porUf[uf][reg] };
  }
  if (r.nivel === "ESTADUAL ST") {
    const map = m.estadual_substituto_por_uf || (m.estadual_substituto_por_uf = {});
    const uf = norm(r.chave);
    if (!map[uf]) {
      if (!criar) return null;
      map[uf] = [];
    }
    return { kind: "obj", list: map[uf] };
  }
  if (r.nivel === "MUNICIPAL") {
    const map = m.municipal_por_municipio || (m.municipal_por_municipio = {});
    if (!map[r.chave]) {
      if (!criar) return null;
      map[r.chave] = [];
    }
    return { kind: "obj", list: map[r.chave] };
  }
  if (r.nivel === "FOLHA") {
    if (/adiantamento/i.test(r.chave)) return { kind: "string", list: m.folha_particularidades.adiantamento.quando_sim };
    const opt = r.chave.replace(/^fechamento folha:\s*/i, "").trim();
    const opcoes = m.folha_particularidades.fechamento_folha.opcoes;
    const achada = Object.keys(opcoes).find((k) => norm(k) === norm(opt));
    if (!achada) {
      if (!criar) return null;
      opcoes[opt] = [];
      return { kind: "string", list: opcoes[opt] };
    }
    return { kind: "string", list: opcoes[achada] };
  }
  if (r.nivel === "PARTICULAR") {
    const lista = m.particularidades_fiscal?.lista;
    if (!lista) return null;
    return { kind: "obj", list: lista };
  }
  return null;
}

function remover(m: Motor, r: Regra) {
  const s = slot(m, r, false);
  if (!s) return;
  const k = norm(r.obrigacao);
  if (s.kind === "string") {
    const i = s.list.findIndex((o) => norm(o) === k);
    if (i >= 0) s.list.splice(i, 1);
  } else {
    const i = (s.list as { obrigacao: string }[]).findIndex((o) => norm(o.obrigacao) === k);
    if (i >= 0) s.list.splice(i, 1);
  }
}

function adicionar(m: Motor, r: Regra) {
  const s = slot(m, r, true);
  if (!s) return;
  const k = norm(r.obrigacao);
  if (s.kind === "string") {
    if (!s.list.some((o) => norm(o) === k)) s.list.push(r.obrigacao);
    return;
  }
  if (s.kind === "obj") {
    const mininome = r.nivel === "PARTICULAR" ? (r.chave || "").trim() : undefined;
    const idx = s.list.findIndex((o) => norm(o.obrigacao) === k);
    const item = { obrigacao: r.obrigacao, ...(mininome ? { mininome } : {}) };
    if (idx >= 0) s.list[idx] = item;
    else s.list.push(item);
    return;
  }

  const somenteMatriz = r.escopo === "Somente Matriz";
  const idx = s.list.findIndex((o) => norm(o.obrigacao) === k);
  const item: MotorItem = {
    obrigacao: r.obrigacao,
    somente_matriz: somenteMatriz,
    inclui_filial: !somenteMatriz,
    dept_original: r.dept_original || r.departamento,
  };
  if (idx >= 0) s.list[idx] = item;
  else s.list.push(item);
}

/** Aplica o patch (rascunho/publicado) sobre uma cópia do motor padrão */
export function aplicarPatch(patch: MotorPatch, base?: Motor): Motor {
  const m = base ? (JSON.parse(JSON.stringify(base)) as Motor) : motorPadrao();
  const linhas = motorLinhas(m);
  const porKey = new Map(linhas.map((l) => [regraKey(l), l as Regra]));

  patch.removidas.forEach((k) => {
    const r = porKey.get(k);
    if (r) remover(m, r);
  });
  Object.entries(patch.editadas).forEach(([k, nova]) => {
    const antiga = porKey.get(k);
    if (antiga) remover(m, antiga);
    adicionar(m, nova);
  });
  patch.adicionadas.forEach((r) => adicionar(m, r));
  return m;
}

// ── persistência ───────────────────────────────────────────────────────────
export async function carregarDraft(): Promise<MotorPatch> {
  return (await sharedGetValue<MotorPatch>(KEY_DRAFT)) || patchVazio();
}
export async function salvarDraft(p: MotorPatch): Promise<void> {
  await sharedSetValue(KEY_DRAFT, p);
}
export async function carregarPublicado(): Promise<MotorPatch> {
  return (await sharedGetValue<MotorPatch>(KEY_PUB)) || patchVazio();
}
export async function publicar(p: MotorPatch): Promise<void> {
  await sharedSetValue(KEY_PUB, p);
}
export async function carregarLog(): Promise<LogEntry[]> {
  return (await sharedGetValue<LogEntry[]>(KEY_LOG)) || [];
}
export async function registrarLog(entrada: Omit<LogEntry, "id" | "ts">): Promise<LogEntry[]> {
  const atual = await carregarLog();
  const nova: LogEntry = {
    ...entrada,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
  };
  const lista = [nova, ...atual].slice(0, 500);
  await sharedSetValue(KEY_LOG, lista);
  return lista;
}
