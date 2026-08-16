
CREATE TABLE public.tarefas_fixas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  periodicidade TEXT NOT NULL CHECK (periodicidade IN ('diaria','semanal','quinzenal','mensal')),
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  proxima_execucao DATE NOT NULL DEFAULT CURRENT_DATE,
  ultima_execucao TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas_fixas TO authenticated;
GRANT ALL ON public.tarefas_fixas TO service_role;
ALTER TABLE public.tarefas_fixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tarefas_fixas" ON public.tarefas_fixas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tarefas_fixas" ON public.tarefas_fixas FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth update own tarefas_fixas" ON public.tarefas_fixas FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (created_by = auth.uid() OR responsavel_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "auth delete own tarefas_fixas" ON public.tarefas_fixas FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

CREATE TRIGGER trg_tarefas_fixas_updated_at BEFORE UPDATE ON public.tarefas_fixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tarefas_fixas_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES public.tarefas_fixas(id) ON DELETE CASCADE,
  executada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  executada_por_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executada_por_nome TEXT,
  observacao TEXT,
  periodicidade_no_momento TEXT,
  proxima_execucao_anterior DATE,
  proxima_execucao_nova DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tf_execucoes_tarefa ON public.tarefas_fixas_execucoes(tarefa_id, executada_em DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas_fixas_execucoes TO authenticated;
GRANT ALL ON public.tarefas_fixas_execucoes TO service_role;
ALTER TABLE public.tarefas_fixas_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tf_exec" ON public.tarefas_fixas_execucoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert tf_exec" ON public.tarefas_fixas_execucoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = executada_por_id);
CREATE POLICY "auth delete tf_exec" ON public.tarefas_fixas_execucoes FOR DELETE TO authenticated
  USING (executada_por_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
