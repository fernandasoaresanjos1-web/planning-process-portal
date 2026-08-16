CREATE TABLE public.saam_cadastros (
  cnpj text PRIMARY KEY,
  razao text,
  apelido text,
  uf text,
  cidade text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saam_cadastros TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saam_cadastros TO anon;
GRANT ALL ON public.saam_cadastros TO service_role;
ALTER TABLE public.saam_cadastros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saam_cadastros all" ON public.saam_cadastros FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.processos (slug, nome, descricao, cor)
VALUES ('saam', 'Acessórias x SAAM', 'Conferência das empresas de Lucro Real e Lucro Presumido (TAG Fiscal) cadastradas no SAAM.', '#14B8A6')
ON CONFLICT (slug) DO UPDATE SET nome=EXCLUDED.nome, descricao=EXCLUDED.descricao, cor=EXCLUDED.cor;