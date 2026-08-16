// Motor de auditoria de obrigações — regras em src/lib/motor-auditoria-v31.json (v3.1)
import motorRaw from "./motor-auditoria-v31.json";
import type { BIEmpresa, BIConfigContabil, BIConfigFolha } from "./bi-empresas";

export type Depto = "FISCAL" | "FOLHA" | "CONTABIL";

export type MotorItem = {
  obrigacao: string;
  somente_matriz?: boolean;
  inclui_filial?: boolean;
  dept_original?: string;
};

type FederalBloco = Record<Depto, MotorItem[]>;

export type Motor = {
  versao: string;
  ultima_atualizacao: string;
  regimes_ignorar: string[];
  logica_cruzamento: {
    mapeamento_fechamento_folha: Record<string, string>;
    mapeamento_periodicidade_contabil: Record<string, string>;
    mapeamento_modalidade_lr: Record<string, string>;
    mapeamento_regime_estadual: Record<string, string>;
  };
  federal_por_regime: Record<string, FederalBloco>;
  contabil_periodicidade: { somente_matriz: boolean; grupos: Record<string, string[]> };
  folha_particularidades: {
    adiantamento: { campo_hub: string; somente_matriz: boolean; quando_sim: string[] };
    fechamento_folha: { campo_hub: string; somente_matriz: boolean; opcoes: Record<string, string[]> };
  };
  estadual_normal_por_uf: Record<string, Record<string, string[]>>;
  estadual_substituto_por_uf: Record<string, { obrigacao: string }[]>;
  municipal_por_municipio: Record<string, { obrigacao: string }[]>;

  particularidades_fiscal: { lista: { obrigacao: string; mininome?: string }[] };
  produtor_rural: { federal: FederalBloco; contabil?: string[] };
};

export const motorBase = motorRaw as unknown as Motor;
/** Motor ativo (pode ser sobrescrito pelas regras publicadas) */
export const motor = JSON.parse(JSON.stringify(motorRaw)) as Motor;

/** Substitui o conteúdo do motor ativo (usado ao carregar as regras publicadas) */
export function aplicarMotor(novo: Motor) {
  Object.keys(motor).forEach((k) => delete (motor as unknown as Record<string, unknown>)[k]);
  Object.assign(motor, JSON.parse(JSON.stringify(novo)));
  recomputarSets();
}
export function motorPadrao(): Motor {
  return JSON.parse(JSON.stringify(motorBase)) as Motor;
}

export type Escopo = "Somente Matriz" | "Matriz e Filial" | "Todos";

/** Escopo legível a partir do dept_original (FOLHA/MTZ → Somente Matriz, FOLHA/MTZ/FL → Matriz e Filial, FOLHA → Todos) */
export function escopoDe(deptOriginal: string | undefined, somenteMatriz?: boolean): Escopo {
  const d = (deptOriginal || "").toUpperCase();
  if (d.includes("/FL")) return "Matriz e Filial";
  if (d.includes("MTZ")) return "Somente Matriz";
  if (d) return "Todos";
  return somenteMatriz ? "Somente Matriz" : "Todos";
}

export const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

export type Origem =
  | "FEDERAL"
  | "PERIODICIDADE"
  | "IRPJ/CSLL"
  | "PARTICULARIDADE FOLHA"
  | "PRODUTOR RURAL"
  | "ESTADUAL"
  | "ESTADUAL ST"
  | "MUNICIPAL";

export type EsperadaItem = { obrigacao: string; departamento: Depto; origem: Origem };

/** Localização de cadastro da empresa (gatilhos estadual/municipal) */
export type BILocalizacao = {
  uf_cadastro?: string;
  municipio_cadastro?: string;
  /** UFs das inscrições estaduais (inclui a própria uf_cadastro, se houver) */
  ies_ufs?: string[];
  /** Inscrição municipal cadastrada no Hub (gatilho das obrigações municipais) */
  inscricao_municipal?: string;
};


const UF_RE = /\b(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)\b/g;

/** Extrai as UFs de um texto de inscrições estaduais ("UF: SP - IE: 123...") */
export function ufsDeInscricoes(texto: string): string[] {
  const s = norm(texto);
  const out = new Set<string>();
  for (const m of s.matchAll(UF_RE)) out.add(m[1]);
  return [...out];
}

