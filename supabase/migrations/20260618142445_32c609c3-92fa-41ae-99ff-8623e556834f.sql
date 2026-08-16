
-- PROCESSES
CREATE TABLE public.processos (
  slug TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT NOT NULL DEFAULT '#0AE18C',
  icone TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processos TO anon, authenticated;
GRANT ALL ON public.processos TO service_role;
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "processos open" ON public.processos FOR ALL USING (true) WITH CHECK (true);

-- MONTHLY INDICATORS
CREATE TABLE public.indicadores_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_slug TEXT NOT NULL REFERENCES public.processos(slug) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  indicador_chave TEXT NOT NULL,
  indicador_rotulo TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'num',
  meta NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_slug, ano, mes, indicador_chave)
);
CREATE INDEX idx_ind_proc_periodo ON public.indicadores_mensais (processo_slug, ano, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicadores_mensais TO anon, authenticated;
GRANT ALL ON public.indicadores_mensais TO service_role;
ALTER TABLE public.indicadores_mensais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicadores open" ON public.indicadores_mensais FOR ALL USING (true) WITH CHECK (true);

-- IMPORT HISTORY
CREATE TABLE public.historico_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_slug TEXT NOT NULL REFERENCES public.processos(slug) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  linhas_importadas INTEGER NOT NULL DEFAULT 0,
  ano_referencia INTEGER,
  mes_referencia INTEGER,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hist_proc ON public.historico_importacoes (processo_slug, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_importacoes TO anon, authenticated;
GRANT ALL ON public.historico_importacoes TO service_role;
ALTER TABLE public.historico_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist open" ON public.historico_importacoes FOR ALL USING (true) WITH CHECK (true);

-- SEED PROCESSES (4 já construídos)
INSERT INTO public.processos (slug, nome, descricao, cor, icone, ordem) VALUES
  ('auditoria-cadastral', 'Auditoria Cadastral', 'Auditoria e conformidade de cadastros das empresas acessórias.', '#00BF63', 'shield-check', 1),
  ('validacao-cadastro', 'Validação de Cadastro', 'Validação documental e fiscal dos cadastros recebidos.', '#14C8FA', 'badge-check', 2),
  ('agilizza-cadastral', 'Agilizza Cadastral', 'Esteira ágil de tratativas cadastrais.', '#FA6914', 'zap', 3),
  ('controle-tags', 'Controle de Empresas por TAG', 'Governança e segmentação de empresas por TAGs.', '#7C3AED', 'tags', 4);
