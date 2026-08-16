import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Briefcase, Check, Clock, Download, Lock, LockOpen, Plus, Upload, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { biLoadAll, type BIEmpresa } from "@/lib/bi-empresas";
import {
  CARTEIRA_CARGOS,
  CARTEIRA_DEPTOS,
  cancelarVinculo,
  carregarLideranca,
  carregarTrava,
  criarVinculo,
  fmtData,
  getTagDepto,
  hoje,
  importarColaboradores,
  isCargoGestao,
  lerPlanilhaColaboradores,
  lideranca,
  listColaboradores,
  listHistorico,
  listVinculos,
  normDepto,
  publicarPendentesAte,
  publicarVinculo,
  salvarTrava,
  type Colaborador,
  type HistoricoItem,
  type TagLideranca,
  type Trava,
  type Vinculo,
} from "@/lib/carteira";

type Tab = "grupo" | "pessoas" | "pendentes" | "historico" | "config";

const DEP_KEYS: { depto: string; key: "cont" | "fisc" | "dp" }[] = [
  { depto: "Contábil", key: "cont" },
  { depto: "Fiscal", key: "fisc" },
  { depto: "Pessoal/DP", key: "dp" },
];

type GrupoInfo = {
  grupo: string;
  empresas: BIEmpresa[];
  deptos: { depto: string; tag: string; lider: TagLideranca | null }[];
};

const EVENTO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  publicado: "Publicado",
  cancelado: "Cancelado",
  pendente_criado: "Pendente criado",
};

