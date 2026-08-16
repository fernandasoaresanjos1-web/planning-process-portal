// Gestão de Obrigações — Sistema de Auditoria (motor v3.1)
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { biLoadAll } from "@/lib/bi-empresas";
import {
  baseEsperada,
  comparar,
  motor,
  motorLinhas,
  type BaseEsperada,
  type Depto,
  type Divergencia,
  type ObrigacaoReal,
  norm,
  classificar,
  aplicarMotor,
  escopoDe,
  tagsDoDepto,
  type MotorLinha,
} from "@/lib/auditoria-obrigacoes";
import {
  aplicarPatch,
  carregarDraft,
  carregarLog,
  carregarPublicado,
  patchAlteracoes,
  patchIgual,
  patchVazio,
  publicar as publicarPatch,
  registrarLog,
  regraKey,
  salvarDraft,
  type LogEntry,
  type MotorPatch,
  type Nivel,
  type Regra,
} from "@/lib/motor-regras";
import { sincronizarPaginaAcessorias } from "@/lib/acessorias.functions";
import { carregarObrigacoesApi } from "@/lib/acessorias-api";
import { carregarLocalizacoes } from "@/lib/localizacao-empresas";
import { carregarObservacoes, salvarObservacao } from "@/lib/tags-empresas";



const C = {
  green: "#0AE18C", greenDark: "#00BF63", charcoal: "#1A1A1A",
  gray70: "#4A4A4A", gray50: "#646464", gray10: "#E8E8E8", gray05: "#F5F5F5",
  border: "#E2E2E2", white: "#fff", red: "#FF4444", amber: "#D97706", blue: "#14C8FA", purple: "#7C3AED",
};

type TabId = "visao" | "faltas" | "sobras" | "revisao" | "empresas" | "regras" | "log";

const DEPTOS: Depto[] = ["CONTABIL", "FOLHA", "FISCAL"];
const DEPTO_LABEL: Record<Depto, string> = { CONTABIL: "Equipe Contábil", FOLHA: "Equipe DP/Folha", FISCAL: "Equipe Fiscal" };

