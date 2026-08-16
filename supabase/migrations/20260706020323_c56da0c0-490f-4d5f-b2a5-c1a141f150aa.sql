
CREATE TABLE IF NOT EXISTS public.acessorias_obrigacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  mininome TEXT NOT NULL DEFAULT '',
  dept TEXT NOT NULL DEFAULT '',
  dept_full TEXT NOT NULL DEFAULT '',
  responsavel TEXT NOT NULL DEFAULT '',
  qtde INTEGER NOT NULL DEFAULT 0,
  prazos JSONB NOT NULL DEFAULT '[]'::jsonb,
  dias_antes TEXT NOT NULL DEFAULT '',
  tipo_dias TEXT NOT NULL DEFAULT '',
  prazo_nao_util TEXT NOT NULL DEFAULT '',
  sabado_util TEXT NOT NULL DEFAULT '',
  competencia TEXT NOT NULL DEFAULT '',
  robo BOOLEAN NOT NULL DEFAULT false,
  multa BOOLEAN NOT NULL DEFAULT false,
  alerta_guia BOOLEAN NOT NULL DEFAULT false,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(nome)
);

CREATE TABLE IF NOT EXISTS public.acessorias_obrigacoes_meta (
  id INTEGER PRIMARY KEY DEFAULT 1,
  file_name TEXT NOT NULL DEFAULT '',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_ativas INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.acessorias_obrigacoes TO authenticated;
GRANT ALL ON public.acessorias_obrigacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acessorias_obrigacoes_meta TO authenticated;
GRANT ALL ON public.acessorias_obrigacoes_meta TO service_role;

ALTER TABLE public.acessorias_obrigacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acessorias_obrigacoes_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read obrigacoes" ON public.acessorias_obrigacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write obrigacoes" ON public.acessorias_obrigacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update obrigacoes" ON public.acessorias_obrigacoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete obrigacoes" ON public.acessorias_obrigacoes FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read meta" ON public.acessorias_obrigacoes_meta FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write meta" ON public.acessorias_obrigacoes_meta FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update meta" ON public.acessorias_obrigacoes_meta FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_acessorias_obrigacoes_upd
  BEFORE UPDATE ON public.acessorias_obrigacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
