UPDATE public.empresas_importacoes SET ativo = false WHERE ativo = true AND id NOT IN (SELECT id FROM public.empresas_importacoes WHERE ativo = true ORDER BY competencia DESC, criado_em DESC LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS empresas_importacoes_unica_ativa ON public.empresas_importacoes ((ativo)) WHERE ativo = true;