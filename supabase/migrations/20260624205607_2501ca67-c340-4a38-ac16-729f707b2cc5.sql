
CREATE TABLE public.certificados_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL,
  arquivo_nome text NOT NULL,
  total_linhas integer NOT NULL DEFAULT 0,
  total_certificados integer NOT NULL DEFAULT 0,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificados_importacoes TO anon, authenticated;
GRANT ALL ON public.certificados_importacoes TO service_role;
ALTER TABLE public.certificados_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cert_imp_open" ON public.certificados_importacoes FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.certificados_importacoes(id) ON DELETE CASCADE,
  fonte text NOT NULL,
  cnpj text NOT NULL,
  razao text,
  validade date,
  usuarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX certificados_fonte_idx ON public.certificados(fonte);
CREATE INDEX certificados_cnpj_idx ON public.certificados(cnpj);
CREATE INDEX certificados_validade_idx ON public.certificados(validade);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificados TO anon, authenticated;
GRANT ALL ON public.certificados TO service_role;
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificados_open" ON public.certificados FOR ALL USING (true) WITH CHECK (true);