/** Regime do Hub → chave de estadual_normal_por_uf ("Regime Normal" / "Simples Nacional") */
export function regimeEstadual(regime: string): string | null {
  const chave = regimeParaFederal(regime);
  if (!chave) return null;
  if (chave === "SIMPLES NACIONAL" || chave === "MEI") return "Simples Nacional";
  if (chave === "LUCRO REAL" || chave === "LUCRO PRESUMIDO") return "Regime Normal";
  return null;
}

/** Chave de municipal_por_municipio a partir de município + UF */
export function chaveMunicipio(municipio: string, uf: string): string | null {
  const mun = norm(municipio);
  const u = norm(uf);
  if (!mun) return null;
  const direta = `${mun}/${u}`;
  if (motor.municipal_por_municipio[direta]) return direta;
  const achada = Object.keys(motor.municipal_por_municipio).find((k) => {
    const [m, kuf] = k.split("/");
    return norm(m) === mun && (!u || norm(kuf || "") === u);
  });
  return achada || null;
}


/** Regime do Hub → chave de federal_por_regime */
export function regimeParaFederal(regime: string): string | null {
  const r = norm(regime);
  if (!r) return null;
  if (r.includes("PRODUTOR RURAL") || r.includes("CAEPF")) return "PRODUTOR RURAL";
  if (r.includes("DOMESTIC")) return "DOMESTICA";
  if (r.startsWith("MEI")) return "MEI";
  if (r.includes("SIMPLES NACIONAL")) return "SIMPLES NACIONAL";
  if (r.includes("LUCRO REAL")) return "LUCRO REAL";
  if (r.includes("LUCRO PRESUMIDO")) return "LUCRO PRESUMIDO";
  if (r.includes("IMUNISENTA") || r.includes("IMUNE") || r.includes("ISENTA")) return "LUCRO PRESUMIDO";
  return null;
}

export function regimeIgnorado(regime: string): boolean {
  const r = norm(regime);
  return motor.regimes_ignorar.some((x) => norm(x) === r);
}

export function isMatriz(cnpj: string, regime = ""): boolean {
  if (/filial/i.test(regime)) return false;
  const d = (cnpj || "").replace(/\D/g, "");
  return d.length === 14 ? d.slice(8, 12) === "0001" : true;
}

/** fechamento_contabil (Hub: fech_tipo) → grupo de contabil_periodicidade */
export function grupoPeriodicidade(fech: string): string | null {
  const f = norm(fech);
  if (!f || f.includes("SEM MOVIMENTO")) return null;
  const map = motor.logica_cruzamento.mapeamento_periodicidade_contabil;
  // match exato pelo mapeamento oficial (com D60/D90)
  for (const [k, v] of Object.entries(map)) if (norm(k) === f) return v;
  if (f.startsWith("TRIMESTRAL")) return f.includes("60") ? "Trimestr60" : f.includes("90") ? "Trimestr90" : "Trimestral";
  if (f.startsWith("SEMESTRAL")) return f.includes("90") ? "Semestr90" : "Semestral";
  if (f.startsWith("ANUAL")) return f.includes("90") ? "Anual90" : "Anual";
  if (f.startsWith("MENSAL")) return "Mensal";
  return null;
}

/** modalidade_lucro_real (Estimativa/Balanço; Hub: apuracao) → grupo IRCS */
export function grupoModalidadeLR(modalidade: string): string | null {
  const m = norm(modalidade);
  if (!m) return null;
  if (m.startsWith("BALANC") || m.startsWith("TRIMESTRAL")) return "IRCS Trim";
  if (m.startsWith("ESTIMATIVA") || m.startsWith("MENSAL") || m.startsWith("ANUAL")) return "IRCS Anual";
  return null;
}

// ── TAGs por departamento ─────────────────────────────────────────────────
/** Detecção de departamento a partir do array de tags (fonte: empresas_tags) */
export function temTagDeptoArray(tags: string[], dep: Depto): boolean {
  const t = tags || [];
  if (dep === "FOLHA")
    return t.some((x) => /equipe\s+dp\s*\d+/i.test(x) || /equipe\s+dedicada/i.test(x) || /equipe\s+cbf/i.test(x));
  if (dep === "FISCAL")
    return t.some((x) => /equipe\s+fiscal\s*\d+/i.test(x) || /equipe\s+dedicada/i.test(x) || /equipe\s+cbf/i.test(x));
  if (dep === "CONTABIL")
    return t.some((x) => /equipe\s+cont[aá]bil\s*\d+/i.test(x) || /equipe\s+dedicada/i.test(x));
  return false;
}

