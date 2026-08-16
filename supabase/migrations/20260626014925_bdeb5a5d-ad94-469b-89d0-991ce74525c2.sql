
CREATE TABLE public.sittax_sn_cadastros (
  cnpj text PRIMARY KEY,
  razao text,
  apelido text,
  uf text,
  cidade text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittax_sn_cadastros TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittax_sn_cadastros TO anon;
GRANT ALL ON public.sittax_sn_cadastros TO service_role;
ALTER TABLE public.sittax_sn_cadastros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open access sittax_sn_cadastros" ON public.sittax_sn_cadastros FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.processos (slug, nome, descricao, cor, ordem)
VALUES ('sittax-sn', 'Sittax SN x Acessórias', 'Conferência mensal dos cadastros do Sittax (Simples Nacional) com a base do Acessórias.', '#8B5CF6', 5)
ON CONFLICT (slug) DO NOTHING;
