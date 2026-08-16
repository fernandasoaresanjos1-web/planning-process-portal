import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { HubShell } from "@/components/HubShell";
import { listProcessos } from "@/lib/hub-data";
import {
  listAllVersoes,
  uploadVersao,
  ativarVersao,
  excluirVersao,
} from "@/lib/processos-versoes";
import {
  listAllVersoesTarefa,
  uploadVersaoTarefa,
  ativarVersaoTarefa,
  excluirVersaoTarefa,
} from "@/lib/tarefas-versoes";
import { sincronizarTagsBase } from "@/lib/parse-tags-html";
import { useAuth } from "@/lib/auth-context";
import { useRef, useState } from "react";
import { Upload, Check, Trash2, FileCode, Star, Target } from "lucide-react";
import { toast } from "sonner";

const processosQO = queryOptions({ queryKey: ["processos"], queryFn: listProcessos });
const versoesQO = queryOptions({ queryKey: ["versoes", "all"], queryFn: listAllVersoes });
const versoesTarefasQO = queryOptions({ queryKey: ["versoes-tarefas", "all"], queryFn: listAllVersoesTarefa });

const TAREFAS: { slug: string; nome: string; cor: string }[] = [
  { slug: "painel-okr", nome: "Painel de OKRs", cor: "#FA6914" },
];

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Planning Hub" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(processosQO),
      context.queryClient.ensureQueryData(versoesQO),
      context.queryClient.ensureQueryData(versoesTarefasQO),
    ]);
  },
  component: AdminPage,
  errorComponent: ({ error }) => <div className="p-10 text-destructive">{error.message}</div>,
});

type VersaoRow = {
  id: string;
  arquivo_nome: string;
  tamanho_bytes: number;
  ativo: boolean;
  created_at: string;
};

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return <HubShell><div className="p-10 text-muted-foreground">Carregando…</div></HubShell>;
  }
  if (!isAdmin) {
    return (
      <HubShell>
        <div className="max-w-md mx-auto mt-24 p-6 border border-border rounded-xl bg-card text-center">
          <h2 className="text-lg font-bold text-charcoal">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Somente administradores podem acessar o painel de configuração.
          </p>
        </div>
      </HubShell>
    );
  }
  const { data: processos } = useSuspenseQuery(processosQO);
  const { data: versoes } = useSuspenseQuery(versoesQO);
  const { data: versoesTarefas } = useSuspenseQuery(versoesTarefasQO);
  const qc = useQueryClient();

  const refreshProc = (slug?: string) => {
    qc.invalidateQueries({ queryKey: ["versoes"] });
    if (slug) qc.invalidateQueries({ queryKey: ["processo-html", slug] });
  };
  const refreshTar = (slug?: string) => {
    qc.invalidateQueries({ queryKey: ["versoes-tarefas"] });
    if (slug) qc.invalidateQueries({ queryKey: ["tarefa-html", slug] });
  };

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Configuração
        </div>
        <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">
          Admin · Atualizar processos
        </h1>
        <p className="text-sm text-muted-foreground mt-1 mb-7">
          Suba o HTML novo de cada processo. A versão enviada vira a ativa automaticamente; o
          histórico fica salvo e você pode reativar qualquer versão anterior.
        </p>

        <div className="space-y-5">
          {processos.map((p) => {
            const minhas = versoes.filter((v) => v.processo_slug === p.slug);
            return (
              <VersaoCard
                key={p.slug}
                slug={p.slug}
                nome={p.nome}
                cor={p.cor}
                icone="processo"
                versoes={minhas}
                onUpload={async (file) => {
                  const html_content = await file.text();
                  await uploadVersao({ slug: p.slug, arquivo_nome: file.name, html_content });
                  if (p.slug === "controle-tags") {
                    try {
                      const n = await sincronizarTagsBase(html_content);
                      if (n > 0) toast.success(`Base de TAGs sincronizada (${n} equipes)`);
                    } catch (err) {
                      toast.error("HTML salvo, mas falhou ao sincronizar TAGs: " + (err as Error).message);
                    }
                  }
                }}
                onAtivar={ativarVersao}
                onExcluir={excluirVersao}
                onChange={() => refreshProc(p.slug)}
              />
            );
          })}
        </div>

        <div className="mt-10 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Execução
        </div>
        <h2 className="text-[22px] font-extrabold text-charcoal leading-tight">Tarefas</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          HTMLs de painéis e ferramentas de Gestão de Tarefas.
        </p>

        <div className="space-y-5">
          {TAREFAS.map((t) => {
            const minhas = versoesTarefas.filter((v) => v.tarefa_slug === t.slug);
            return (
              <VersaoCard
                key={t.slug}
                slug={t.slug}
                nome={t.nome}
                cor={t.cor}
                icone="tarefa"
                versoes={minhas}
                onUpload={async (file) => {
                  const html_content = await file.text();
                  await uploadVersaoTarefa({ slug: t.slug, arquivo_nome: file.name, html_content });
                }}
                onAtivar={ativarVersaoTarefa}
                onExcluir={excluirVersaoTarefa}
                onChange={() => refreshTar(t.slug)}
              />
            );
          })}
        </div>
      </div>
    </HubShell>
  );
}

function VersaoCard({
  slug,
  nome,
  cor,
  icone,
  versoes,
  onUpload,
  onAtivar,
  onExcluir,
  onChange,
}: {
  slug: string;
  nome: string;
  cor: string;
  icone: "processo" | "tarefa";
  versoes: VersaoRow[];
  onUpload: (file: File) => Promise<void>;
  onAtivar: (id: string) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const ativa = versoes.find((v) => v.ativo);
  const Icon = icone === "tarefa" ? Target : FileCode;

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".html") && !file.name.toLowerCase().endsWith(".htm")) {
      toast.error("Envie um arquivo .html");
      return;
    }
    setBusy(true);
    try {
      await onUpload(file);
      toast.success(`Versão de ${nome} atualizada`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function activate(id: string) {
    setBusy(true);
    try {
      await onAtivar(id);
      toast.success("Versão ativada");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta versão?")) return;
    setBusy(true);
    try {
      await onExcluir(id);
      toast.success("Versão removida");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-border" style={{ background: cor + "10" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: cor + "22", color: cor }}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cor }}>{slug}</div>
            <div className="text-[15px] font-bold text-charcoal truncate">{nome}</div>
            <div className="text-[11px] text-muted-foreground">
              {ativa ? `Ativa: ${ativa.arquivo_nome} · ${formatBytes(ativa.tamanho_bytes)} · ${formatDate(ativa.created_at)}` : "Usando HTML embutido (sem versão no banco)"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-charcoal text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50"
          >
            <Upload size={14} /> {busy ? "Enviando…" : "Enviar HTML"}
          </button>
        </div>
      </div>

      {versoes.length > 0 && (
        <div className="divide-y divide-border">
          {versoes.map((v) => (
            <div key={v.id} className="px-5 py-3 flex items-center justify-between gap-4 text-[12px]">
              <div className="flex items-center gap-3 min-w-0">
                {v.ativo ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: cor + "22", color: cor }}>
                    <Star size={10} /> Ativa
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    Histórico
                  </span>
                )}
                <span className="font-medium text-charcoal truncate">{v.arquivo_nome}</span>
                <span className="text-muted-foreground">{formatBytes(v.tamanho_bytes)}</span>
                <span className="text-muted-foreground">{formatDate(v.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!v.ativo && (
                  <button
                    disabled={busy}
                    onClick={() => activate(v.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    <Check size={12} /> Ativar
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => remove(v.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
