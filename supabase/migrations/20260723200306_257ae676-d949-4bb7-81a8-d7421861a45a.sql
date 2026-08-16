CREATE TABLE public.shared_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_state TO authenticated;
GRANT ALL ON public.shared_state TO service_role;
ALTER TABLE public.shared_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read shared_state" ON public.shared_state FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "admin_gestor_insert shared_state" ON public.shared_state FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role));
CREATE POLICY "admin_gestor_update shared_state" ON public.shared_state FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role));
CREATE POLICY "admin_gestor_delete shared_state" ON public.shared_state FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role));