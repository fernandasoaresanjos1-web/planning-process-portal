import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  CheckCircle2,
  Plus,
  Trash2,
  History,
  Filter,
  Calendar as CalendarIcon,
  User,
  Pencil,
  BarChart3,
  Workflow,
} from "lucide-react";

type Periodicidade = "diaria" | "semanal" | "quinzenal" | "mensal";

type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  periodicidade: Periodicidade;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  proxima_execucao: string;
  ultima_execucao: string | null;
  ativo: boolean;
  created_by: string | null;
  processo_slug: string | null;
};

type Execucao = {
  id: string;
  tarefa_id: string;
  executada_em: string;
  executada_por_nome: string | null;
  observacao: string | null;
  proxima_execucao_anterior: string | null;
  proxima_execucao_nova: string | null;
};

type Processo = { slug: string; nome: string };

const PERIODS: { value: Periodicidade; label: string; dias: number }[] = [
  { value: "diaria", label: "Diária", dias: 1 },
  { value: "semanal", label: "Semanal", dias: 7 },
  { value: "quinzenal", label: "Quinzenal", dias: 14 },
  { value: "mensal", label: "Mensal", dias: 30 },
];

function periodLabel(p: Periodicidade) {
  return PERIODS.find((x) => x.value === p)?.label ?? p;
}

