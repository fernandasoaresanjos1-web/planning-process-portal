DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.okr_painel') IS NOT NULL THEN
    ALTER TABLE public.okr_painel DISABLE ROW LEVEL SECURITY;
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'okr_painel'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.okr_painel', pol.policyname);
    END LOOP;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_painel TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_painel TO authenticated;
    GRANT ALL ON public.okr_painel TO service_role;
  END IF;
END $$;