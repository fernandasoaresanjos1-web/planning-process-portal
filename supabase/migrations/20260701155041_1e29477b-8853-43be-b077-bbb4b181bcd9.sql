
-- Lock down all business tables: enable RLS, drop permissive policies, restrict to authenticated staff (writes to admin for sensitive PII).

DO $$
DECLARE
  tbl text;
  auth_only_tables text[] := ARRAY[
    'agilizza_certificados','agilizza_cpfs','agilizza_cruzamento','agilizza_extra','agilizza_sessao',
    'auditoria_dados','auditoria_sessao','auditoria_snapshots',
    'certificados','certificados_importacoes',
    'controle_tags_empresa_hist','controle_tags_snapshots',
    'cruzamento_folha_resultados','cruzamento_folha_sessao',
    'empresas_base_mensal','empresas_importacoes','empresas_tags',
    'entregas_contabil_cadastros','historico_importacoes','indicadores_mensais',
    'okr_acessos','okr_estado','okr_painel',
    'processos','processos_versoes','tarefas_versoes',
    'saam_cadastros','sittax_monitora_ag','sittax_monitora_cpf','sittax_monitora_meta','sittax_monitora_s3d',
    'sittax_sn_cadastros','tags_base','validacao_cadastro_estado'
  ];
  pol record;
BEGIN
  FOREACH tbl IN ARRAY auth_only_tables LOOP
    -- drop all existing policies
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
    EXECUTE format('CREATE POLICY "auth read %s" ON public.%I FOR SELECT TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth write %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth update %s" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth delete %s" ON public.%I FOR DELETE TO authenticated USING (true)', tbl, tbl);
  END LOOP;
END $$;

-- Admin-only writes for the most sensitive PII/config tables (reads still authenticated)
DO $$
DECLARE
  tbl text;
  admin_write_tables text[] := ARRAY[
    'agilizza_cpfs','sittax_monitora_cpf','okr_acessos','tags_base','controle_tags_empresa_hist','auditoria_dados'
  ];
  pol record;
BEGIN
  FOREACH tbl IN ARRAY admin_write_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname IN
      ('auth write '||tbl,'auth update '||tbl,'auth delete '||tbl) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;
    EXECUTE format('CREATE POLICY "admin write %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),''admin''))', tbl, tbl);
    EXECUTE format('CREATE POLICY "admin update %s" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),''admin'')) WITH CHECK (public.has_role(auth.uid(),''admin''))', tbl, tbl);
    EXECUTE format('CREATE POLICY "admin delete %s" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(),''admin''))', tbl, tbl);
  END LOOP;
END $$;

-- Revoke public EXECUTE on SECURITY DEFINER trigger/helper functions (triggers still work; service_role always allowed)
REVOKE EXECUTE ON FUNCTION public.processos_versoes_only_one_ativo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tarefas_versoes_only_one_ativo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- has_role must remain callable by authenticated users (used in RLS policies via SECURITY DEFINER context is fine; keep authenticated)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
