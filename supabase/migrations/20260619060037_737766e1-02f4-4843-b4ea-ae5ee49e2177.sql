
CREATE TABLE public.processos_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_slug text NOT NULL REFERENCES public.processos(slug) ON DELETE CASCADE,
  arquivo_nome text NOT NULL,
  html_content text NOT NULL,
  tamanho_bytes integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pv_slug_ativo ON public.processos_versoes(processo_slug, ativo);
CREATE INDEX idx_pv_slug_created ON public.processos_versoes(processo_slug, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.processos_versoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processos_versoes TO anon;
GRANT ALL ON public.processos_versoes TO service_role;

ALTER TABLE public.processos_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versoes open" ON public.processos_versoes FOR ALL USING (true) WITH CHECK (true);

-- Ensure only one ativo per slug: when inserting ativo=true, deactivate others
CREATE OR REPLACE FUNCTION public.processos_versoes_only_one_ativo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ativo THEN
    UPDATE public.processos_versoes
      SET ativo = false
      WHERE processo_slug = NEW.processo_slug
        AND id <> NEW.id
        AND ativo = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pv_only_one_ativo
AFTER INSERT OR UPDATE OF ativo ON public.processos_versoes
FOR EACH ROW EXECUTE FUNCTION public.processos_versoes_only_one_ativo();