function addPeriod(fromISO: string, p: Periodicidade): string {
  const base = new Date(fromISO + "T00:00:00");
  if (p === "mensal") {
    base.setMonth(base.getMonth() + 1);
  } else {
    const dias = PERIODS.find((x) => x.value === p)?.dias ?? 1;
    base.setDate(base.getDate() + dias);
  }
  return base.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("pt-BR");
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function mesLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function statusDaTarefa(t: Tarefa) {
  const hoje = todayISO();
  if (t.proxima_execucao < hoje) return { label: "Atrasada", cls: "bg-red-100 text-red-700 border-red-200" };
  if (t.proxima_execucao === hoje) return { label: "Para hoje", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: "Em dia", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
}

const EMPTY_FORM = {
  titulo: "",
  descricao: "",
  periodicidade: "diaria" as Periodicidade,
  responsavel: "",
  proxima: todayISO(),
  processo: "" as string,
};

export default function TarefasFixas() {
  const { user, nome, roles } = useAuth();
  const isGestor = roles.includes("admin") || roles.includes("gestor");

  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [execs, setExecs] = useState<Execucao[]>([]);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"lista" | "historico" | "indicadores">("lista");
  const [filtro, setFiltro] = useState<"minhas" | "todas">("todas");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [execTarefa, setExecTarefa] = useState<Tarefa | null>(null);
  const [execObs, setExecObs] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: t, error: et }, { data: e, error: ee }, { data: p }] = await Promise.all([
      supabase.from("tarefas_fixas").select("*").order("proxima_execucao", { ascending: true }),
      supabase
        .from("tarefas_fixas_execucoes")
        .select("*")
        .order("executada_em", { ascending: false })
        .limit(1000),
      supabase.from("processos").select("slug, nome").order("ordem"),
    ]);
    if (et) toast.error("Erro ao carregar tarefas: " + et.message);
    if (ee) toast.error("Erro ao carregar histórico: " + ee.message);
    setTarefas((t as Tarefa[]) ?? []);
    setExecs((e as Execucao[]) ?? []);
    setProcessos((p as Processo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const processoNome = (slug: string | null) =>
    processos.find((p) => p.slug === slug)?.nome ?? null;

  const listaFiltrada = useMemo(() => {
    let arr = tarefas.filter((t) => t.ativo);
    if (filtro === "minhas" && user) {
      arr = arr.filter((t) => t.responsavel_id === user.id || t.created_by === user.id);
    }
    return arr;
  }, [tarefas, filtro, user]);

  const abrirNovo = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const abrirEdicao = (t: Tarefa) => {
    setEditingId(t.id);
    setForm({
      titulo: t.titulo,
      descricao: t.descricao ?? "",
      periodicidade: t.periodicidade,
      responsavel: t.responsavel_nome ?? "",
      proxima: t.proxima_execucao,
      processo: t.processo_slug ?? "",
    });
    setShowForm(true);
  };

  const salvar = async () => {
    if (!user) return;
    if (!form.titulo.trim()) return toast.error("Informe o título");
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      periodicidade: form.periodicidade,
      responsavel_id: form.responsavel.trim() ? user.id : null,
      responsavel_nome: form.responsavel.trim() ? form.responsavel.trim() : null,
      proxima_execucao: form.proxima || todayISO(),
      processo_slug: form.processo || null,
    };
    let error: { message: string } | null = null;
    if (editingId) {
      const { error: e } = await supabase.from("tarefas_fixas").update(payload).eq("id", editingId);
      error = e;
    } else {
      const { error: e } = await supabase
        .from("tarefas_fixas")
        .insert({ ...payload, created_by: user.id });
      error = e;
    }
    setSaving(false);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success(editingId ? "Tarefa atualizada" : "Tarefa fixa criada");
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    load();
  };

  const excluir = async (t: Tarefa) => {
    if (!confirm(`Excluir "${t.titulo}"?`)) return;
    const { error } = await supabase.from("tarefas_fixas").delete().eq("id", t.id);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Tarefa excluída");
    load();
  };

  const executar = async () => {
    if (!execTarefa || !user) return;
    const anterior = execTarefa.proxima_execucao;
    const base = anterior < todayISO() ? todayISO() : anterior;
    const nova = addPeriod(base, execTarefa.periodicidade);
    const agora = new Date().toISOString();

    const { error: e1 } = await supabase.from("tarefas_fixas_execucoes").insert({
      tarefa_id: execTarefa.id,
      executada_em: agora,
      executada_por_id: user.id,
      executada_por_nome: nome ?? user.email ?? null,
      observacao: execObs.trim() || null,
      periodicidade_no_momento: execTarefa.periodicidade,
      proxima_execucao_anterior: anterior,
      proxima_execucao_nova: nova,
    });
    if (e1) return toast.error("Erro ao registrar execução: " + e1.message);

    const { error: e2 } = await supabase
      .from("tarefas_fixas")
      .update({ proxima_execucao: nova, ultima_execucao: agora })
      .eq("id", execTarefa.id);
    if (e2) return toast.error("Erro ao avançar próxima data: " + e2.message);

    toast.success(`Executada. Próxima em ${fmtDate(nova)}`);
    setExecTarefa(null);
    setExecObs("");
    load();
  };

  // ── Indicadores: por pessoa × mês ─────────────────────────────────────────
  const indicadores = useMemo(() => {
    const pessoas = new Set<string>();
    const meses = new Set<string>();
    const mapa = new Map<string, number>(); // key = pessoa||YYYY-MM
    for (const e of execs) {
      const pessoa = e.executada_por_nome?.trim() || "—";
      const ym = (e.executada_em ?? "").slice(0, 7);
      if (!ym) continue;
      pessoas.add(pessoa);
      meses.add(ym);
      const k = pessoa + "||" + ym;
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    }
    const mesesArr = Array.from(meses).sort();
    const pessoasArr = Array.from(pessoas).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { pessoasArr, mesesArr, mapa };
  }, [execs]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAba("lista")}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${
              aba === "lista" ? "bg-charcoal text-white border-charcoal" : "bg-white border-border text-charcoal"
            }`}
          >
            <CheckCircle2 size={13} className="inline mr-1" /> Tarefas
          </button>
          <button
            onClick={() => setAba("historico")}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${
              aba === "historico" ? "bg-charcoal text-white border-charcoal" : "bg-white border-border text-charcoal"
            }`}
          >
            <History size={13} className="inline mr-1" /> Histórico
          </button>
          <button
            onClick={() => setAba("indicadores")}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${
              aba === "indicadores"
                ? "bg-charcoal text-white border-charcoal"
                : "bg-white border-border text-charcoal"
            }`}
          >
            <BarChart3 size={13} className="inline mr-1" /> Indicadores
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-white">
            <Filter size={12} className="ml-1 text-muted-foreground" />
            {(["todas", "minhas"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                  filtro === f ? "bg-charcoal text-white" : "text-charcoal hover:bg-secondary"
                }`}
              >
                {f === "todas" ? "Todas" : "Minhas"}
              </button>
            ))}
          </div>
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-1 text-[12px] font-semibold bg-charcoal text-white rounded-md px-3 py-1.5"
          >
            <Plus size={13} /> Nova tarefa
          </button>
        </div>
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 bg-white mb-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center justify-between">
            <div className="text-[13px] font-bold text-charcoal">
              {editingId ? "Editar tarefa fixa" : "Nova tarefa fixa"}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">Título</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px]"
              placeholder="Ex: Enviar relatório de vendas"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              rows={2}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px]"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">Periodicidade</label>
            <select
              value={form.periodicidade}
              onChange={(e) => setForm((f) => ({ ...f, periodicidade: e.target.value as Periodicidade }))}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px] bg-white"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">Próxima execução</label>
            <input
              type="date"
              value={form.proxima}
              onChange={(e) => setForm((f) => ({ ...f, proxima: e.target.value }))}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
              Centro de processos (opcional)
            </label>
            <select
              value={form.processo}
              onChange={(e) => setForm((f) => ({ ...f, processo: e.target.value }))}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px] bg-white"
            >
              <option value="">— Não vincular —</option>
              {processos.map((p) => (
                <option key={p.slug} value={p.slug}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
              Responsável (deixe em branco se for compartilhada)
            </label>
            <input
              value={form.responsavel}
              onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
              placeholder={nome ?? "Nome do responsável"}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se informado, será atribuída a você como responsável.
            </p>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
              className="text-[12px] px-3 py-1.5 border border-border rounded"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={saving}
              className="text-[12px] px-3 py-1.5 bg-charcoal text-white rounded font-semibold"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar tarefa"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : aba === "lista" ? (
        <div className="overflow-x-auto border border-border rounded-lg bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Tarefa</th>
                <th className="text-left px-3 py-2">Processo</th>
                <th className="text-left px-3 py-2">Periodicidade</th>
                <th className="text-left px-3 py-2">Responsável</th>
                <th className="text-left px-3 py-2">Próxima</th>
                <th className="text-left px-3 py-2">Última</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center px-3 py-6 text-muted-foreground">
                    Nenhuma tarefa fixa {filtro === "minhas" ? "sua " : ""}cadastrada.
                  </td>
                </tr>
              )}
              {listaFiltrada.map((t) => {
                const s = statusDaTarefa(t);
                const podeExecutar = !!user;
                const podeEditar =
                  isGestor || (user && (t.created_by === user.id || t.responsavel_id === user.id));
                const procNome = processoNome(t.processo_slug);
                return (
                  <tr key={t.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-charcoal">{t.titulo}</div>
                      {t.descricao && <div className="text-muted-foreground text-[11px] mt-0.5">{t.descricao}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {procNome ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border border-border bg-secondary/50 text-charcoal">
                          <Workflow size={11} /> {procNome}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{periodLabel(t.periodicidade)}</td>
                    <td className="px-3 py-2">
                      {t.responsavel_nome ? (
                        <span className="inline-flex items-center gap-1"><User size={11} /> {t.responsavel_nome}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Compartilhada</span>
                      )}
                    </td>
                    <td className="px-3 py-2"><CalendarIcon size={11} className="inline mr-1" />{fmtDate(t.proxima_execucao)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(t.ultima_execucao)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${s.cls}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {podeExecutar && (
                        <button
                          onClick={() => { setExecTarefa(t); setExecObs(""); }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded px-2 py-1 mr-1"
                        >
                          <CheckCircle2 size={12} /> Executar
                        </button>
                      )}
                      {podeEditar && (
                        <button
                          onClick={() => abrirEdicao(t)}
                          className="inline-flex items-center gap-1 text-[11px] text-charcoal border border-border hover:bg-secondary rounded px-2 py-1 mr-1"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                      {podeEditar && (
                        <button
                          onClick={() => excluir(t)}
                          className="inline-flex items-center gap-1 text-[11px] text-red-700 border border-red-200 hover:bg-red-50 rounded px-2 py-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : aba === "historico" ? (
        <div className="overflow-x-auto border border-border rounded-lg bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Quando</th>
                <th className="text-left px-3 py-2">Tarefa</th>
                <th className="text-left px-3 py-2">Executado por</th>
                <th className="text-left px-3 py-2">De → Para</th>
                <th className="text-left px-3 py-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {execs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center px-3 py-6 text-muted-foreground">
                    Nenhuma execução registrada ainda.
                  </td>
                </tr>
              )}
              {execs.map((e) => {
                const t = tarefas.find((x) => x.id === e.tarefa_id);
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(e.executada_em)}</td>
                    <td className="px-3 py-2">{t?.titulo ?? <span className="text-muted-foreground italic">(removida)</span>}</td>
                    <td className="px-3 py-2">{e.executada_por_nome ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fmtDate(e.proxima_execucao_anterior)} → <span className="text-charcoal font-semibold">{fmtDate(e.proxima_execucao_nova)}</span>
                    </td>
                    <td className="px-3 py-2">{e.observacao ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // Indicadores
        <div className="border border-border rounded-lg bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-bold text-charcoal">Execuções por pessoa × mês</div>
              <div className="text-[11px] text-muted-foreground">
                Quantidade de tarefas fixas concluídas por cada pessoa, agrupadas pelo mês da execução.
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Total: <span className="font-bold text-charcoal">{execs.length}</span>
            </div>
          </div>
          {indicadores.mesesArr.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução registrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 sticky left-0 bg-secondary/50">Pessoa</th>
                    {indicadores.mesesArr.map((m) => (
                      <th key={m} className="text-center px-3 py-2 whitespace-nowrap">{mesLabel(m)}</th>
                    ))}
                    <th className="text-center px-3 py-2 bg-secondary">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {indicadores.pessoasArr.map((pessoa) => {
                    const totalPessoa = indicadores.mesesArr.reduce(
                      (acc, m) => acc + (indicadores.mapa.get(pessoa + "||" + m) ?? 0),
                      0,
                    );
                    return (
                      <tr key={pessoa} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold text-charcoal sticky left-0 bg-white">{pessoa}</td>
                        {indicadores.mesesArr.map((m) => {
                          const n = indicadores.mapa.get(pessoa + "||" + m) ?? 0;
                          return (
                            <td key={m} className="text-center px-3 py-2">
                              {n === 0 ? <span className="text-muted-foreground">—</span> : <span className="font-semibold">{n}</span>}
                            </td>
                          );
                        })}
                        <td className="text-center px-3 py-2 font-bold text-charcoal bg-secondary/40">{totalPessoa}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border bg-secondary/40">
                    <td className="px-3 py-2 font-bold sticky left-0 bg-secondary/40">Total do mês</td>
                    {indicadores.mesesArr.map((m) => {
                      const n = indicadores.pessoasArr.reduce(
                        (acc, p) => acc + (indicadores.mapa.get(p + "||" + m) ?? 0),
                        0,
                      );
                      return (
                        <td key={m} className="text-center px-3 py-2 font-bold">{n}</td>
                      );
                    })}
                    <td className="text-center px-3 py-2 font-bold">{execs.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {execTarefa && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setExecTarefa(null)}>
          <div className="bg-white rounded-lg border border-border shadow-lg max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-charcoal">Registrar execução</h3>
            <p className="text-[12px] text-muted-foreground mt-1">
              <strong>{execTarefa.titulo}</strong> — {periodLabel(execTarefa.periodicidade)}
            </p>
            <p className="text-[12px] mt-2">
              Próxima passará de <strong>{fmtDate(execTarefa.proxima_execucao)}</strong> para{" "}
              <strong>
                {fmtDate(
                  addPeriod(
                    execTarefa.proxima_execucao < todayISO() ? todayISO() : execTarefa.proxima_execucao,
                    execTarefa.periodicidade,
                  ),
                )}
              </strong>
              .
            </p>
            <label className="block mt-3 text-[11px] font-semibold text-muted-foreground uppercase">Observação (opcional)</label>
            <textarea
              value={execObs}
              onChange={(e) => setExecObs(e.target.value)}
              rows={3}
              className="w-full border border-border rounded px-2 py-1.5 text-[13px]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setExecTarefa(null)} className="text-[12px] px-3 py-1.5 border border-border rounded">
                Cancelar
              </button>
              <button
                onClick={executar}
                className="text-[12px] px-3 py-1.5 bg-emerald-600 text-white rounded font-semibold"
              >
                Confirmar execução
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
