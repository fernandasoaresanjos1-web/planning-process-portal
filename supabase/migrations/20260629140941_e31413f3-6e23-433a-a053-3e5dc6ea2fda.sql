CREATE TABLE public.cruzamento_folha_sessao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  file_s3d text,
  file_cad text,
  file_emp text,
  total_empresas_dp integer NOT NULL DEFAULT 0,
  total_alertas integer NOT NULL DEFAULT 0,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruzamento_folha_sessao TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruzamento_folha_sessao TO authenticated;
GRANT ALL ON public.cruzamento_folha_sessao TO service_role;

ALTER TABLE public.cruzamento_folha_sessao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage cruzamento folha sessions"
ON public.cruzamento_folha_sessao
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE TABLE public.cruzamento_folha_resultados (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL REFERENCES public.cruzamento_folha_sessao(session_id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('equipe_dp', 'sem_tag_dp')),
  nome text,
  cnpj text,
  equipe text,
  responsavel text,
  tags text,
  trabalhando integer NOT NULL DEFAULT 0,
  ferias integer NOT NULL DEFAULT 0,
  afastados integer NOT NULL DEFAULT 0,
  total_ativos integer NOT NULL DEFAULT 0,
  tem_ativos boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruzamento_folha_resultados TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cruzamento_folha_resultados TO authenticated;
GRANT ALL ON public.cruzamento_folha_resultados TO service_role;

ALTER TABLE public.cruzamento_folha_resultados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage cruzamento folha results"
ON public.cruzamento_folha_resultados
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX cruzamento_folha_resultados_session_idx ON public.cruzamento_folha_resultados(session_id);
CREATE INDEX cruzamento_folha_resultados_tipo_idx ON public.cruzamento_folha_resultados(tipo);
CREATE INDEX cruzamento_folha_resultados_cnpj_idx ON public.cruzamento_folha_resultados(cnpj);