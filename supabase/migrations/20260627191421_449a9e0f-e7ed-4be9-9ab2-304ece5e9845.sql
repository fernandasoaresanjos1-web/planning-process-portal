
CREATE TABLE IF NOT EXISTS public.entregas_contabil_cadastros (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  obrigacao text not null,
  razao text,
  status text,
  competencia text,
  prazo_legal text,
  prazo_tecnico text,
  data_entrega text,
  responsavel_prazo text,
  responsavel_entrega text,
  protocolo text,
  atualizado_em timestamptz not null default now(),
  unique (cnpj, obrigacao, competencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_contabil_cadastros TO authenticated, anon;
GRANT ALL ON public.entregas_contabil_cadastros TO service_role;
ALTER TABLE public.entregas_contabil_cadastros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso público entregas contábil" ON public.entregas_contabil_cadastros FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS entregas_contabil_cnpj_idx ON public.entregas_contabil_cadastros(cnpj);
