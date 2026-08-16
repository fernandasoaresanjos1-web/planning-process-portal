-- Colunas novas na tabela empresas
-- Execute no SQL Editor do Supabase (vnmuxxyucstbckbyitro)

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS ie_normal          TEXT,
  ADD COLUMN IF NOT EXISTS ie_st              TEXT,
  ADD COLUMN IF NOT EXISTS im                 TEXT,
  ADD COLUMN IF NOT EXISTS fechamento_contabil TEXT,
  ADD COLUMN IF NOT EXISTS modalidade_lucro_real TEXT,
  ADD COLUMN IF NOT EXISTS retencao_lucro     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_cnpj          TEXT,
  ADD COLUMN IF NOT EXISTS adiantamento       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fechamento_folha   TEXT;

-- Política de escrita para anon (edição inline no portal)
CREATE POLICY IF NOT EXISTS "escrita anon empresas"
  ON empresas FOR UPDATE TO anon
  USING (true) WITH CHECK (true);