export default function CarteiraClientes() {
  const { isAdmin, nome } = useAuth();
  const [tab, setTab] = useState<Tab>("grupo");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [empresas, setEmpresas] = useState<BIEmpresa[]>([]);
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [lidMap, setLidMap] = useState<Record<string, TagLideranca>>({});
  const [colabs, setColabs] = useState<Colaborador[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [hist, setHist] = useState<HistoricoItem[]>([]);
  const [trava, setTrava] = useState<Trava>({ travado: false, dt_liberacao: null });

  const carregar = async () => {
    setLoading(true);
    setErro("");
    try {
      const [bi, lid, cs, vs, hs, tv] = await Promise.all([
        biLoadAll(),
        carregarLideranca().catch(() => ({}) as Record<string, TagLideranca>),
        listColaboradores(),
        listVinculos(),
        listHistorico(),
        carregarTrava().catch(() => ({ travado: false, dt_liberacao: null })),
      ]);
      setEmpresas(bi.empresas);
      setTagsMap(bi.tagsMap);
      setLidMap(lid);
      setColabs(cs);
      setVinculos(vs);
      setHist(hs);
      setTrava(tv);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const grupos = useMemo<GrupoInfo[]>(() => {
    const map = new Map<string, BIEmpresa[]>();
    empresas.forEach((e) => {
      const g = (e.grupo || e.razao || "").trim();
      if (!g) return;
      const arr = map.get(g) ?? [];
      arr.push(e);
      map.set(g, arr);
    });
    const out: GrupoInfo[] = [];
    map.forEach((emps, grupo) => {
      const deptos = DEP_KEYS.map(({ depto, key }) => {
        let tag = "";
        for (const e of emps) {
          tag = getTagDepto(e.cnpj, key, tagsMap);
          if (tag) break;
        }
        return { depto, tag, lider: tag ? lideranca(tag, lidMap) : null };
      });
      if (deptos.some((d) => d.tag)) out.push({ grupo, empresas: emps, deptos });
    });
    return out.sort((a, b) => a.grupo.localeCompare(b.grupo, "pt-BR"));
  }, [empresas, tagsMap, lidMap]);

  const colabById = useMemo(() => {
    const m: Record<string, Colaborador> = {};
    colabs.forEach((c) => (m[c.id] = c));
    return m;
  }, [colabs]);

  const ativosPendentes = useMemo(
    () => vinculos.filter((v) => v.status === "ativo" || v.status === "pendente"),
    [vinculos],
  );
  const pendentes = useMemo(() => vinculos.filter((v) => v.status === "pendente"), [vinculos]);

  const vincPorChave = useMemo(() => {
    const m = new Map<string, Vinculo[]>();
    ativosPendentes.forEach((v) => {
      const k = `${v.grupo ?? ""}||${v.departamento}`;
      const arr = m.get(k) ?? [];
      arr.push(v);
      m.set(k, arr);
    });
    return m;
  }, [ativosPendentes]);

  const bloqueado = trava.travado;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-charcoal">
      <div className="max-w-[1500px] mx-auto px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold flex items-center gap-2">
              <Briefcase size={20} /> Carteira de Clientes
            </h1>
            <p className="text-[12px] text-gray-500">
              Vínculos de operação por grupo econômico e departamento, com pendências, histórico e trava de alterações.
            </p>
          </div>
          <button
            onClick={() => void carregar()}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold hover:bg-gray-50"
          >
            Recarregar
          </button>
        </header>

        {bloqueado && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] font-semibold text-red-700 flex items-center gap-2">
            <Lock size={14} /> Alterações bloqueadas
            {trava.dt_liberacao ? ` até ${fmtData(trava.dt_liberacao)}` : ""}
          </div>
        )}
        {!bloqueado && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12px] font-semibold text-emerald-700 flex items-center gap-2">
            <LockOpen size={14} /> Alterações liberadas
          </div>
        )}

        <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          {(
            [
              ["grupo", "Por grupo"],
              ["pessoas", "Pessoas"],
              ["pendentes", `Pendentes${pendentes.length ? ` (${pendentes.length})` : ""}`],
              ["historico", "Histórico"],
              ...(isAdmin ? ([["config", "Configurações"]] as [Tab, string][]) : []),
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                tab === id ? "bg-charcoal text-white" : "bg-white border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">{erro}</div>
        )}
        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-500">
            Carregando carteira…
          </div>
        ) : (
          <>
            {tab === "grupo" && (
              <AbaPorGrupo
                grupos={grupos}
                vincPorChave={vincPorChave}
                colabById={colabById}
                colabs={colabs}
                bloqueado={bloqueado}
                onChange={carregar}
              />
            )}
            {tab === "pessoas" && (
              <AbaPessoas colabs={colabs} vinculos={ativosPendentes} onChange={carregar} />
            )}
            {tab === "pendentes" && (
              <AbaPendentes
                pendentes={pendentes}
                colabById={colabById}
                bloqueado={bloqueado}
                onChange={carregar}
              />
            )}
            {tab === "historico" && <AbaHistorico hist={hist} />}
            {tab === "config" && isAdmin && (
              <AbaConfig trava={trava} autor={nome ?? undefined} onSaved={carregar} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Chip de operação ──────────────────────────────────────── */

function ChipOperacao({ nome, cargo, pendente }: { nome: string; cargo: string; pendente: boolean }) {
  const base = pendente ? "border-orange-300" : "border-emerald-300";
  return (
    <span className={`inline-flex overflow-hidden rounded-md border ${base} text-[11px] font-semibold`}>
      <span className={`px-2 py-0.5 ${pendente ? "bg-orange-50 text-orange-800" : "bg-emerald-50 text-emerald-800"}`}>
        {pendente && <Clock size={10} className="inline mr-1 -mt-0.5" />}
        {nome}
      </span>
      <span
        className={`px-2 py-0.5 border-l ${
          pendente ? "border-orange-300 bg-orange-100 text-orange-900" : "border-emerald-300 bg-emerald-100 text-emerald-900"
        }`}
      >
        {cargo || "—"}
      </span>
    </span>
  );
}

/* ─── Aba: Por grupo ────────────────────────────────────────── */

function AbaPorGrupo({
  grupos,
  vincPorChave,
  colabById,
  colabs,
  bloqueado,
  onChange,
}: {
  grupos: GrupoInfo[];
  vincPorChave: Map<string, Vinculo[]>;
  colabById: Record<string, Colaborador>;
  colabs: Colaborador[];
  bloqueado: boolean;
  onChange: () => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [fDepto, setFDepto] = useState("");
  const [modal, setModal] = useState<{ grupo: string; depto: string } | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return grupos.filter((g) => !q || g.grupo.toLowerCase().includes(q));
  }, [grupos, busca]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar grupo…"
          className="w-64 rounded-md border border-gray-200 px-3 py-1.5 text-[12px]"
        />
        <select
          value={fDepto}
          onChange={(e) => setFDepto(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]"
        >
          <option value="">Todos os departamentos</option>
          {CARTEIRA_DEPTOS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[12px] font-semibold text-gray-500">{lista.length} grupos</span>
      </div>

      <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Grupo</th>
              <th className="px-3 py-2">Departamento</th>
              <th className="px-3 py-2">Liderança</th>
              <th className="px-3 py-2">Operação vinculada</th>
              <th className="px-3 py-2 w-32">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((g) => {
              const deptos = g.deptos.filter((d) => !fDepto || d.depto === fDepto);
              if (!deptos.length) return null;
              return (
                <Fragment key={g.grupo}>
                  <tr className="bg-gray-100">
                    <td colSpan={5} className="px-3 py-1.5 font-bold">
                      {g.grupo}{" "}
                      <span className="font-normal text-gray-500">
                        · {g.empresas.length} empresa{g.empresas.length > 1 ? "s" : ""}
                      </span>
                    </td>
                  </tr>
                  {deptos.map((d) => {
                    const vs = vincPorChave.get(`${g.grupo}||${d.depto}`) ?? [];
                    return (
                      <tr key={`${g.grupo}-${d.depto}`} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2 text-gray-400">—</td>
                        <td className="px-3 py-2 font-semibold">
                          {d.depto}
                          {d.tag && <div className="text-[10px] font-normal text-gray-400">{d.tag}</div>}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gray-500">
                          {d.lider ? (
                            <>
                              {d.lider.gerente && <div>Gerente: {d.lider.gerente}</div>}
                              {d.lider.coord && <div>Coord: {d.lider.coord}</div>}
                              {d.lider.supers.map((s) => (
                                <div key={s}>Supervisor: {s}</div>
                              ))}
                              {!d.lider.gerente && !d.lider.coord && !d.lider.supers.length && "—"}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        {d.tag ? (
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              {vs.length ? (
                                vs.map((v) => (
                                  <ChipOperacao
                                    key={v.id}
                                    nome={colabById[v.colaborador_id ?? ""]?.nome ?? "—"}
                                    cargo={colabById[v.colaborador_id ?? ""]?.cargo ?? ""}
                                    pendente={v.status === "pendente"}
                                  />
                                ))
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  <AlertTriangle size={11} /> Sem operação vinculada !
                                </span>
                              )}
                            </div>
                          </td>
                        ) : (
                          <td className="bg-gray-50 px-3 py-2 text-[11px] italic text-gray-400">
                            Sem escopo — grupo sem TAG de {d.depto}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          {d.tag && (
                            <button
                              disabled={bloqueado}
                              title={bloqueado ? "Carteira travada" : "Vincular pessoa"}
                              onClick={() => setModal({ grupo: g.grupo, depto: d.depto })}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus size={11} /> Vincular
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <ModalVincular
          grupo={modal.grupo}
          depto={modal.depto}
          colabs={colabs}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await onChange();
          }}
        />
      )}
    </div>
  );
}

function ModalVincular({
  grupo,
  depto,
  colabs,
  onClose,
  onSaved,
}: {
  grupo: string;
  depto: string;
  colabs: Colaborador[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const elegiveis = colabs.filter(
    (c) => c.ativo && !isCargoGestao(c.cargo) && normDepto(c.departamento) === depto,
  );
  const [colabId, setColabId] = useState(elegiveis[0]?.id ?? "");
  const [dt, setDt] = useState(hoje());
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [err, setErr] = useState("");

  const salvar = async () => {
    const c = colabs.find((x) => x.id === colabId);
    if (!c) return setErr("Selecione um colaborador.");
    setSalvando(true);
    setErr("");
    try {
      await criarVinculo({ colaborador: c, grupo, departamento: depto, dt_inicio: dt, motivo });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-bold">Vincular pessoa</h2>
            <p className="text-[11px] text-gray-500">
              {grupo} · {depto}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-charcoal">
            <X size={16} />
          </button>
        </div>
        {elegiveis.length === 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Nenhum colaborador de {depto} cadastrado. Importe pessoas na aba Pessoas.
          </div>
        )}
        <label className="block text-[11px] font-semibold text-gray-500">
          Colaborador
          <select
            value={colabId}
            onChange={(e) => setColabId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] font-normal text-charcoal"
          >
            <option value="">Selecione…</option>
            {elegiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} — {c.cargo || "sem cargo"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] font-semibold text-gray-500">
          Data de vigência
          <input
            type="date"
            value={dt}
            onChange={(e) => setDt(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] font-normal text-charcoal"
          />
          <span className="mt-1 block font-normal text-gray-400">
            {dt > hoje() ? "Data futura → vínculo entra como pendente." : "Vínculo entra como ativo."}
          </span>
        </label>
        <label className="block text-[11px] font-semibold text-gray-500">
          Motivo (opcional)
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] font-normal text-charcoal"
          />
        </label>
        {err && <div className="text-[11px] text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-[12px] font-semibold">
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando || !colabId}
            className="rounded-md bg-charcoal px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Vincular"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Aba: Pessoas ──────────────────────────────────────────── */

function AbaPessoas({
  colabs,
  vinculos,
  onChange,
}: {
  colabs: Colaborador[];
  vinculos: Vinculo[];
  onChange: () => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [fCargo, setFCargo] = useState("");
  const [fDepto, setFDepto] = useState("");
  const [fSit, setFSit] = useState<"" | "com" | "sem">("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const porColab = useMemo(() => {
    const m = new Map<string, Vinculo[]>();
    vinculos.forEach((v) => {
      if (!v.colaborador_id) return;
      const arr = m.get(v.colaborador_id) ?? [];
      arr.push(v);
      m.set(v.colaborador_id, arr);
    });
    return m;
  }, [vinculos]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return colabs
      .filter((c) => !isCargoGestao(c.cargo))
      .filter((c) => !q || c.nome.toLowerCase().includes(q))
      .filter((c) => !fCargo || (c.cargo || "") === fCargo)
      .filter((c) => !fDepto || normDepto(c.departamento) === fDepto)
      .filter((c) => {
        const n = (porColab.get(c.id) ?? []).length;
        if (fSit === "com") return n > 0;
        if (fSit === "sem") return n === 0;
        return true;
      });
  }, [colabs, busca, fCargo, fDepto, fSit, porColab]);

  const importar = async (file: File) => {
    setMsg("Lendo planilha…");
    try {
      const rows = await lerPlanilhaColaboradores(file);
      const r = await importarColaboradores(rows);
      await onChange();
      setMsg(`${r.total} pessoas processadas · ${r.criados} novas · ${r.atualizados} atualizadas`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pessoa…"
          className="w-56 rounded-md border border-gray-200 px-3 py-1.5 text-[12px]"
        />
        <select value={fCargo} onChange={(e) => setFCargo(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]">
          <option value="">Todos os cargos</option>
          {CARTEIRA_CARGOS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={fDepto} onChange={(e) => setFDepto(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]">
          <option value="">Todos os departamentos</option>
          {CARTEIRA_DEPTOS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={fSit}
          onChange={(e) => setFSit(e.target.value as "" | "com" | "sem")}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]"
        >
          <option value="">Todas as situações</option>
          <option value="com">Com carteira</option>
          <option value="sem">Sem carteira</option>
        </select>
        <span className="text-[12px] font-semibold text-gray-500">{lista.length} pessoas</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-charcoal px-3 py-1.5 text-[12px] font-semibold text-white"
        >
          <Upload size={12} /> Importar pessoas
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importar(f);
          }}
        />
      </div>
      {msg && <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-600">{msg}</div>}

      <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Cargo</th>
              <th className="px-3 py-2">Departamento</th>
              <th className="px-3 py-2">Grupos na carteira</th>
              <th className="px-3 py-2 w-40">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const vs = porColab.get(c.id) ?? [];
              const pend = vs.find((v) => v.status === "pendente");
              return (
                <tr key={c.id} className={`border-t border-gray-100 align-top ${vs.length ? "" : "bg-amber-50"}`}>
                  <td className="px-3 py-2 font-semibold">{c.nome}</td>
                  <td className="px-3 py-2">{c.cargo || "—"}</td>
                  <td className="px-3 py-2">{normDepto(c.departamento) || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {vs.map((v) => (
                        <span
                          key={v.id}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            v.status === "pendente"
                              ? "border-orange-300 bg-orange-50 text-orange-800"
                              : "border-emerald-300 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {v.grupo} · {v.departamento}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px] font-semibold">
                    {vs.length === 0 ? (
                      <span className="text-red-700">Sem carteira !</span>
                    ) : pend ? (
                      <span className="text-orange-700">Pendente ({fmtData(pend.dt_inicio).slice(0, 5)})</span>
                    ) : (
                      <span className="text-emerald-700">Vinculado ✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Aba: Pendentes ────────────────────────────────────────── */

function AbaPendentes({
  pendentes,
  colabById,
  bloqueado,
  onChange,
}: {
  pendentes: Vinculo[];
  colabById: Record<string, Colaborador>;
  bloqueado: boolean;
  onChange: () => Promise<void>;
}) {
  const [ate, setAte] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-[12px] font-semibold text-gray-500">Publicar em lote até</span>
        <input
          type="date"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]"
        />
        <button
          disabled={bloqueado || busy}
          onClick={() =>
            void run(async () => {
              const n = await publicarPendentesAte(pendentes, ate, colabById);
              setMsg(`${n} vínculo(s) publicado(s).`);
            })
          }
          title={bloqueado ? "Carteira travada" : undefined}
          className="rounded-md bg-charcoal px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          Publicar todos até {fmtData(ate)}
        </button>
        <span className="ml-auto text-[12px] font-semibold text-gray-500">{pendentes.length} pendentes</span>
      </div>
      {msg && <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-600">{msg}</div>}

      <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Pessoa</th>
              <th className="px-3 py-2">Grupo</th>
              <th className="px-3 py-2">Departamento</th>
              <th className="px-3 py-2">Vigência</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2 w-52">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pendentes.map((v) => {
              const c = v.colaborador_id ? colabById[v.colaborador_id] : null;
              return (
                <tr key={v.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold">
                    {c?.nome ?? "—"} <span className="font-normal text-gray-400">{c?.cargo ?? ""}</span>
                  </td>
                  <td className="px-3 py-2">{v.grupo}</td>
                  <td className="px-3 py-2">{v.departamento}</td>
                  <td className="px-3 py-2">{fmtData(v.dt_inicio)}</td>
                  <td className="px-3 py-2 text-gray-500">{v.motivo || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <button
                        disabled={bloqueado || busy}
                        onClick={() => void run(() => publicarVinculo(v, c))}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 disabled:opacity-40"
                      >
                        <Check size={11} /> Publicar
                      </button>
                      <button
                        disabled={bloqueado || busy}
                        onClick={() => void run(() => cancelarVinculo(v, "cancelado", c))}
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-40"
                      >
                        <X size={11} /> Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!pendentes.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  Nenhum vínculo pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Aba: Histórico ────────────────────────────────────────── */

function AbaHistorico({ hist }: { hist: HistoricoItem[] }) {
  const [fColab, setFColab] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fDepto, setFDepto] = useState("");
  const [de, setDe] = useState("");
  const [ateD, setAteD] = useState("");

  const lista = useMemo(() => {
    const qc = fColab.trim().toLowerCase();
    const qg = fGrupo.trim().toLowerCase();
    return hist
      .filter((h) => !qc || (h.colaborador_nome || "").toLowerCase().includes(qc))
      .filter((h) => !qg || (h.grupo || "").toLowerCase().includes(qg))
      .filter((h) => !fDepto || h.departamento === fDepto)
      .filter((h) => !de || h.registrado_em.slice(0, 10) >= de)
      .filter((h) => !ateD || h.registrado_em.slice(0, 10) <= ateD);
  }, [hist, fColab, fGrupo, fDepto, de, ateD]);

  const exportar = () => {
    const head = ["Registrado em", "Colaborador", "Cargo", "Grupo", "Departamento", "Evento", "Vigência", "Motivo"];
    const linhas = lista.map((h) =>
      [
        h.registrado_em.slice(0, 19).replace("T", " "),
        h.colaborador_nome ?? "",
        h.colaborador_cargo ?? "",
        h.grupo ?? "",
        h.departamento ?? "",
        EVENTO_LABEL[h.evento] ?? h.evento,
        h.dt_vigencia ?? "",
        h.motivo ?? "",
      ].join(";"),
    );
    const blob = new Blob(["\uFEFF" + [head.join(";"), ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `carteira-historico-${hoje()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <input value={fColab} onChange={(e) => setFColab(e.target.value)} placeholder="Colaborador…" className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-[12px]" />
        <input value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} placeholder="Grupo…" className="w-44 rounded-md border border-gray-200 px-3 py-1.5 text-[12px]" />
        <select value={fDepto} onChange={(e) => setFDepto(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]">
          <option value="">Todos os departamentos</option>
          {CARTEIRA_DEPTOS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]" />
        <input type="date" value={ateD} onChange={(e) => setAteD(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12px]" />
        <button onClick={exportar} className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold hover:bg-gray-50">
          <Download size={12} /> Exportar CSV
        </button>
      </div>

      <ol className="space-y-2">
        {lista.map((h) => (
          <li key={h.id} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-mono text-[11px] text-gray-400">{h.registrado_em.slice(0, 16).replace("T", " ")}</span>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold">
                {EVENTO_LABEL[h.evento] ?? h.evento}
              </span>
              <span className="font-semibold">{h.colaborador_nome ?? "—"}</span>
              {h.colaborador_cargo && <span className="text-gray-400">{h.colaborador_cargo}</span>}
              <span className="text-gray-500">
                {h.grupo ?? "—"} · {h.departamento ?? "—"}
              </span>
              {h.dt_vigencia && <span className="text-gray-400">vigência {fmtData(h.dt_vigencia)}</span>}
            </div>
            {h.motivo && <div className="mt-1 text-[11px] text-gray-500">{h.motivo}</div>}
          </li>
        ))}
        {!lista.length && (
          <li className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-[12px] text-gray-400">
            Nenhum evento no filtro atual.
          </li>
        )}
      </ol>
    </div>
  );
}

/* ─── Aba: Configurações ────────────────────────────────────── */

function AbaConfig({ trava, autor, onSaved }: { trava: Trava; autor?: string; onSaved: () => Promise<void> }) {
  const [travado, setTravado] = useState(trava.travado);
  const [dt, setDt] = useState(trava.dt_liberacao ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const salvar = async () => {
    setBusy(true);
    setMsg("");
    try {
      await salvarTrava({ travado, dt_liberacao: dt || null }, autor);
      await onSaved();
      setMsg("Configuração salva.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Users size={16} /> Trava de alterações
      </h2>
      <p className="text-[12px] text-gray-500">
        Com a trava ativa ninguém vincula, encerra ou publica pendentes. Importar pessoas e visualizar continuam liberados.
      </p>
      <label className="flex items-center gap-2 text-[12px] font-semibold">
        <input type="checkbox" checked={travado} onChange={(e) => setTravado(e.target.checked)} />
        Bloquear alterações da carteira
      </label>
      <label className="block text-[11px] font-semibold text-gray-500">
        Data de liberação
        <input
          type="date"
          value={dt}
          onChange={(e) => setDt(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] font-normal text-charcoal"
        />
      </label>
      {msg && <div className="text-[11px] text-gray-600">{msg}</div>}
      <button
        onClick={() => void salvar()}
        disabled={busy}
        className="rounded-md bg-charcoal px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
