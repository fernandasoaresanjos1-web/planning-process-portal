ALTER TABLE public.saam_cadastros ADD COLUMN IF NOT EXISTS base text NOT NULL DEFAULT '260';
ALTER TABLE public.saam_cadastros DROP CONSTRAINT IF EXISTS saam_cadastros_pkey;
ALTER TABLE public.saam_cadastros ADD PRIMARY KEY (base, cnpj);

CREATE TABLE IF NOT EXISTS public.saam_bases (
  base text PRIMARY KEY,
  rotulo text NOT NULL,
  quantidade_contratada integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saam_bases TO authenticated;
GRANT ALL ON public.saam_bases TO service_role;
ALTER TABLE public.saam_bases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read saam_bases" ON public.saam_bases FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "admin_gestor_insert_saam_bases" ON public.saam_bases FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor'));
CREATE POLICY "admin_gestor_update_saam_bases" ON public.saam_bases FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor')) WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor'));
CREATE POLICY "admin_gestor_delete_saam_bases" ON public.saam_bases FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor'));

INSERT INTO public.saam_bases (base, rotulo, quantidade_contratada) VALUES
  ('260','BPO',0),
  ('491','Consultoria',0)
ON CONFLICT (base) DO NOTHING;