const st = {
  card: { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" as const },
  th: { fontSize: 10, fontWeight: 800 as const, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.gray50, textAlign: "left" as const, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, background: C.gray05, whiteSpace: "nowrap" as const },
  td: { fontSize: 12, color: C.charcoal, padding: "8px 10px", borderBottom: `1px solid ${C.gray10}`, verticalAlign: "top" as const },
  btn: (active?: boolean) => ({ fontFamily: "inherit", fontSize: 12, fontWeight: 700 as const, padding: "7px 14px", borderRadius: 8, border: `1px solid ${active ? C.charcoal : C.border}`, background: active ? C.charcoal : C.white, color: active ? "#fff" : C.gray70, cursor: "pointer" }),
};

const selStyle = { fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, maxWidth: 240 } as const;

function DetalheEmpresa({
  emp, reais, observacao, onSalvarObs, onClose,
}: {
  emp: BaseEsperada;
  reais: ObrigacaoReal[];
  observacao: string;
  onSalvarObs: (texto: string) => Promise<void>;
  onClose: () => void;
}) {
  const [obs, setObs] = useState(observacao);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  useEffect(() => { setObs(observacao); setSalvo(false); }, [observacao, emp.cnpj]);



  const cadastradas = new Set(
    reais
      .filter((r) => r.cnpj.replace(/\D/g, "") === emp.cnpj.replace(/\D/g, ""))
      .map((r) => norm(r.obrigacao)),
  );
  const temApi = cadastradas.size > 0;
  const blocos = DEPTOS.filter((d) => emp.itens.some((i) => i.departamento === d));

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{ width: "min(620px,100%)", background: C.white, height: "100%", overflowY: "auto", padding: 20, boxShadow: "-8px 0 30px rgba(0,0,0,.12)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.gray50 }}>
              {emp.cnpj} · {emp.matriz ? "Matriz" : "Filial"}
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: C.charcoal, margin: "2px 0 4px" }}>{emp.razao}</h2>
            <div style={{ fontSize: 12, color: C.gray50 }}>{emp.regime} · {emp.itens.length} obrigações esperadas</div>
            <div style={{ fontSize: 11, color: C.gray50, marginTop: 4 }}>
              Cont.: {emp.equipe_contabil || "—"} · DP: {emp.equipe_pessoal || "—"} · Fiscal: {emp.equipe_fiscal || "—"}
            </div>
          </div>
          <button style={st.btn()} onClick={onClose}>Fechar</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.gray50, marginBottom: 4 }}>
            Observação da empresa
          </div>
          <textarea
            rows={3}
            value={obs}
            onChange={(e) => { setObs(e.target.value); setSalvo(false); }}
            placeholder="Digite uma observação..."
            style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, width: "100%", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <button
              style={st.btn(true)}
              disabled={salvando}
              onClick={() => {
                setSalvando(true);
                onSalvarObs(obs)
                  .then(() => setSalvo(true))
                  .catch((e) => alert((e as Error).message))
                  .finally(() => setSalvando(false));
              }}
            >{salvando ? "⏳ Salvando…" : "Salvar"}</button>
            {salvo && <span style={{ fontSize: 11, color: C.greenDark, fontWeight: 700 }}>✓ Observação salva</span>}
          </div>
        </div>



        {blocos.map((dep) => {
          const itens = emp.itens.filter((i) => i.departamento === dep);
          const grupos = Array.from(new Set(itens.map((i) => i.origem)));
          return (
            <div key={dep} style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: C.charcoal, borderBottom: `2px solid ${C.green}`, paddingBottom: 4 }}>
                {dep} <span style={{ color: C.gray50, fontWeight: 600 }}>({itens.length})</span>
              </div>
              {grupos.map((g) => (
                <div key={g} style={{ marginTop: 10, paddingLeft: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.gray50, textTransform: "uppercase" }}>{g}</div>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {itens.filter((i) => i.origem === g).map((i) => {
                      const ok = cadastradas.has(norm(i.obrigacao));
                      return (
                        <li key={i.obrigacao} style={{ fontSize: 12, color: C.charcoal, padding: "2px 0", display: "flex", gap: 8, alignItems: "center" }}>
                          <span>{i.obrigacao}</span>
                          {temApi && <StatusChip s={ok ? "OK" : "FALTA"} />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          );
        })}

        {temApi && (() => {
          const esperados = new Set(emp.itens.map((i) => norm(i.obrigacao)));
          const extras = reais
            .filter((r) => r.cnpj.replace(/\D/g, "") === emp.cnpj.replace(/\D/g, "") && !esperados.has(norm(r.obrigacao)))
            .map((r) => r.obrigacao);
          if (!extras.length) return null;
          return (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.charcoal, borderBottom: `2px solid ${C.amber}`, paddingBottom: 4 }}>
                CADASTRADAS FORA DAS REGRAS <span style={{ color: C.gray50, fontWeight: 600 }}>({extras.length})</span>
              </div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {extras.map((o) => (
                  <li key={o} style={{ fontSize: 12, padding: "2px 0", display: "flex", gap: 8, alignItems: "center" }}>
                    <span>{o}</span><StatusChip s={classificar(o) === "OBRIGATORIA" ? "SOBRA" : classificar(o) === "PARTICULAR" ? "PARTICULAR" : "DESCONHECIDA"} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {!temApi && (
          <div style={{ marginTop: 18, fontSize: 12, color: C.gray50 }}>
            Sincronize a API do Acessórias para comparar item por item com o que está cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}

const acaoBtn = { fontFamily: "inherit", fontSize: 13, padding: "2px 6px", marginRight: 4, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer" } as const;

const NIVEIS: Nivel[] = ["FEDERAL", "PERIODICIDADE", "ESTADUAL", "ESTADUAL ST", "MUNICIPAL", "FOLHA", "PARTICULAR", "PRODUTOR RURAL"];

function ParticularForm({
  valor, onCancel, onSave,
}: {
  valor: { key: string | null; obrigacao: string; mininome: string };
  onCancel: () => void;
  onSave: (v: { key: string | null; obrigacao: string; mininome: string }) => void;
}) {
  const [obrigacao, setObrigacao] = useState(valor.obrigacao);
  const [mininome, setMininome] = useState(valor.mininome);
  const label = { fontSize: 10, fontWeight: 800 as const, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.gray50, display: "block", marginBottom: 4 };
  const inp = { fontFamily: "inherit", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, width: "100%" } as const;

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...st.card, width: 480, maxWidth: "100%", padding: 18, display: "grid", gap: 12 }}>
        <strong style={{ fontSize: 15 }}>{valor.key ? "Editar particularidade" : "Nova particularidade"}</strong>
        <div>
          <span style={label}>Obrigação</span>
          <input style={inp} value={obrigacao} onChange={(e) => setObrigacao(e.target.value)} placeholder="Nome exato da obrigação no Acessórias" />
        </div>
        <div>
          <span style={label}>Mininome</span>
          <input style={inp} value={mininome} onChange={(e) => setMininome(e.target.value)} placeholder="Ex.: RET LUCROS" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={st.btn()} onClick={onCancel}>Cancelar</button>
          <button style={st.btn(true)} disabled={!obrigacao.trim()} onClick={() => onSave({ key: valor.key, obrigacao, mininome })}>Salvar rascunho</button>
        </div>
      </div>
    </div>
  );
}


function RegraForm({
  valor, niveis, onCancel, onSave,
}: {
  valor: { key: string | null; regra: Regra };
  niveis: Nivel[];
  onCancel: () => void;
  onSave: (v: { key: string | null; regra: Regra }) => void;
}) {
  const [r, setR] = useState<Regra>(valor.regra);
  const set = <K extends keyof Regra>(k: K, v: Regra[K]) => setR((p) => ({ ...p, [k]: v }));
  const label = { fontSize: 10, fontWeight: 800 as const, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.gray50, display: "block", marginBottom: 4 };
  const inp = { fontFamily: "inherit", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, width: "100%" } as const;

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...st.card, width: 520, maxWidth: "100%", padding: 18, display: "grid", gap: 12 }}>
        <strong style={{ fontSize: 15 }}>{valor.key ? "Editar obrigação" : "Nova obrigação"}</strong>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <span style={label}>Nível</span>
            <select style={inp} value={r.nivel} onChange={(e) => set("nivel", e.target.value as Nivel)}>
              {niveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Departamento</span>
            <select style={inp} value={r.departamento} onChange={(e) => set("departamento", e.target.value)}>
              {["FISCAL", "FOLHA", "CONTABIL", "—"].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span style={label}>Regime / Grupo / UF / Município</span>
          <input style={inp} value={r.chave} onChange={(e) => set("chave", e.target.value)} placeholder="Ex.: LUCRO PRESUMIDO, Mensal, SP — Regime Normal, CURITIBA/PR" />
        </div>
        <div>
          <span style={label}>Obrigação</span>
          <input style={inp} value={r.obrigacao} onChange={(e) => set("obrigacao", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <span style={label}>Dept. original</span>
            <input style={inp} value={r.dept_original} onChange={(e) => setR((p) => ({ ...p, dept_original: e.target.value, escopo: escopoDe(e.target.value, p.escopo === "Somente Matriz") }))} placeholder="FISCAL/MTZ, FOLHA/MTZ/FL, FOLHA" />
          </div>
          <div>
            <span style={label}>Escopo</span>
            <select style={inp} value={r.escopo} onChange={(e) => set("escopo", e.target.value as Regra["escopo"])}>
              {["Somente Matriz", "Matriz e Filial", "Todos"].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={st.btn()} onClick={onCancel}>Cancelar</button>
          <button style={st.btn(true)} onClick={() => onSave({ key: valor.key, regra: r })}>Salvar rascunho</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, color }: { label: string; value: string | number; hint?: string; color?: string }) {
  return (
    <div style={{ ...st.card, padding: 14, borderTop: `3px solid ${color || C.green}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.gray50 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.charcoal, lineHeight: 1.15 }}>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</div>
      {hint && <div style={{ fontSize: 11, color: C.gray50 }}>{hint}</div>}
    </div>
  );
}

function StatusChip({ s }: { s: Divergencia["status"] }) {
  const map: Record<Divergencia["status"], { bg: string; c: string }> = {
    OK: { bg: "rgba(10,225,140,.12)", c: C.greenDark },
    FALTA: { bg: "rgba(255,68,68,.12)", c: C.red },
    SOBRA: { bg: "rgba(217,119,6,.12)", c: C.amber },
    PARTICULAR: { bg: "rgba(20,200,250,.16)", c: "#0B7FA0" },
    DESCONHECIDA: { bg: "rgba(124,58,237,.12)", c: C.purple },
  };
  const m = map[s];
  return <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 20, background: m.bg, color: m.c }}>{s}</span>;
}

function equipeDe(d: { equipe_contabil: string; equipe_fiscal: string; equipe_pessoal: string }, dep: Depto) {
  if (dep === "FISCAL") return d.equipe_fiscal || "";
  if (dep === "FOLHA") return d.equipe_pessoal || "";
  return d.equipe_contabil || "";
}

export default function GestaoObrigacoes() {
  const [tab, setTab] = useState<TabId>("visao");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [esperada, setEsperada] = useState<BaseEsperada[]>([]);
  const [reais, setReais] = useState<ObrigacaoReal[]>([]);
  const [apiInfo, setApiInfo] = useState<{ configurado: boolean; total: number; error?: string } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [progresso, setProgresso] = useState<{ empresas: number; pagina: number } | null>(null);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<BaseEsperada | null>(null);
  const [fRegime, setFRegime] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fCont, setFCont] = useState("");
  const [fDp, setFDp] = useState("");
  const [fFiscal, setFFiscal] = useState("");
  const [busca, setBusca] = useState("");
  const [depFiltro, setDepFiltro] = useState<"" | Depto>("");
  const [rBusca, setRBusca] = useState("");
  const [rNivel, setRNivel] = useState("");
  const [rDepto, setRDepto] = useState("");
  const [rChave, setRChave] = useState("");
  const [rEscopo, setREscopo] = useState("");
  const [draft, setDraft] = useState<MotorPatch>(patchVazio());
  const [pub, setPub] = useState<MotorPatch>(patchVazio());
  const [log, setLog] = useState<LogEntry[]>([]);
  const [editando, setEditando] = useState<{ key: string | null; regra: Regra } | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [pagina, setPagina] = useState(0);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [editandoPart, setEditandoPart] = useState<{ key: string | null; obrigacao: string; mininome: string } | null>(null);
  const [pBusca, setPBusca] = useState("");
  const [pMini, setPMini] = useState("");
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});


  const syncPagina = useServerFn(sincronizarPaginaAcessorias);

  async function carregarBase() {
    setLoading(true);
    setErro("");
    try {
      setMsg("Carregando base de informações de empresas...");
      const [{ empresas, contCfg, folhaCfg, tagsMap: tm }, locais, obsMap] = await Promise.all([
        biLoadAll(),
        carregarLocalizacoes().catch(() => ({})),
        carregarObservacoes().catch(() => ({} as Record<string, string>)),
      ]);
      setTagsMap(tm);
      setEsperada(baseEsperada(empresas, contCfg, folhaCfg, locais, tm));
      setObservacoes(obsMap);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
      setMsg("");
    }
  }


  async function carregarSalvos() {
    try {
      const { reais: r, sincronizadoEm: em } = await carregarObrigacoesApi();
      setReais(r);
      setSincronizadoEm(em);
      setApiInfo((a) => ({ configurado: a?.configurado ?? true, total: r.length, error: a?.error }));
    } catch (e) {
      setApiInfo({ configurado: true, total: 0, error: (e as Error).message });
    }
  }

  async function sincronizarApi() {
    if (sincronizando) return;
    setSincronizando(true);
    setProgresso({ empresas: 0, pagina: 0 });
    setApiInfo(null);
    let empresas = 0;
    try {
      for (let pagina = 1; pagina <= 400; pagina++) {
        const res = await syncPagina({ data: { pagina } });
        if (!res.configurado || res.error) {
          setApiInfo({ configurado: res.configurado, total: empresas, error: res.error });
          break;
        }
        empresas += res.gravadas;
        setProgresso({ empresas, pagina });
        if (res.fim) break;
        // rate limit da API: 100 req/min → ~600ms entre chamadas
        await new Promise((r) => setTimeout(r, 650));
      }
      await carregarSalvos();
    } catch (e) {
      setApiInfo({ configurado: true, total: empresas, error: (e as Error).message });
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const [p, d, l] = await Promise.all([
        carregarPublicado().catch(() => patchVazio()),
        carregarDraft().catch(() => patchVazio()),
        carregarLog().catch(() => [] as LogEntry[]),
      ]);
      setPub(p);
      setDraft(d);
      setLog(l);
      aplicarMotor(aplicarPatch(p));
      await carregarBase();
    })();
    void carregarSalvos();
    
  }, []);

  const divergencias = useMemo(() => (reais.length ? comparar(esperada, reais) : []), [esperada, reais]);

  const filtroTexto = <T extends { razao: string; cnpj: string }>(rows: T[]) =>
    rows.filter((r) => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return r.razao.toLowerCase().includes(q) || r.cnpj.replace(/\D/g, "").includes(q.replace(/\D/g, ""));
    });

  const filtroDiv = (rows: Divergencia[]) =>
    filtroTexto(rows).filter((r) => (depFiltro ? r.departamento === depFiltro : true));

  const totalEsperado = esperada.reduce((s, e) => s + e.itens.length, 0);
  const faltas = divergencias.filter((d) => d.status === "FALTA");
  const sobras = divergencias.filter((d) => d.status === "SOBRA");
  const particulares = divergencias.filter((d) => d.status === "PARTICULAR");
  const desconhecidas = divergencias.filter((d) => d.status === "DESCONHECIDA");
  const oks = divergencias.filter((d) => d.status === "OK");
  const cobertura = totalEsperado ? Math.round((oks.length / totalEsperado) * 100) : 0;

  const POR_PAGINA = 200;
  const baseTabela = tab === "faltas" ? faltas : tab === "sobras" ? sobras : [...particulares, ...desconhecidas];
  const linhasTabela = filtroDiv(baseTabela).filter((r) => (filtroStatus ? r.status === filtroStatus : true));
  const totalPaginas = Math.max(1, Math.ceil(linhasTabela.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const linhasVisiveis = linhasTabela.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  useEffect(() => { setPagina(0); }, [tab, busca, depFiltro, filtroStatus]);



  // Resumo por departamento → por TAG do departamento
  const resumos = useMemo(() => {
    const out: Record<Depto, Array<{ nome: string; empresas: number; esperado: number; falta: number; sobra: number }>> = {
      CONTABIL: [], FOLHA: [], FISCAL: [],
    };
    DEPTOS.forEach((dep) => {
      const m = new Map<string, { empresas: Set<string>; esperado: number; falta: number; sobra: number }>();
      const get = (k: string) => {
        if (!m.has(k)) m.set(k, { empresas: new Set(), esperado: 0, falta: 0, sobra: 0 });
        return m.get(k)!;
      };
      const tagsDe = (cnpj: string) =>
        tagsDoDepto(tagsMap[String(cnpj || "").replace(/\D/g, "")] || [], dep);
      esperada.forEach((e) => {
        if (!e.deptos.includes(dep)) return;
        const qtd = e.itens.filter((i) => i.departamento === dep).length;
        const arr = tagsDe(e.cnpj);
        if (!arr.length) return; // empresa sem TAG com gestor → fora do resumo
        arr.forEach((tag) => {
          const r = get(tag);
          r.empresas.add(e.cnpj);
          r.esperado += qtd;
        });
      });
      divergencias.forEach((d) => {
        if (d.departamento !== dep) return;
        const arr = tagsDe(d.cnpj);
        if (!arr.length) return;
        arr.forEach((tag) => {
          const r = get(tag);
          if (d.status === "FALTA") r.falta++;
          if (d.status === "SOBRA") r.sobra++;
        });
      });

      out[dep] = Array.from(m.entries())
        .map(([nome, v]) => ({ nome, empresas: v.empresas.size, esperado: v.esperado, falta: v.falta, sobra: v.sobra }))
        .sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
    });
    return out;
  }, [esperada, divergencias, tagsMap]);

  const opcoes = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter((v) => v && v.trim()))).sort();
    return {
      regimes: uniq(esperada.map((e) => e.regime)),
      cont: uniq(esperada.map((e) => e.equipe_contabil)),
      dp: uniq(esperada.map((e) => e.equipe_pessoal)),
      fiscal: uniq(esperada.map((e) => e.equipe_fiscal)),
    };
  }, [esperada]);

  const esperadaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    return esperada.filter((e) => {
      if (q && !(e.razao.toLowerCase().includes(q) || (qd && e.cnpj.replace(/\D/g, "").includes(qd)))) return false;
      if (fRegime && e.regime !== fRegime) return false;
      if (fTipo && (fTipo === "Matriz") !== e.matriz) return false;
      if (fCont && e.equipe_contabil !== fCont) return false;
      if (fDp && e.equipe_pessoal !== fDp) return false;
      if (fFiscal && e.equipe_fiscal !== fFiscal) return false;
      return true;
    });
  }, [esperada, busca, fRegime, fTipo, fCont, fDp, fFiscal]);

  function exportarCsv(nome: string, headers: string[], rows: (string | number)[][]) {
    const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const motorDraft = useMemo(() => aplicarPatch(draft), [draft]);
  const linhasMotor = useMemo(() => motorLinhas(motorDraft), [motorDraft]);
  const alteracoesPendentes = useMemo(() => (patchIgual(draft, pub) ? 0 : patchAlteracoes(draft)), [draft, pub]);

  async function mutarDraft(novo: MotorPatch, acao: "ADICAO" | "EDICAO" | "EXCLUSAO", descricao: string) {
    setDraft(novo);
    await salvarDraft(novo);
    setLog(await registrarLog({ acao, usuario: "—", descricao }));
  }

  async function excluirRegra(l: MotorLinha) {
    const key = regraKey(l);
    if (!confirm(`Excluir a obrigação "${l.obrigacao}" (${l.nivel} — ${l.chave})?`)) return;
    const novo: MotorPatch = {
      removidas: [...new Set([...draft.removidas, key])],
      adicionadas: draft.adicionadas.filter((a) => regraKey(a) !== key),
      editadas: Object.fromEntries(Object.entries(draft.editadas).filter(([k]) => k !== key)),
    };
    await mutarDraft(novo, "EXCLUSAO", `${l.nivel} — ${l.chave} — ${l.obrigacao} (${l.departamento})`);
  }

  async function salvarRegra(alvo: { key: string | null; regra: Regra }) {
    const r = alvo.regra;
    if (!r.obrigacao.trim() || !r.chave.trim()) return;
    let novo: MotorPatch;
    if (alvo.key) {
      const adicionadaExistente = draft.adicionadas.some((a) => regraKey(a) === alvo.key);
      novo = adicionadaExistente
        ? { ...draft, adicionadas: draft.adicionadas.map((a) => (regraKey(a) === alvo.key ? r : a)) }
        : { ...draft, editadas: { ...draft.editadas, [alvo.key]: r } };
    } else {
      novo = { ...draft, adicionadas: [...draft.adicionadas, r] };
    }
    setEditando(null);
    await mutarDraft(novo, alvo.key ? "EDICAO" : "ADICAO", `${r.nivel} — ${r.chave} — ${r.obrigacao} (${r.departamento} / ${r.escopo})`);
  }

  async function publicarRegras() {
    setPublicando(true);
    try {
      await publicarPatch(draft);
      setPub(draft);
      aplicarMotor(aplicarPatch(draft));
      setLog(await registrarLog({ acao: "PUBLICACAO", usuario: "—", descricao: `${patchAlteracoes(draft)} alteração(ões) publicadas` }));
      await carregarBase();
    } finally {
      setPublicando(false);
    }
  }

  async function descartarRascunho() {
    if (!confirm("Descartar as alterações pendentes e voltar ao motor publicado?")) return;
    setDraft(pub);
    await salvarDraft(pub);
    setLog(await registrarLog({ acao: "DESCARTE", usuario: "—", descricao: "Rascunho descartado" }));
  }
  const niveis = useMemo(() => Array.from(new Set(linhasMotor.map((l) => l.nivel))).sort(), [linhasMotor]);
  const deptosRegras = useMemo(() => Array.from(new Set(linhasMotor.map((l) => l.departamento))).sort(), [linhasMotor]);
  const chavesRegras = useMemo(
    () => Array.from(new Set(linhasMotor.filter((l) => (rNivel ? l.nivel === rNivel : true)).map((l) => l.chave))).sort(),
    [linhasMotor, rNivel],
  );
  const particularidades = useMemo(() => {
    const q = pBusca.trim().toLowerCase();
    const qm = pMini.trim().toLowerCase();
    return linhasMotor
      .filter((l) => l.nivel === "PARTICULAR")
      .filter((l) => (q ? l.obrigacao.toLowerCase().includes(q) : true))
      .filter((l) => (qm ? (l.chave || "").toLowerCase().includes(qm) : true))
      .sort((a, b) => a.obrigacao.localeCompare(b.obrigacao, "pt-BR"));
  }, [linhasMotor, pBusca, pMini]);

  async function salvarParticularidade(v: { key: string | null; obrigacao: string; mininome: string }) {
    if (!v.obrigacao.trim()) return;
    await salvarRegra({
      key: v.key,
      regra: {
        nivel: "PARTICULAR",
        chave: v.mininome.trim() || "Particularidade",
        obrigacao: v.obrigacao.trim(),
        departamento: "—",
        dept_original: "—",
        escopo: "Todos",
      },
    });
    setEditandoPart(null);
  }

  const linhasFiltradas = useMemo(() => {
    const q = rBusca.trim().toLowerCase();
    return linhasMotor.filter((l) => {
      if (rNivel && l.nivel !== rNivel) return false;
      if (rDepto && l.departamento !== rDepto) return false;
      if (rChave && l.chave !== rChave) return false;
      if (rEscopo && l.escopo !== rEscopo) return false;
      if (!q) return true;
      return `${l.nivel} ${l.chave} ${l.obrigacao} ${l.departamento} ${l.dept_original}`.toLowerCase().includes(q);
    });
  }, [linhasMotor, rBusca, rNivel, rDepto, rChave, rEscopo]);

  function exportar(nome: string, headers: string[], rows: unknown[][]) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, nome);
  }

  const tabs: Array<{ id: TabId; nome: string; badge?: number }> = [
    { id: "visao", nome: "Visão geral" },
    { id: "faltas", nome: "Faltas", badge: faltas.length },
    { id: "sobras", nome: "Sobras", badge: sobras.length },
    { id: "revisao", nome: "Particulares / Desconhecidas", badge: particulares.length + desconhecidas.length },
    { id: "empresas", nome: "Base esperada", badge: esperada.length },
    { id: "regras", nome: "Motor de regras" },
    { id: "log", nome: "Log de alterações", badge: log.length },
  ];

  return (
    <div style={{ fontFamily: "Poppins, system-ui, sans-serif", maxWidth: 1600, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.gray50 }}>Acessórias</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.charcoal, margin: "2px 0 4px" }}>Gestão de Obrigações — Sistema de Auditoria</h1>
          <p style={{ fontSize: 13, color: C.gray50, margin: 0 }}>
            Motor v{motor.versao} — auditoria por departamento (TAG Contábil, DP e Fiscal), com regra matriz/filial por obrigação.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={st.btn()} onClick={() => void carregarBase()}>🔄 Atualizar base ativa</button>
          <button style={st.btn(true)} disabled={sincronizando} onClick={() => void sincronizarApi()}>
            {sincronizando ? `⏳ Sincronizando… ${progresso?.empresas ?? 0} empresas` : "🔗 Sincronizar API Acessórias"}
          </button>
        </div>
      </div>

      {sincronizando && progresso && (
        <div style={{ marginTop: 12, ...st.card, padding: 12, borderLeft: `3px solid ${C.blue}`, fontSize: 12, color: C.gray70 }}>
          Sincronizando API do Acessórias — página {progresso.pagina}, {progresso.empresas.toLocaleString("pt-BR")} empresas processadas.
        </div>
      )}
      {!sincronizando && sincronizadoEm && (
        <div style={{ marginTop: 12, fontSize: 11, color: C.gray50 }}>
          Última sincronização da API: {new Date(sincronizadoEm).toLocaleString("pt-BR")} — {reais.length.toLocaleString("pt-BR")} obrigações cadastradas.
        </div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 12, color: C.gray50 }}>{msg}</div>}
      {erro && <div style={{ marginTop: 12, fontSize: 12, color: C.red }}>{erro}</div>}
      {apiInfo?.error && (
        <div style={{ marginTop: 12, ...st.card, padding: 12, borderLeft: `3px solid ${C.amber}`, fontSize: 12, color: C.gray70 }}>
          <strong>API Acessórias:</strong> {apiInfo.error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 16 }}>
        <Kpi label="Empresas auditáveis" value={esperada.length} hint="com TAG de algum depto." />
        <Kpi label="Obrigações esperadas" value={totalEsperado} color={C.blue} />
        <Kpi label="Faltando cadastrar" value={faltas.length} color={C.red} hint={reais.length ? undefined : "aguardando API"} />
        <Kpi label="Sobrando (não previstas)" value={sobras.length} color={C.amber} />
        <Kpi label="Particulares" value={particulares.length} color="#0B7FA0" />
        <Kpi label="Desconhecidas" value={desconhecidas.length} color={C.purple} hint="revisar mapeamento" />
        <Kpi label="Cobertura" value={`${cobertura}%`} color={C.greenDark} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 12px", borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
        {tabs.map((t) => (
          <button key={t.id} style={st.btn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.nome}
            {t.badge !== undefined && (
              <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 6, background: tab === t.id ? "rgba(255,255,255,.2)" : C.gray05 }}>
                {t.badge.toLocaleString("pt-BR")}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab !== "regras" && tab !== "visao" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por razão social ou CNPJ..."
            style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, minWidth: 280 }}
          />
          {tab !== "empresas" && (
            <select value={depFiltro} onChange={(e) => setDepFiltro(e.target.value as "" | Depto)} style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <option value="">Todos os departamentos</option>
              {DEPTOS.map((d) => <option key={d} value={d}>{DEPTO_LABEL[d]}</option>)}
            </select>
          )}
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: "center", color: C.gray50, fontSize: 13 }}>Carregando...</div>}

      {!loading && tab === "visao" && (
        <div style={{ display: "grid", gap: 14 }}>
          {DEPTOS.map((dep) => (
            <div key={dep} style={st.card}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>Indicadores por TAG — {DEPTO_LABEL[dep]}</strong>
                <button
                  style={st.btn()}
                  onClick={() => exportar(`auditoria-${dep.toLowerCase()}.xlsx`, ["TAG", "Empresas", "Esperadas", "Faltas", "Sobras"], resumos[dep].map((r) => [r.nome, r.empresas, r.esperado, r.falta, r.sobra]))}
                >Exportar</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={st.th}>TAG</th><th style={st.th}>Empresas</th><th style={st.th}>Esperadas</th><th style={st.th}>Faltas</th><th style={st.th}>Sobras</th></tr></thead>
                  <tbody>
                    {resumos[dep].length === 0 ? (
                      <tr><td style={{ ...st.td, color: C.gray50 }} colSpan={5}>Nenhuma empresa com TAG deste departamento.</td></tr>
                    ) : resumos[dep].map((r) => (
                      <tr key={r.nome}>
                        <td style={st.td}><strong>{r.nome}</strong></td>
                        <td style={st.td}>{r.empresas}</td>
                        <td style={st.td}>{r.esperado.toLocaleString("pt-BR")}</td>
                        <td style={{ ...st.td, color: r.falta ? C.red : C.gray50, fontWeight: 700 }}>{r.falta}</td>
                        <td style={{ ...st.td, color: r.sobra ? C.amber : C.gray50 }}>{r.sobra}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (tab === "faltas" || tab === "sobras" || tab === "revisao") && (
        <div style={st.card}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>
              {tab === "faltas" ? "Obrigações esperadas e não cadastradas"
                : tab === "sobras" ? "Obrigações cadastradas fora das regras"
                : "Obrigações particulares e não mapeadas (não contam como falta/sobra)"}
            </strong>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {tab === "revisao" && (
                <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <option value="">Todos os status</option>
                  <option value="PARTICULAR">Somente particulares</option>
                  <option value="DESCONHECIDA">Somente desconhecidas</option>
                </select>
              )}
              <button
                style={st.btn()}
                onClick={() => {
                  exportar(`auditoria-${tab}.xlsx`, ["CNPJ", "Razão social", "Regime", "Equipe cont.", "Equipe DP", "Equipe fiscal", "Obrigação", "Departamento", "Origem", "Classificação", "Status"], linhasTabela.map((d) => [d.cnpj, d.razao, d.regime, d.equipe_contabil, d.equipe_pessoal, d.equipe_fiscal, d.obrigacao, d.departamento, d.origem, d.classificacao, d.status]));
                }}
              >Exportar</button>
            </div>
          </div>
          {!reais.length ? (
            <div style={{ padding: 34, textAlign: "center", fontSize: 13, color: C.gray50 }}>
              Sem dados da API do Acessórias — sincronize a integração para gerar o cruzamento.
            </div>
          ) : (
            <>
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.gray70, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
                <span>
                  {linhasTabela.length.toLocaleString("pt-BR")} registro(s)
                  {tab === "revisao" && ` · ${particulares.length.toLocaleString("pt-BR")} particulares · ${desconhecidas.length.toLocaleString("pt-BR")} desconhecidas`}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button style={st.btn()} disabled={paginaAtual === 0} onClick={() => setPagina(Math.max(0, paginaAtual - 1))}>Anterior</button>
                  <span>Página {paginaAtual + 1} de {totalPaginas}</span>
                  <button style={st.btn()} disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(paginaAtual + 1)}>Próxima</button>
                </span>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={st.th}>CNPJ</th><th style={st.th}>Empresa</th><th style={st.th}>Regime</th><th style={st.th}>Equipe</th><th style={st.th}>Obrigação</th><th style={st.th}>Depto</th><th style={st.th}>Origem</th><th style={st.th}>Status</th></tr></thead>
                  <tbody>
                    {linhasVisiveis.map((d, i) => (
                      <tr key={`${paginaAtual}-${i}`}>
                        <td style={st.td}>{d.cnpj}</td>
                        <td style={st.td}>{d.razao}</td>
                        <td style={st.td}>{d.regime}</td>
                        <td style={st.td}>{(d.departamento !== "—" ? equipeDe(d, d.departamento) : d.equipe_contabil) || "—"}</td>
                        <td style={st.td}>{d.obrigacao}</td>
                        <td style={st.td}>{d.departamento}</td>
                        <td style={st.td}>{d.origem}</td>
                        <td style={st.td}><StatusChip s={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      )}

      {!loading && tab === "empresas" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={fRegime} onChange={(e) => setFRegime(e.target.value)} style={selStyle}>
              <option value="">Todos os regimes</option>
              {opcoes.regimes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={selStyle}>
              <option value="">Matriz e filial</option>
              <option value="Matriz">Somente matriz</option>
              <option value="Filial">Somente filial</option>
            </select>
            <select value={fCont} onChange={(e) => setFCont(e.target.value)} style={selStyle}>
              <option value="">Toda equipe contábil</option>
              {opcoes.cont.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={fDp} onChange={(e) => setFDp(e.target.value)} style={selStyle}>
              <option value="">Toda equipe DP</option>
              {opcoes.dp.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={fFiscal} onChange={(e) => setFFiscal(e.target.value)} style={selStyle}>
              <option value="">Toda equipe fiscal</option>
              {opcoes.fiscal.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {(fRegime || fTipo || fCont || fDp || fFiscal || busca) && (
              <button style={st.btn()} onClick={() => { setFRegime(""); setFTipo(""); setFCont(""); setFDp(""); setFFiscal(""); setBusca(""); }}>Limpar filtros</button>
            )}
          </div>

          <div style={st.card}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>
                Base esperada por empresa ({esperadaFiltrada.length.toLocaleString("pt-BR")} de {esperada.length.toLocaleString("pt-BR")}) — clique na linha para ver o detalhe
              </strong>
              <button
                style={st.btn()}
                onClick={() => {
                  const cnpjs = new Set(esperadaFiltrada.map((e) => e.cnpj.replace(/\D/g, "")));
                  const meta = new Map(esperadaFiltrada.map((e) => [e.cnpj.replace(/\D/g, ""), e]));
                  const obsDe = (c: string) => observacoes[c] || "";
                  const rows: (string | number)[][] = [];
                  if (reais.length) {
                    divergencias
                      .filter((d) => cnpjs.has(d.cnpj.replace(/\D/g, "")))
                      .forEach((d) => {
                        const c = d.cnpj.replace(/\D/g, "");
                        const e = meta.get(c);
                        rows.push([d.cnpj, d.razao, d.regime, e?.matriz ? "Matriz" : "Filial", d.departamento, d.origem, d.obrigacao, d.status, obsDe(c)]);
                      });
                  } else {
                    esperadaFiltrada.forEach((e) =>
                      e.itens.forEach((i) =>
                        rows.push([e.cnpj, e.razao, e.regime, e.matriz ? "Matriz" : "Filial", i.departamento, i.origem, i.obrigacao, "—", obsDe(e.cnpj.replace(/\D/g, ""))]),
                      ),
                    );
                  }
                  exportarCsv(
                    "base-esperada-detalhada.csv",
                    ["CNPJ", "Empresa", "Regime", "Tipo", "Departamento", "Origem", "Obrigação", "Status", "Observação"],
                    rows,
                  );
                }}
              >Exportar CSV detalhado</button>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={st.th}>CNPJ</th><th style={st.th}>Empresa</th><th style={st.th}>Regime</th><th style={st.th}>Tipo</th><th style={st.th}>Deptos</th><th style={st.th}>Cont.</th><th style={st.th}>Folha</th><th style={st.th}>Fiscal</th><th style={st.th}>Total</th><th style={st.th}>Obs.</th></tr></thead>
                <tbody>
                  {esperadaFiltrada.slice(0, 400).map((e) => (
                    <tr key={e.cnpj} onClick={() => setDetalhe(e)} style={{ cursor: "pointer" }}>
                      <td style={st.td}>{e.cnpj}</td>
                      <td style={{ ...st.td, fontWeight: 600 }}>{e.razao}</td>
                      <td style={st.td}>{e.regime}</td>
                      <td style={st.td}>{e.matriz ? "Matriz" : "Filial"}</td>
                      <td style={st.td}>{e.deptos.join(", ")}</td>
                      <td style={st.td}>{e.itens.filter((i) => i.departamento === "CONTABIL").length}</td>
                      <td style={st.td}>{e.itens.filter((i) => i.departamento === "FOLHA").length}</td>
                      <td style={st.td}>{e.itens.filter((i) => i.departamento === "FISCAL").length}</td>
                      <td style={{ ...st.td, fontWeight: 700 }}>{e.itens.length}</td>
                      <td style={st.td} title={observacoes[e.cnpj.replace(/\D/g, "")] || ""}>
                        {observacoes[e.cnpj.replace(/\D/g, "")] ? "📝" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
            {esperadaFiltrada.length > 400 && (
              <div style={{ padding: 10, fontSize: 11, color: C.gray50, textAlign: "center" }}>Exibindo 400 empresas — use os filtros ou exporte o CSV.</div>
            )}
          </div>
        </div>
      )}

      {editandoPart && (
        <ParticularForm
          valor={editandoPart}
          onCancel={() => setEditandoPart(null)}
          onSave={(v) => void salvarParticularidade(v)}
        />
      )}


      {detalhe && (
        <DetalheEmpresa
          emp={detalhe}
          reais={reais}
          observacao={observacoes[detalhe.cnpj.replace(/\D/g, "")] || ""}
          onSalvarObs={async (texto) => {
            const c = detalhe.cnpj.replace(/\D/g, "");
            await salvarObservacao(detalhe.cnpj, texto);
            setObservacoes((p) => ({ ...p, [c]: texto }));
          }}
          onClose={() => setDetalhe(null)}
        />
      )}

      {editando && (
        <RegraForm
          valor={editando}
          niveis={NIVEIS}
          onCancel={() => setEditando(null)}
          onSave={(v) => void salvarRegra(v)}
        />
      )}

      {!loading && tab === "log" && (
        <div style={st.card}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700 }}>
            Log de alterações do motor ({log.length.toLocaleString("pt-BR")})
          </div>
          <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={st.th}>Data/hora</th>
                  <th style={st.th}>Ação</th>
                  <th style={st.th}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...st.td, whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString("pt-BR")}</td>
                    <td style={{ ...st.td, whiteSpace: "nowrap", fontWeight: 700, color: e.acao === "EXCLUSAO" ? C.red : e.acao === "PUBLICACAO" ? C.greenDark : C.gray70 }}>{e.acao}</td>
                    <td style={st.td}>{e.descricao}</td>
                  </tr>
                ))}
                {!log.length && (
                  <tr><td style={st.td} colSpan={3}>Nenhuma alteração registrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === "regras" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ ...st.card, padding: 14, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", borderLeft: `3px solid ${alteracoesPendentes ? C.amber : C.greenDark}` }}>
            <div style={{ fontSize: 12, color: C.gray70 }}>
              <strong style={{ fontSize: 13 }}>
                {alteracoesPendentes ? `🟡 ${alteracoesPendentes} alteração(ões) pendente(s)` : "🟢 Publicado"}
              </strong>
              <div>
                Motor v{motor.versao} — atualizado em {motor.ultima_atualizacao}. Alterações ficam como rascunho e só valem após publicar.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={st.btn()}
                onClick={() =>
                  setEditando({
                    key: null,
                    regra: { nivel: "FEDERAL", chave: "", obrigacao: "", departamento: "FISCAL", dept_original: "FISCAL/MTZ", escopo: "Somente Matriz" },
                  })
                }
              >+ Nova obrigação</button>
              {alteracoesPendentes > 0 && (
                <>
                  <button style={st.btn()} onClick={() => void descartarRascunho()}>Descartar</button>
                  <button style={st.btn(true)} disabled={publicando} onClick={() => void publicarRegras()}>
                    {publicando ? "⏳ Publicando…" : "🚀 Publicar"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={rBusca}
              onChange={(e) => setRBusca(e.target.value)}
              placeholder="Buscar obrigação, regime, UF, município..."
              style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, minWidth: 300 }}
            />
            <select value={rNivel} onChange={(e) => setRNivel(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <option value="">Todos os níveis</option>
              {niveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={rDepto} onChange={(e) => setRDepto(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <option value="">Todos os departamentos</option>
              {deptosRegras.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={rChave} onChange={(e) => setRChave(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, maxWidth: 280 }}>
              <option value="">Todos os grupos / regimes / UF</option>
              {chavesRegras.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={rEscopo} onChange={(e) => setREscopo(e.target.value)} style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <option value="">Todos os escopos</option>
              <option value="Somente Matriz">Somente Matriz</option>
              <option value="Matriz e Filial">Matriz e Filial</option>
              <option value="Todos">Todos</option>
            </select>
          </div>

          <div style={st.card}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Regras do motor ({linhasFiltradas.length.toLocaleString("pt-BR")} de {linhasMotor.length.toLocaleString("pt-BR")})</strong>
              <button
                style={st.btn()}
                onClick={() => exportar("motor-regras-v31.xlsx", ["Nível", "Regime / Grupo / Local", "Obrigação", "Departamento", "Dept. original", "Escopo"], linhasFiltradas.map((l) => [l.nivel, l.chave, l.obrigacao, l.departamento, l.dept_original, l.escopo]))}
              >Exportar</button>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={st.th}>Nível</th>
                    <th style={st.th}>Regime / Grupo / Local</th>
                    <th style={st.th}>Obrigação</th>
                    <th style={st.th}>Departamento</th>
                    <th style={st.th}>Dept. original</th>
                    <th style={st.th}>Escopo</th>
                    <th style={st.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.slice(0, 1500).map((l, i) => (
                    <tr key={i}>
                      <td style={{ ...st.td, whiteSpace: "nowrap", fontWeight: 700, color: C.gray70 }}>{l.nivel}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap" }}>{l.chave}</td>
                      <td style={st.td}>{l.obrigacao}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap" }}>{l.departamento}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap", color: C.gray50 }}>{l.dept_original}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap", color: l.escopo === "Somente Matriz" ? C.gray70 : C.greenDark, fontWeight: 700 }}>{l.escopo}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap" }}>
                        <button title="Editar" style={acaoBtn} onClick={() => setEditando({ key: regraKey(l), regra: { ...l } })}>✏️</button>
                        <button title="Excluir" style={acaoBtn} onClick={() => void excluirRegra(l)}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {linhasFiltradas.length > 1500 && (
              <div style={{ padding: 10, fontSize: 11, color: C.gray50, textAlign: "center" }}>Exibindo 1.500 linhas — use os filtros ou exporte para ver tudo.</div>
            )}
          </div>

          <div style={st.card}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>Particularidades ({particularidades.length.toLocaleString("pt-BR")})</strong>
                <div style={{ fontSize: 11, color: C.gray50 }}>
                  Obrigações reconhecidas como particulares — deixam de aparecer como desconhecidas após publicar.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={pBusca} onChange={(e) => setPBusca(e.target.value)} placeholder="Buscar obrigação..." style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, minWidth: 220 }} />
                <input value={pMini} onChange={(e) => setPMini(e.target.value)} placeholder="Filtrar mininome..." style={{ fontFamily: "inherit", fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, minWidth: 160 }} />
                <button style={st.btn(true)} onClick={() => setEditandoPart({ key: null, obrigacao: "", mininome: "" })}>+ Nova Particularidade</button>
              </div>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={st.th}>Obrigação</th><th style={st.th}>Mininome</th><th style={st.th}>Ações</th></tr></thead>
                <tbody>
                  {particularidades.map((l, i) => (
                    <tr key={`${l.obrigacao}-${i}`}>
                      <td style={st.td}>{l.obrigacao}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap", color: C.gray50 }}>{l.chave}</td>
                      <td style={{ ...st.td, whiteSpace: "nowrap" }}>
                        <button title="Editar" style={acaoBtn} onClick={() => setEditandoPart({ key: regraKey(l), obrigacao: l.obrigacao, mininome: l.chave })}>✏️</button>
                        <button title="Excluir" style={acaoBtn} onClick={() => void excluirRegra(l)}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                  {!particularidades.length && (
                    <tr><td style={{ ...st.td, color: C.gray50 }} colSpan={3}>Nenhuma particularidade encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      )}
    </div>
  );
}
