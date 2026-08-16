DO $$
DECLARE
  tbl text;
  pol record;
  tables text[] := ARRAY[
    'auditoria_dados',
    'auditoria_sessao',
    'auditoria_snapshots',
    'agilizza_sessao',
    'agilizza_cruzamento',
    'agilizza_certificados',
    'agilizza_cpfs',
    'agilizza_extra',
    'okr_estado',
    'okr_painel'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);

      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;

      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
    END IF;
  END LOOP;
END $$;