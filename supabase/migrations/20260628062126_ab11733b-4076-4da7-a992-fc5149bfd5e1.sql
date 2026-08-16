
-- Tabelas Agilizza (Sittax Monitora rebuild)
CREATE TABLE public.agilizza_sessao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  file_s3d text,
  file_ag text,
  total_s3d integer,
  total_ag integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agilizza_sessao TO authenticated;
GRANT ALL ON public.agilizza_sessao TO service_role;
ALTER TABLE public.agilizza_sessao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agilizza_sessao" ON public.agilizza_sessao FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.agilizza_cruzamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  cnpj text,
  razao text,
  regime text,
  grupo text,
  tags jsonb,
  fed_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agilizza_cruz_session ON public.agilizza_cruzamento(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agilizza_cruzamento TO authenticated;
GRANT ALL ON public.agilizza_cruzamento TO service_role;
ALTER TABLE public.agilizza_cruzamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agilizza_cruz" ON public.agilizza_cruzamento FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.agilizza_certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  cert_nome text,
  cert_tipo text,
  val_fed text,
  dias_fed integer,
  status_cert text,
  empresas jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agilizza_cert_session ON public.agilizza_certificados(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agilizza_certificados TO authenticated;
GRANT ALL ON public.agilizza_certificados TO service_role;
ALTER TABLE public.agilizza_certificados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agilizza_cert" ON public.agilizza_certificados FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.agilizza_cpfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  cpf text,
  razao text,
  regime text,
  grupo text,
  tags jsonb,
  no_ag boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agilizza_cpfs_session ON public.agilizza_cpfs(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agilizza_cpfs TO authenticated;
GRANT ALL ON public.agilizza_cpfs TO service_role;
ALTER TABLE public.agilizza_cpfs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agilizza_cpfs" ON public.agilizza_cpfs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.agilizza_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  cnpj text,
  razao text,
  equipe text,
  cert_nome text,
  cert_raw text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agilizza_extra_session ON public.agilizza_extra(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agilizza_extra TO authenticated;
GRANT ALL ON public.agilizza_extra TO service_role;
ALTER TABLE public.agilizza_extra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agilizza_extra" ON public.agilizza_extra FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Painel OKR (novo, estado completo)
CREATE TABLE public.okr_painel (
  id text PRIMARY KEY,
  okrs jsonb,
  pessoas jsonb,
  produtos jsonb,
  triagem jsonb,
  sistemas jsonb,
  next_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_painel TO authenticated;
GRANT ALL ON public.okr_painel TO service_role;
ALTER TABLE public.okr_painel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all okr_painel" ON public.okr_painel FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER okr_painel_updated_at BEFORE UPDATE ON public.okr_painel FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
