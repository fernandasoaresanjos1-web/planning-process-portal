
-- Base de Informações Empresas: 5 tabelas para cadastro completo de empresas
CREATE TABLE IF NOT EXISTS public.bi_empresas (
  cnpj       TEXT PRIMARY KEY,
  razao      TEXT,
  regime     TEXT,
  grupo      TEXT,
  tags       TEXT,
  pessoal    TEXT,
  contabil   TEXT,
  fiscal     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_empresas TO authenticated;
GRANT ALL ON public.bi_empresas TO service_role;
ALTER TABLE public.bi_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_empresas_auth_all" ON public.bi_empresas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.bi_config_folha (
  cnpj       TEXT PRIMARY KEY REFERENCES public.bi_empresas(cnpj) ON DELETE CASCADE,
  sistema    TEXT,
  adiant     BOOLEAN DEFAULT FALSE,
  dia_adiant TEXT,
  fechamento TEXT,
  curva      TEXT CHECK (curva IN ('','A','B','C')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_config_folha TO authenticated;
GRANT ALL ON public.bi_config_folha TO service_role;
ALTER TABLE public.bi_config_folha ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_config_folha_auth_all" ON public.bi_config_folha FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.bi_config_contabil (
  cnpj         TEXT PRIMARY KEY REFERENCES public.bi_empresas(cnpj) ON DELETE CASCADE,
  integrado    TEXT CHECK (integrado IN ('','sim','nao')),
  software     TEXT,
  apuracao     TEXT,
  fech_tipo    TEXT,
  tipo_emp     TEXT CHECK (tipo_emp IN ('','Operacional','Holding')),
  tipo_holding TEXT,
  curva        TEXT CHECK (curva IN ('','A','B','C')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_config_contabil TO authenticated;
GRANT ALL ON public.bi_config_contabil TO service_role;
ALTER TABLE public.bi_config_contabil ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_config_contabil_auth_all" ON public.bi_config_contabil FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.bi_config_fiscal (
  cnpj       TEXT PRIMARY KEY REFERENCES public.bi_empresas(cnpj) ON DELETE CASCADE,
  curva      TEXT CHECK (curva IN ('','A','B','C')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_config_fiscal TO authenticated;
GRANT ALL ON public.bi_config_fiscal TO service_role;
ALTER TABLE public.bi_config_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_config_fiscal_auth_all" ON public.bi_config_fiscal FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.bi_vidas_empregados (
  cnpj         TEXT PRIMARY KEY,
  trabalhando  INTEGER DEFAULT 0,
  ferias       INTEGER DEFAULT 0,
  afastados    INTEGER DEFAULT 0,
  total_ativos INTEGER DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_vidas_empregados TO authenticated;
GRANT ALL ON public.bi_vidas_empregados TO service_role;
ALTER TABLE public.bi_vidas_empregados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_vidas_auth_all" ON public.bi_vidas_empregados FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_bi_empresas_regime ON public.bi_empresas(regime);
