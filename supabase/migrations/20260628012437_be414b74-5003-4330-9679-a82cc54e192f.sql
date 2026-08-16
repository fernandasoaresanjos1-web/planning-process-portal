
-- Trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ===== Auditoria Cadastral =====
CREATE TABLE public.auditoria_sessao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  file_name text,
  total integer DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditoria_sessao TO authenticated;
GRANT ALL ON public.auditoria_sessao TO service_role;
ALTER TABLE public.auditoria_sessao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage auditoria_sessao" ON public.auditoria_sessao FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_auditoria_sessao_updated BEFORE UPDATE ON public.auditoria_sessao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auditoria_dados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  file_name text,
  cnpj text,
  razao text,
  grupo text,
  regime text,
  is_cpf boolean DEFAULT false,
  is_cc boolean DEFAULT false,
  uf text,
  isento text,
  ie_s3d text,
  im text,
  tags jsonb DEFAULT '[]'::jsonb,
  sit text,
  sit_data text,
  sit_motivo text,
  simples_cnpja text,
  simples_inc text,
  sn_s3d boolean DEFAULT false,
  sn_cnpja boolean DEFAULT false,
  sn_div boolean DEFAULT false,
  cnae text,
  cnae_desc text,
  cnae_obrig text,
  ie_habilitada boolean DEFAULT false,
  consultado boolean DEFAULT false,
  ies jsonb,
  ie_status text,
  ie_probs jsonb,
  ies_s3d jsonb,
  hist jsonb,
  atividades_all jsonb,
  socios_atuais jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_dados_session ON public.auditoria_dados(session_id);
CREATE INDEX idx_auditoria_dados_cnpj ON public.auditoria_dados(cnpj);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditoria_dados TO authenticated;
GRANT ALL ON public.auditoria_dados TO service_role;
ALTER TABLE public.auditoria_dados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage auditoria_dados" ON public.auditoria_dados FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_auditoria_dados_updated BEFORE UPDATE ON public.auditoria_dados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auditoria_snapshots (
  key text PRIMARY KEY,
  data jsonb,
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditoria_snapshots TO authenticated;
GRANT ALL ON public.auditoria_snapshots TO service_role;
ALTER TABLE public.auditoria_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage auditoria_snapshots" ON public.auditoria_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_auditoria_snapshots_updated BEFORE UPDATE ON public.auditoria_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Sittax Monitora =====
CREATE TABLE public.sittax_monitora_meta (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  s3d_name text,
  ag_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittax_monitora_meta TO authenticated;
GRANT ALL ON public.sittax_monitora_meta TO service_role;
ALTER TABLE public.sittax_monitora_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage sittax_monitora_meta" ON public.sittax_monitora_meta FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sittax_monitora_meta_updated BEFORE UPDATE ON public.sittax_monitora_meta FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sittax_monitora_s3d (
  cnpj text PRIMARY KEY,
  razao text,
  regime text,
  tags jsonb DEFAULT '[]'::jsonb,
  is_cc boolean DEFAULT false,
  is_fiscal boolean DEFAULT false,
  has_dp boolean DEFAULT false,
  has_cont boolean DEFAULT false,
  has_fisc boolean DEFAULT false,
  fed_status text,
  grupo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittax_monitora_s3d TO authenticated;
GRANT ALL ON public.sittax_monitora_s3d TO service_role;
ALTER TABLE public.sittax_monitora_s3d ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage sittax_monitora_s3d" ON public.sittax_monitora_s3d FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sittax_monitora_s3d_updated BEFORE UPDATE ON public.sittax_monitora_s3d FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sittax_monitora_cpf (
  cpf_norm text PRIMARY KEY,
  cpf text,
  razao text,
  regime text,
  grupo text,
  tags jsonb DEFAULT '[]'::jsonb,
  is_cc boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittax_monitora_cpf TO authenticated;
GRANT ALL ON public.sittax_monitora_cpf TO service_role;
ALTER TABLE public.sittax_monitora_cpf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage sittax_monitora_cpf" ON public.sittax_monitora_cpf FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sittax_monitora_cpf_updated BEFORE UPDATE ON public.sittax_monitora_cpf FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sittax_monitora_ag (
  cnpj text PRIMARY KEY,
  razao text,
  equipe text,
  usa_proc boolean DEFAULT false,
  cert_raw text,
  cert_nome text,
  val_fed date,
  dias_fed integer,
  status_cert text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sittax_monitora_ag TO authenticated;
GRANT ALL ON public.sittax_monitora_ag TO service_role;
ALTER TABLE public.sittax_monitora_ag ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage sittax_monitora_ag" ON public.sittax_monitora_ag FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sittax_monitora_ag_updated BEFORE UPDATE ON public.sittax_monitora_ag FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
