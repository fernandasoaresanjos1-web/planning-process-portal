CREATE TABLE public.tags_base (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  dept TEXT NOT NULL,
  coord TEXT,
  gerente TEXT,
  supers TEXT[] NOT NULL DEFAULT '{}',
  ordem INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags_base TO anon, authenticated;
GRANT ALL ON public.tags_base TO service_role;
ALTER TABLE public.tags_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_base open" ON public.tags_base FOR ALL TO public USING (true) WITH CHECK (true);