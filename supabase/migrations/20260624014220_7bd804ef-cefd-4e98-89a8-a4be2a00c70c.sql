
CREATE TABLE public.tarefas_versoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_slug text NOT NULL,
  arquivo_nome text NOT NULL,
  html_content text NOT NULL,
  tamanho_bytes integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas_versoes TO anon, authenticated;
GRANT ALL ON public.tarefas_versoes TO service_role;

ALTER TABLE public.tarefas_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarefas_versoes open" ON public.tarefas_versoes FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tarefas_versoes_only_one_ativo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.ativo THEN
    UPDATE public.tarefas_versoes
      SET ativo = false
      WHERE tarefa_slug = NEW.tarefa_slug
        AND id <> NEW.id
        AND ativo = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tarefas_versoes_only_one_ativo_trg
AFTER INSERT OR UPDATE OF ativo ON public.tarefas_versoes
FOR EACH ROW EXECUTE FUNCTION public.tarefas_versoes_only_one_ativo();

CREATE INDEX tarefas_versoes_slug_idx ON public.tarefas_versoes (tarefa_slug, created_at DESC);
