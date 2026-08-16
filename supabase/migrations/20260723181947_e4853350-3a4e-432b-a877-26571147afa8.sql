
-- 1. is_staff helper
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- 2. handle_new_user: only bootstrap first admin; other signups get profile but no role until admin grants one
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_first_admin boolean;
BEGIN
  v_is_first_admin := NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');
  INSERT INTO public.profiles (id, email, nome, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NOT v_is_first_admin
  );
  IF v_is_first_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Replace broad SELECT policies with is_staff checks
DO $$
DECLARE
  r record;
  v_tables text[] := ARRAY[
    'acessorias_obrigacoes','acessorias_obrigacoes_meta','agilizza_certificados','agilizza_cpfs',
    'agilizza_cruzamento','agilizza_extra','agilizza_sessao','auditoria_dados','auditoria_sessao',
    'auditoria_snapshots','bi_opcoes','certificados','certificados_importacoes',
    'controle_tags_empresa_hist','controle_tags_snapshots','cruzamento_folha_resultados',
    'cruzamento_folha_sessao','empresas_base_mensal','empresas_importacoes','empresas_tags',
    'entregas_contabil_cadastros','historico_importacoes','indicadores_mensais',
    'irpj_lp_automatizacao','irpj_lp_uploads','okr_acessos','okr_estado','okr_painel',
    'processos','processos_versoes','procuracoes_cadastros','saam_cadastros',
    'sittax_monitora_ag','sittax_monitora_cpf','sittax_monitora_meta','sittax_monitora_s3d',
    'sittax_sn_cadastros','tags_base','tarefas_fixas','tarefas_fixas_execucoes',
    'tarefas_versoes','validacao_cadastro_estado'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='SELECT' AND qual='true'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
      t
    );
  END LOOP;
END $$;
