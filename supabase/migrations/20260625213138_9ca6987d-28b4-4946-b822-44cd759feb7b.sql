UPDATE public.okr_estado
SET dados = jsonb_set(
  COALESCE(dados, '{}'::jsonb),
  '{usuarios}',
  '[{"nome":"Fernanda","perfil":"gestor","permissao":"total","ativo":true}]'::jsonb,
  true
),
atualizado_em = now()
WHERE chave = 'painel';