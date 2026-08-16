CREATE TABLE public.controle_tags_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  importacao_id uuid,
  competencia date,
  total_empresas int NOT NULL DEFAULT 0,
  total_tags int NOT NULL DEFAULT 0,
  total_alteradas int NOT NULL DEFAULT 0,
  total_novas int NOT NULL DEFAULT 0,
  total_removidas int NOT NULL DEFAULT 0,
  observacao text,
  criado_por text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_tags_snapshots TO authenticated;
GRANT ALL ON public.controle_tags_snapshots TO service_role;
ALTER TABLE public.controle_tags_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access controle_tags_snapshots" ON public.controle_tags_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.controle_tags_empresa_hist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.controle_tags_snapshots(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  razao text,
  regime text,
  grupo text,
  tags text[] NOT NULL DEFAULT '{}',
  sem_tag boolean NOT NULL DEFAULT false,
  diff_added text[] NOT NULL DEFAULT '{}',
  diff_removed text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ok'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_tags_empresa_hist TO authenticated;
GRANT ALL ON public.controle_tags_empresa_hist TO service_role;
ALTER TABLE public.controle_tags_empresa_hist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access controle_tags_empresa_hist" ON public.controle_tags_empresa_hist FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_controle_tags_hist_snapshot ON public.controle_tags_empresa_hist(snapshot_id);
CREATE INDEX idx_controle_tags_hist_cnpj ON public.controle_tags_empresa_hist(cnpj);
CREATE INDEX idx_controle_tags_hist_status ON public.controle_tags_empresa_hist(status) WHERE status <> 'ok';
CREATE INDEX idx_controle_tags_snapshots_criado ON public.controle_tags_snapshots(criado_em DESC);