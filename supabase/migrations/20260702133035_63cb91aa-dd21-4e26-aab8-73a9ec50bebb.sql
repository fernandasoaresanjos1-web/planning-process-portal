ALTER TABLE public.tarefas_fixas
  ADD COLUMN IF NOT EXISTS processo_slug text REFERENCES public.processos(slug) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tarefas_fixas_processo_slug ON public.tarefas_fixas(processo_slug);