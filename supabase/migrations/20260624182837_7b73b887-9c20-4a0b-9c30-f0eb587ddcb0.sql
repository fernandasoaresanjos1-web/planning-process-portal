CREATE TABLE public.empresas_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competencia date NOT NULL,
  arquivo_nome text NOT NULL,
  total_linhas integer NOT NULL DEFAULT 0,
  total_empresas integer NOT NULL DEFAULT 0,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas_importacoes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas_importacoes TO authenticated;
GRANT ALL ON public.empresas_importacoes TO service_role;

ALTER TABLE public.empresas_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresas_importacoes open" ON public.empresas_importacoes FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE public.empresas_base_mensal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  importacao_id uuid NOT NULL REFERENCES public.empresas_importacoes(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  cnpj text NOT NULL,
  razao text,
  nome_fantasia text,
  regime text,
  grupo text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  sem_tag boolean NOT NULL DEFAULT false,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT empresas_base_mensal_competencia_cnpj_key UNIQUE (competencia, cnpj)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas_base_mensal TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas_base_mensal TO authenticated;
GRANT ALL ON public.empresas_base_mensal TO service_role;

ALTER TABLE public.empresas_base_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresas_base_mensal open" ON public.empresas_base_mensal FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX empresas_base_mensal_competencia_idx ON public.empresas_base_mensal (competencia DESC);
CREATE INDEX empresas_base_mensal_cnpj_idx ON public.empresas_base_mensal (cnpj);
CREATE INDEX empresas_base_mensal_grupo_idx ON public.empresas_base_mensal (grupo);
CREATE INDEX empresas_base_mensal_importacao_idx ON public.empresas_base_mensal (importacao_id);
CREATE INDEX empresas_importacoes_competencia_idx ON public.empresas_importacoes (competencia DESC);