ALTER TABLE public.controle_tags_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.controle_tags_empresa_hist DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_tags_snapshots TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_tags_empresa_hist TO anon, authenticated, service_role;