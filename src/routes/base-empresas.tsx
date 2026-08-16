import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { HubShell } from "@/components/HubShell";
import { getEmpresaBaseResumo, importEmpresasMensal, listEmpresasImportacoes } from "@/lib/empresas-mensal";
import { Database, FileSpreadsheet, UploadCloud } from "lucide-react";

export const Route = createFileRoute("/base-empresas")({
  head: () => ({ meta: [{ title: "Base mensal de empresas — Planning Hub" }] }),
  component: BaseEmpresasPage,
});

function formatCompetencia(value: string | null) {
  if (!value) return "—";
  const [ano, mes] = value.split("-");
  return `${mes}/${ano}`;
}

function defaultCompetencia() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function BaseEmpresasPage() {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(defaultCompetencia());
  const [file, setFile] = useState<File | null>(null);
  const [autor, setAutor] = useState("");

  const resumoQ = useQuery({ queryKey: ["empresas-base-resumo"], queryFn: getEmpresaBaseResumo });
  const importacoesQ = useQuery({ queryKey: ["empresas-importacoes"], queryFn: listEmpresasImportacoes });

  const uploadM = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione a planilha mensal antes de importar.");
      const res = await importEmpresasMensal(file, competencia, autor.trim() || undefined);
      const { biSyncFromBaseAtiva } = await import("@/lib/bi-empresas");
      const { sharedSetValue } = await import("@/lib/import-processos");
      const sync = await biSyncFromBaseAtiva();
      if (sync.importacaoId) await sharedSetValue("bi_empresas.sync.importacao_id", sync.importacaoId);
      return { ...res, sync };
    },
    onSuccess: () => {
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["empresas-base-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["empresas-importacoes"] });
      queryClient.invalidateQueries({ queryKey: ["empresas_tags"] });
    },
  });


  const importacoes = importacoesQ.data ?? [];
  const latest = resumoQ.data;
  const selectedFileName = useMemo(() => file?.name ?? "Nenhum arquivo selecionado", [file]);

  return (
    <HubShell>
      <div className="max-w-[1280px] mx-auto px-8 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Empresas</div>
        <div className="flex items-start justify-between gap-4 mb-7 flex-wrap">
          <div>
            <h1 className="text-[28px] font-extrabold text-charcoal leading-tight">Base mensal de empresas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Suba a planilha S3D todo mês para atualizar a consulta Empresas & Donos e o contador do Hub.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[340px]">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Base atual</span>
                <Database size={15} />
              </div>
              <div className="text-[26px] font-extrabold text-charcoal leading-none">
                {(latest?.total ?? 0).toLocaleString("pt-BR")}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1">empresas</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Competência</span>
                <FileSpreadsheet size={15} />
              </div>
              <div className="text-[26px] font-extrabold text-charcoal leading-none">{formatCompetencia(latest?.competencia ?? null)}</div>
              <div className="text-[12px] text-muted-foreground mt-1">última ativa</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
          <section className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <UploadCloud size={18} className="text-charcoal" />
              <h2 className="text-[18px] font-extrabold text-charcoal">Novo upload mensal</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Competência</span>
                <input
                  type="month"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-border bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-charcoal/10"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Responsável</span>
                <input
                  value={autor}
                  onChange={(e) => setAutor(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full h-10 px-3 rounded-md border border-border bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-charcoal/10"
                />
              </label>
            </div>

            <label className="block border border-dashed border-border rounded-xl p-6 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition mb-4">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="text-center">
                <FileSpreadsheet className="mx-auto text-muted-foreground mb-2" size={26} />
                <div className="text-[14px] font-bold text-charcoal">{selectedFileName}</div>
                <div className="text-[12px] text-muted-foreground mt-1">XLSX, XLS ou CSV com coluna CNPJ.</div>
              </div>
            </label>

            <button
              type="button"
              onClick={() => uploadM.mutate()}
              disabled={!file || !competencia || uploadM.isPending}
              className="w-full h-11 rounded-md bg-charcoal text-white text-[13px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadM.isPending ? "Importando…" : "Importar e ativar base do mês"}
            </button>

            {uploadM.isSuccess && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
                Base atualizada com {uploadM.data.total.toLocaleString("pt-BR")} empresas.
              </div>
            )}
            {uploadM.error && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
                {(uploadM.error as Error).message}
              </div>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[15px] font-extrabold text-charcoal">Histórico de uploads</h2>
            </div>
            {importacoes.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-muted-foreground">Nenhum upload mensal registrado.</div>
            ) : (
              <div className="divide-y divide-border">
                {importacoes.map((imp) => (
                  <div key={imp.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-extrabold text-charcoal">{formatCompetencia(imp.competencia)}</div>
                        <div className="text-[12px] text-muted-foreground truncate">{imp.arquivo_nome}</div>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${imp.ativo ? "bg-brand text-charcoal" : "bg-muted text-muted-foreground"}`}>
                        {imp.ativo ? "ativa" : "histórico"}
                      </span>
                    </div>
                    <div className="mt-2 text-[12px] text-muted-foreground">
                      <strong className="text-charcoal">{imp.total_empresas.toLocaleString("pt-BR")}</strong> empresas · {new Date(imp.criado_em).toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </HubShell>
  );
}