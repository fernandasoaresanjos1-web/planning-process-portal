
CREATE TABLE public.okr_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_normalizado text NOT NULL UNIQUE,
  perfil text NOT NULL DEFAULT 'colaborador',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_acessos TO anon, authenticated;
GRANT ALL ON public.okr_acessos TO service_role;

ALTER TABLE public.okr_acessos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okr_acessos open" ON public.okr_acessos FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.okr_acessos_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER okr_acessos_updated BEFORE UPDATE ON public.okr_acessos
  FOR EACH ROW EXECUTE FUNCTION public.okr_acessos_set_updated_at();

INSERT INTO public.okr_acessos (nome, nome_normalizado, perfil, ativo) VALUES
  ('Fernanda Soares', 'fernanda soares', 'gestor', true),
  ('Fernanda', 'fernanda', 'gestor', true)
ON CONFLICT (nome_normalizado) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = true;