export function temTagDepto(emp: BIEmpresa, dep: Depto, tagsArr?: string[]): boolean {
  const arr = tagsArr?.length ? tagsArr : (emp.tags || "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  return temTagDeptoArray(arr, dep);
}

/** TAGs do array que pertencem ao departamento informado */
export function tagsDoDepto(tags: string[], dep: Depto): string[] {
  return (tags || []).filter((t) => temTagDeptoArray([t], dep));
}


export function equipeDepto(emp: BIEmpresa, dep: Depto): string {
  if (dep === "FISCAL") return emp.fiscal || "";
  if (dep === "FOLHA") return emp.pessoal || "";
  return emp.contabil || "";
}

export type BaseEsperada = {
  cnpj: string;
  razao: string;
  regime: string;
  matriz: boolean;
  equipe_contabil: string;
  equipe_fiscal: string;
  equipe_pessoal: string;
  deptos: Depto[];
  /** TAGs da empresa (fonte: empresas_tags) */
  tags: string[];
  itens: EsperadaItem[];
};

export function baseEsperadaEmpresa(
  emp: BIEmpresa,
  cont?: BIConfigContabil,
  folha?: BIConfigFolha,
  local?: BILocalizacao,
  tagsArr?: string[],
): BaseEsperada | null {

  if (regimeIgnorado(emp.regime)) return null;

  // tagsArr passado e vazio = empresa sem TAG com gestor → excluir da auditoria
  // tagsArr undefined = chamada sem tagsMap (fallback legado nas tags cruas do bi_empresas)
  const tags =
    tagsArr !== undefined
      ? tagsArr
      : (emp.tags || "").split(/[,;|]/).map((s) => s.replace(/\u00a0/g, " ").trim()).filter(Boolean);

  if (!tags.length) return null;

  const chave = regimeParaFederal(emp.regime);
  const matriz = isMatriz(emp.cnpj, emp.regime);
  const isFilial = /filial/i.test(emp.regime);
  const deptos = (["FISCAL", "FOLHA", "CONTABIL"] as Depto[])
    .filter((d) => temTagDeptoArray(tags, d))
    .filter((d) => !(isFilial && d === "CONTABIL"));

  if (!deptos.length) return null;


  const itens: EsperadaItem[] = [];
  const pushItens = (arr: MotorItem[] | undefined, dep: Depto, origem: Origem) => {
    if (!deptos.includes(dep)) return;
    (arr || []).forEach((i) => {
      // FOLHA/MTZ → somente_matriz = true; FOLHA/MTZ/FL e FOLHA → aplica em filial também
      const somenteMatriz = i.somente_matriz ?? false;
      if (somenteMatriz && !matriz) return;
      itens.push({ obrigacao: i.obrigacao, departamento: dep, origem });
    });
  };

  if (chave === "PRODUTOR RURAL") {
    const fed = motor.produtor_rural?.federal;
    pushItens(fed?.FISCAL, "FISCAL", "PRODUTOR RURAL");
    pushItens(fed?.FOLHA, "FOLHA", "PRODUTOR RURAL");
    pushItens(fed?.CONTABIL, "CONTABIL", "PRODUTOR RURAL");
    (motor.produtor_rural?.contabil || []).forEach((o) => {
      if (deptos.includes("CONTABIL") && matriz)
        itens.push({ obrigacao: typeof o === "string" ? o : (o as { obrigacao: string }).obrigacao, departamento: "CONTABIL", origem: "PRODUTOR RURAL" });
    });
  } else {
    const fed = chave ? motor.federal_por_regime[chave] : undefined;
    pushItens(fed?.FISCAL, "FISCAL", "FEDERAL");
    pushItens(fed?.FOLHA, "FOLHA", "FEDERAL");
    pushItens(fed?.CONTABIL, "CONTABIL", "FEDERAL");

    // CONTABIL/MTZ — periodicidade de fechamento contábil
    if (deptos.includes("CONTABIL") && matriz) {
      const g = grupoPeriodicidade(cont?.fech_tipo || "");
      if (g)
        (motor.contabil_periodicidade.grupos[g] || []).forEach((o) =>
          itens.push({ obrigacao: o, departamento: "CONTABIL", origem: "PERIODICIDADE" }),
        );
      if (chave === "LUCRO REAL") {
        const gl = grupoModalidadeLR(cont?.apuracao || "");
        if (gl)
          (motor.contabil_periodicidade.grupos[gl] || []).forEach((o) =>
            itens.push({ obrigacao: o, departamento: "CONTABIL", origem: "IRPJ/CSLL" }),
          );
      }
    }
  }

  // ── FISCAL estadual/municipal — SEM distinção Geral/Filial ───────────────
  if (deptos.includes("FISCAL")) {
    const ufCad = norm(local?.uf_cadastro || "");
    const regEst = regimeEstadual(emp.regime);

    // Estadual Normal — gatilho: ter inscrição estadual na UF de cadastro
    const temIeNaUfCadastro = (local?.ies_ufs || []).map(norm).includes(ufCad);
    if (ufCad && regEst && temIeNaUfCadastro) {
      const lista = motor.estadual_normal_por_uf?.[ufCad]?.[regEst] || [];
      lista.forEach((o) => itens.push({ obrigacao: o, departamento: "FISCAL", origem: "ESTADUAL" }));
    }

    // Estadual ST — gatilho: inscrições estaduais em UFs diferentes da uf_cadastro
    const outras = (local?.ies_ufs || []).map(norm).filter((u) => u && u !== ufCad);
    [...new Set(outras)].forEach((uf) =>
      (motor.estadual_substituto_por_uf?.[uf] || []).forEach((i) =>
        itens.push({ obrigacao: i.obrigacao, departamento: "FISCAL", origem: "ESTADUAL ST" }),
      ),
    );

    // Municipal — gatilho: ter inscrição municipal cadastrada
    const temInscricaoMunicipal = !!(local?.inscricao_municipal || "").trim();
    const chaveMun = chaveMunicipio(local?.municipio_cadastro || "", ufCad);
    if (chaveMun && temInscricaoMunicipal)
      (motor.municipal_por_municipio?.[chaveMun] || []).forEach((i) =>
        itens.push({ obrigacao: i.obrigacao, departamento: "FISCAL", origem: "MUNICIPAL" }),
      );
  }



  // Particularidades de folha — matriz ou filial, se marcado
  if (deptos.includes("FOLHA")) {
    if (folha?.adiant)
      motor.folha_particularidades.adiantamento.quando_sim.forEach((o) =>
        itens.push({ obrigacao: o, departamento: "FOLHA", origem: "PARTICULARIDADE FOLHA" }),
      );
    const atual = norm(folha?.fechamento || "");
    if (atual) {
      Object.entries(motor.folha_particularidades.fechamento_folha.opcoes).forEach(([opt, lista]) => {
        const alvo = norm(opt);
        const bate = alvo.includes("5") ? atual.includes("5") : atual.includes("30") || atual.includes("ULTIMO DIA");
        if (bate) lista.forEach((o) => itens.push({ obrigacao: o, departamento: "FOLHA", origem: "PARTICULARIDADE FOLHA" }));
      });
    }
  }

  const seen = new Set<string>();
  const uniq = itens.filter((i) => {
    const k = i.departamento + "|" + norm(i.obrigacao);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    cnpj: emp.cnpj,
    razao: emp.razao,
    regime: emp.regime,
    matriz,
    equipe_contabil: emp.contabil,
    equipe_fiscal: emp.fiscal,
    equipe_pessoal: emp.pessoal,
    deptos,
    tags,
    itens: uniq,
  };
}

export function baseEsperada(
  empresas: BIEmpresa[],
  contCfg: Record<string, BIConfigContabil>,
  folhaCfg: Record<string, BIConfigFolha>,
  locais: Record<string, BILocalizacao> = {},
  tagsMap: Record<string, string[]> = {},
): BaseEsperada[] {
  const key = (c: string) => (c || "").replace(/\D/g, "");
  const temMapa = Object.keys(tagsMap).length > 0;
  return empresas
    .map((e) =>
      baseEsperadaEmpresa(
        e,
        contCfg[e.cnpj],
        folhaCfg[e.cnpj],
        locais[key(e.cnpj)] || locais[e.cnpj],
        tagsMap[key(e.cnpj)] || tagsMap[e.cnpj] || (temMapa ? [] : undefined),
      ),
    )
    .filter((x): x is BaseEsperada => !!x);

}



// ─── Classificação das obrigações vindas da API ─────────────────────────────
export type Classificacao = "OBRIGATORIA" | "PARTICULAR" | "DESCONHECIDA";

let setParticulares = new Set<string>();
let setMotor = new Set<string>();

export function recomputarSets() {
  setParticulares = new Set((motor.particularidades_fiscal?.lista || []).map((p) => norm(p.obrigacao)));
  const s = new Set<string>();
  Object.values(motor.federal_por_regime).forEach((b) =>
    (["FISCAL", "FOLHA", "CONTABIL"] as Depto[]).forEach((d) => (b[d] || []).forEach((i) => s.add(norm(i.obrigacao)))),
  );
  Object.values(motor.contabil_periodicidade.grupos).forEach((g) => g.forEach((o) => s.add(norm(o))));
  motor.folha_particularidades.adiantamento.quando_sim.forEach((o) => s.add(norm(o)));
  Object.values(motor.folha_particularidades.fechamento_folha.opcoes).forEach((l) => l.forEach((o) => s.add(norm(o))));
  Object.values(motor.estadual_normal_por_uf || {}).forEach((r) =>
    Object.values(r).forEach((l) => l.forEach((o) => s.add(norm(o)))),
  );
  Object.values(motor.estadual_substituto_por_uf || {}).forEach((l) => l.forEach((i) => s.add(norm(i.obrigacao))));
  Object.values(motor.municipal_por_municipio || {}).forEach((l) => l.forEach((i) => s.add(norm(i.obrigacao))));
  const pr = motor.produtor_rural?.federal;
  if (pr) (["FISCAL", "FOLHA", "CONTABIL"] as Depto[]).forEach((d) => (pr[d] || []).forEach((i) => s.add(norm(i.obrigacao))));
  setMotor = s;
}
recomputarSets();

export function classificar(obrigacao: string): Classificacao {
  const k = norm(obrigacao);
  if (setMotor.has(k)) return "OBRIGATORIA";
  if (setParticulares.has(k)) return "PARTICULAR";
  return "DESCONHECIDA";
}

// ─── Comparação com as obrigações reais (API Acessórias) ────────────────────
export type ObrigacaoReal = { cnpj: string; obrigacao: string; departamento?: string };
export type Status = "OK" | "FALTA" | "SOBRA" | "PARTICULAR" | "DESCONHECIDA";
export type Divergencia = {
  cnpj: string;
  razao: string;
  regime: string;
  equipe_contabil: string;
  equipe_fiscal: string;
  equipe_pessoal: string;
  tags: string[];
  obrigacao: string;
  departamento: Depto | "—";
  origem: Origem | "—";
  status: Status;
  classificacao: Classificacao;
};

const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");

export function comparar(esperada: BaseEsperada[], reais: ObrigacaoReal[]): Divergencia[] {
  const porCnpj = new Map<string, Map<string, string>>();
  reais.forEach((r) => {
    const c = onlyDigits(r.cnpj);
    if (!porCnpj.has(c)) porCnpj.set(c, new Map());
    porCnpj.get(c)!.set(norm(r.obrigacao), r.obrigacao);
  });

  const out: Divergencia[] = [];
  esperada.forEach((e) => {
    const c = onlyDigits(e.cnpj);
    const tem = porCnpj.get(c) || new Map<string, string>();
    const esperados = new Set(e.itens.map((i) => norm(i.obrigacao)));
    const meta = {
      cnpj: e.cnpj, razao: e.razao, regime: e.regime,
      equipe_contabil: e.equipe_contabil, equipe_fiscal: e.equipe_fiscal, equipe_pessoal: e.equipe_pessoal,
      tags: e.tags || [],
    };

    e.itens.forEach((i) => {
      out.push({
        ...meta,
        obrigacao: i.obrigacao,
        departamento: i.departamento,
        origem: i.origem,
        status: tem.has(norm(i.obrigacao)) ? "OK" : "FALTA",
        classificacao: "OBRIGATORIA",
      });
    });

    tem.forEach((nomeOriginal, k) => {
      if (esperados.has(k)) return;
      const cls = classificar(nomeOriginal);
      out.push({
        ...meta,
        obrigacao: nomeOriginal,
        departamento: "—",
        origem: "—",
        status: cls === "OBRIGATORIA" ? "SOBRA" : cls,
        classificacao: cls,
      });
    });
  });
  return out;
}

// ─── Listagem tabular do motor (para a aba "Motor de regras") ───────────────
export type MotorLinha = {
  nivel: "FEDERAL" | "PERIODICIDADE" | "ESTADUAL" | "ESTADUAL ST" | "MUNICIPAL" | "FOLHA" | "PARTICULAR" | "PRODUTOR RURAL";
  chave: string; // regime, grupo, UF, município...
  obrigacao: string;
  departamento: string; // FISCAL / FOLHA / CONTABIL / —
  dept_original: string; // FISCAL/MTZ, FOLHA/MTZ/FL...
  escopo: Escopo;
};

export function motorLinhas(m?: Motor): MotorLinha[] {
  const mm: Motor = m ?? motor;
  const out: MotorLinha[] = [];
  const add = (l: MotorLinha) => out.push(l);


  Object.entries(mm.federal_por_regime).forEach(([reg, bloco]) => {
    (["FISCAL", "FOLHA", "CONTABIL"] as Depto[]).forEach((d) =>
      (bloco[d] || []).forEach((i) =>
        add({
          nivel: "FEDERAL", chave: reg, obrigacao: i.obrigacao, departamento: d,
          dept_original: i.dept_original || d, escopo: escopoDe(i.dept_original, i.somente_matriz),
        }),
      ),
    );
  });

  Object.entries(mm.contabil_periodicidade.grupos).forEach(([grupo, itens]) =>
    itens.forEach((o) =>
      add({ nivel: "PERIODICIDADE", chave: grupo, obrigacao: o, departamento: "CONTABIL", dept_original: "CONTABIL/MTZ", escopo: "Somente Matriz" }),
    ),
  );

  mm.folha_particularidades.adiantamento.quando_sim.forEach((o) =>
    add({ nivel: "FOLHA", chave: "Adiantamento = Sim", obrigacao: o, departamento: "FOLHA", dept_original: "FOLHA", escopo: "Todos" }),
  );
  Object.entries(mm.folha_particularidades.fechamento_folha.opcoes).forEach(([opt, lista]) =>
    lista.forEach((o) =>
      add({ nivel: "FOLHA", chave: `Fechamento folha: ${opt}`, obrigacao: o, departamento: "FOLHA", dept_original: "FOLHA", escopo: "Todos" }),
    ),
  );

  Object.entries(mm.estadual_normal_por_uf || {}).forEach(([uf, porRegime]) =>
    Object.entries(porRegime).forEach(([reg, lista]) =>
      lista.forEach((o) =>
        add({ nivel: "ESTADUAL", chave: `${uf} — ${reg}`, obrigacao: o, departamento: "FISCAL", dept_original: "FISCAL", escopo: "Todos" }),
      ),
    ),
  );
  Object.entries(mm.estadual_substituto_por_uf || {}).forEach(([uf, lista]) =>
    lista.forEach((i) =>
      add({ nivel: "ESTADUAL ST", chave: uf, obrigacao: i.obrigacao, departamento: "FISCAL", dept_original: "FISCAL", escopo: "Todos" }),
    ),

  );
  Object.entries(mm.municipal_por_municipio || {}).forEach(([mun, lista]) =>
    lista.forEach((i) =>
      add({ nivel: "MUNICIPAL", chave: mun, obrigacao: i.obrigacao, departamento: "FISCAL", dept_original: "FISCAL", escopo: "Todos" }),
    ),
  );

  const pr = mm.produtor_rural?.federal;
  if (pr)
    (["FISCAL", "FOLHA", "CONTABIL"] as Depto[]).forEach((d) =>
      (pr[d] || []).forEach((i) =>
        add({
          nivel: "PRODUTOR RURAL", chave: "CAEPF — Produtor Rural", obrigacao: i.obrigacao, departamento: d,
          dept_original: i.dept_original || d, escopo: escopoDe(i.dept_original, i.somente_matriz),
        }),
      ),
    );

  (mm.particularidades_fiscal?.lista || []).forEach((p) =>
    add({ nivel: "PARTICULAR", chave: p.mininome || "Particularidade", obrigacao: p.obrigacao, departamento: "—", dept_original: "—", escopo: "Todos" }),
  );

  return out;
}
