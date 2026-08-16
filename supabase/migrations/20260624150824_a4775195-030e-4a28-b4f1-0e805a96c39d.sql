CREATE TABLE public.okr_estado (
  chave text PRIMARY KEY,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_estado TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_estado TO anon;
GRANT ALL ON public.okr_estado TO service_role;

ALTER TABLE public.okr_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okr_estado open" ON public.okr_estado FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.okr_estado (chave, dados) VALUES ('painel', '{}'::jsonb), ('implantacao', '{}'::jsonb)
ON CONFLICT (chave) DO NOTHING;