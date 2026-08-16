
DO $$
DECLARE
  tbl text;
  auth_only_tables text[] := ARRAY[
    'agilizza_certificados','agilizza_cruzamento','agilizza_extra','agilizza_sessao',
    'auditoria_sessao','auditoria_snapshots',
    'certificados','certificados_importacoes',
    'controle_tags_snapshots',
    'cruzamento_folha_resultados','cruzamento_folha_sessao',
    'empresas_base_mensal','empresas_importacoes','empresas_tags',
    'entregas_contabil_cadastros','historico_importacoes','indicadores_mensais',
    'okr_estado','okr_painel',
    'processos','processos_versoes','tarefas_versoes',
    'saam_cadastros','sittax_monitora_ag','sittax_monitora_meta','sittax_monitora_s3d',
    'sittax_sn_cadastros','validacao_cadastro_estado'
  ];
BEGIN
  FOREACH tbl IN ARRAY auth_only_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth write %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth update %s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth delete %s" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth write %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth update %s" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', tbl, tbl);
    EXECUTE format('CREATE POLICY "auth delete %s" ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)', tbl, tbl);
  END LOOP;
END $$;
