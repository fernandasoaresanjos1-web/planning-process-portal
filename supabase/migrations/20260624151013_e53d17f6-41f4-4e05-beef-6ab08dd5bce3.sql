CREATE OR REPLACE FUNCTION public.tarefas_versoes_only_one_ativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.processos_versoes_only_one_ativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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