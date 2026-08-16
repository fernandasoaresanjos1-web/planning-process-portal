
-- Helper predicate reused inline: has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor')

-- =========================================================================
-- 1) user_roles: admin-only write policies (fix privilege escalation)
-- =========================================================================
CREATE POLICY "Only admins can insert user_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can update user_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can delete user_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================================
-- 2) tarefas_fixas_execucoes: verify the user is responsible for the tarefa
-- =========================================================================
DROP POLICY IF EXISTS "auth insert tf_exec" ON public.tarefas_fixas_execucoes;
CREATE POLICY "auth insert tf_exec" ON public.tarefas_fixas_execucoes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = executada_por_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'gestor'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.tarefas_fixas tf
        WHERE tf.id = tarefa_id
          AND (tf.responsavel_id = auth.uid() OR tf.created_by = auth.uid())
      )
    )
  );

-- =========================================================================
-- 3) Business tables: replace permissive writes with admin/gestor-only
--    Read access stays as-is (existing SELECT policies untouched).
-- =========================================================================
DO $$
DECLARE
  t text;
  business_tables text[] := ARRAY[
    'acessorias_obrigacoes','acessorias_obrigacoes_meta',
    'agilizza_certificados','agilizza_cruzamento','agilizza_extra','agilizza_sessao',
    'auditoria_sessao','auditoria_snapshots',
    'bi_config_contabil','bi_config_fiscal','bi_config_folha','bi_empresas','bi_opcoes','bi_vidas_empregados',
    'certificados','certificados_importacoes',
    'controle_tags_snapshots','cruzamento_folha_resultados','cruzamento_folha_sessao',
    'empresas_base_mensal','empresas_importacoes','empresas_tags',
    'entregas_contabil_cadastros','historico_importacoes','indicadores_mensais',
    'irpj_lp_automatizacao','irpj_lp_uploads',
    'okr_estado','okr_painel',
    'processos','processos_versoes','tarefas_versoes',
    'procuracoes_cadastros','saam_cadastros',
    'sittax_monitora_ag','sittax_monitora_meta','sittax_monitora_s3d','sittax_sn_cadastros',
    'validacao_cadastro_estado'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY business_tables LOOP
    -- Drop all existing INSERT/UPDATE/DELETE/ALL policies on the table
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Recreate admin/gestor-only write policies
    EXECUTE format(
      'CREATE POLICY "admin_gestor_insert" ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_role(auth.uid(), ''gestor''::app_role))',
      t);
    EXECUTE format(
      'CREATE POLICY "admin_gestor_update" ON public.%I FOR UPDATE TO authenticated
         USING (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_role(auth.uid(), ''gestor''::app_role))
         WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_role(auth.uid(), ''gestor''::app_role))',
      t);
    EXECUTE format(
      'CREATE POLICY "admin_gestor_delete" ON public.%I FOR DELETE TO authenticated
         USING (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_role(auth.uid(), ''gestor''::app_role))',
      t);
  END LOOP;
END $$;
