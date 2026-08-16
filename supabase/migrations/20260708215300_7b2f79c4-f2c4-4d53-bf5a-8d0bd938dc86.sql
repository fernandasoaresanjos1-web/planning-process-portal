
CREATE TABLE public.procuracoes_cadastros (
  cnpj text PRIMARY KEY,
  razao text,
  validade date,
  situacao text,
  certificado text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procuracoes_cadastros TO authenticated;
GRANT ALL ON public.procuracoes_cadastros TO service_role;

ALTER TABLE public.procuracoes_cadastros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler procurações"
  ON public.procuracoes_cadastros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem inserir procurações"
  ON public.procuracoes_cadastros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados podem atualizar procurações"
  ON public.procuracoes_cadastros FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem apagar procurações"
  ON public.procuracoes_cadastros FOR DELETE TO authenticated USING (true);
