CREATE TABLE public.validacao_cadastro_estado (
  id INTEGER PRIMARY KEY DEFAULT 1,
  empresas JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_name TEXT,
  total_empresas INTEGER NOT NULL DEFAULT 0,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT validacao_cadastro_estado_single CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validacao_cadastro_estado TO anon, authenticated;
GRANT ALL ON public.validacao_cadastro_estado TO service_role;
ALTER TABLE public.validacao_cadastro_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validacao cadastro public read" ON public.validacao_cadastro_estado FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "validacao cadastro public write" ON public.validacao_cadastro_estado FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
INSERT INTO public.validacao_cadastro_estado (id, empresas, total_empresas) VALUES (1, '[]'::jsonb, 0) ON CONFLICT DO NOTHING;