CREATE TABLE public.auditoria_observacoes (
  cnpj text PRIMARY KEY,
  observacao text,
  usuario text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditoria_observacoes TO authenticated;
GRANT ALL ON public.auditoria_observacoes TO service_role;

ALTER TABLE public.auditoria_observacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver observacoes" ON public.auditoria_observacoes
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff pode inserir observacoes" ON public.auditoria_observacoes
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff pode atualizar observacoes" ON public.auditoria_observacoes
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff pode remover observacoes" ON public.auditoria_observacoes
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));