
CREATE TABLE public.irpj_lr_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competencia DATE NOT NULL,
  arquivo_nome TEXT NOT NULL,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  observacao TEXT,
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX irpj_lr_uploads_comp_idx ON public.irpj_lr_uploads (competencia DESC, criado_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.irpj_lr_uploads TO authenticated;
GRANT ALL ON public.irpj_lr_uploads TO service_role;
ALTER TABLE public.irpj_lr_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read irpj_lr_uploads" ON public.irpj_lr_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write irpj_lr_uploads" ON public.irpj_lr_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.irpj_lr_automatizacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES public.irpj_lr_uploads(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  cnpj TEXT NOT NULL,
  empresa TEXT,
  grupo TEXT,
  regime TEXT,
  ultimo_balancete TEXT,
  ultimo_balancete_iso DATE,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cnpj, competencia)
);
CREATE INDEX irpj_lr_auto_comp_idx ON public.irpj_lr_automatizacao (competencia DESC);
CREATE INDEX irpj_lr_auto_cnpj_idx ON public.irpj_lr_automatizacao (cnpj);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.irpj_lr_automatizacao TO authenticated;
GRANT ALL ON public.irpj_lr_automatizacao TO service_role;
ALTER TABLE public.irpj_lr_automatizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read irpj_lr_auto" ON public.irpj_lr_automatizacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write irpj_lr_auto" ON public.irpj_lr_automatizacao FOR ALL TO authenticated USING (true) WITH CHECK (true);
