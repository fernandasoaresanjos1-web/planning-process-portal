CREATE TABLE public.empresas_tags (
  cnpj TEXT PRIMARY KEY,
  razao TEXT,
  regime TEXT,
  grupo TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  sem_tag BOOLEAN NOT NULL DEFAULT false,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX empresas_tags_grupo_idx ON public.empresas_tags (grupo);
CREATE INDEX empresas_tags_tags_idx  ON public.empresas_tags USING GIN (tags);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas_tags TO anon, authenticated;
GRANT ALL ON public.empresas_tags TO service_role;
ALTER TABLE public.empresas_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresas_tags open" ON public.empresas_tags FOR ALL TO public USING (true) WITH CHECK (true);