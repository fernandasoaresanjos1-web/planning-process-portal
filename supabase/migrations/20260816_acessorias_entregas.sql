-- Tabela de entregas sincronizadas do Acessórias
CREATE TABLE IF NOT EXISTS acessorias_entregas (
  id                BIGSERIAL PRIMARY KEY,
  cnpj              TEXT NOT NULL,
  competencia       TEXT NOT NULL,          -- formato YYYY-MM
  obrigacao_nome    TEXT NOT NULL,
  status            TEXT,                   -- 'Ent. antecipada','Pendente','Atrasada!',...
  dt_prazo          DATE,
  dt_entrega        DATE,
  dt_finalizacao    TIMESTAMPTZ,
  anexo_url         TEXT,                   -- link do PDF (expira em 60min, renovar no sync)
  responsavel       TEXT,
  dpto_nome         TEXT,
  sincronizado_em   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cnpj, competencia, obrigacao_nome)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ae_cnpj_comp ON acessorias_entregas(cnpj, competencia);
CREATE INDEX IF NOT EXISTS idx_ae_comp       ON acessorias_entregas(competencia);
CREATE INDEX IF NOT EXISTS idx_ae_status     ON acessorias_entregas(status);

-- RLS: leitura pública (anon), escrita só service_role
ALTER TABLE acessorias_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "leitura anon entregas"
  ON acessorias_entregas FOR SELECT TO anon USING (true);

-- Log de sincronizações
CREATE TABLE IF NOT EXISTS acessorias_sync_log (
  id            BIGSERIAL PRIMARY KEY,
  iniciado_em   TIMESTAMPTZ DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  total_empresas INT DEFAULT 0,
  total_entregas INT DEFAULT 0,
  competencia   TEXT,
  status        TEXT DEFAULT 'running',   -- running | ok | erro
  erro_msg      TEXT
);

CREATE POLICY IF NOT EXISTS "leitura anon sync_log"
  ON acessorias_sync_log FOR SELECT TO anon USING (true);
