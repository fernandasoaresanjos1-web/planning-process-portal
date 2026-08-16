CREATE TABLE public.acessorias_api_empresas (
  cnpj text PRIMARY KEY,
  razao text,
  status text,
  uf text,
  regime text,
  inscricoes_estaduais jsonb NOT NULL DEFAULT '[]'::jsonb,
  departamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  obrigacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acessorias_api_empresas TO authenticated;
GRANT ALL ON public.acessorias_api_empresas TO service_role;
ALTER TABLE public.acessorias_api_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read acessorias api" ON public.acessorias_api_empresas FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert acessorias api" ON public.acessorias_api_empresas FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update acessorias api" ON public.acessorias_api_empresas FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff delete acessorias api" ON public.acessorias_api_empresas FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));