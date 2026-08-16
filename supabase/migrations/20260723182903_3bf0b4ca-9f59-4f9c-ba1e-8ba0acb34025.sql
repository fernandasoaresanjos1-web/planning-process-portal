CREATE POLICY "staff read bi_empresas" ON public.bi_empresas FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read bi_config_contabil" ON public.bi_config_contabil FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read bi_config_folha" ON public.bi_config_folha FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read bi_config_fiscal" ON public.bi_config_fiscal FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read bi_vidas_empregados" ON public.bi_vidas_empregados FOR SELECT USING (public.is_staff(auth.uid()));