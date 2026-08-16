
CREATE TABLE public.bi_opcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  valor text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (categoria, valor)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_opcoes TO authenticated;
GRANT ALL ON public.bi_opcoes TO service_role;

ALTER TABLE public.bi_opcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read bi_opcoes" ON public.bi_opcoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write bi_opcoes" ON public.bi_opcoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER bi_opcoes_updated_at BEFORE UPDATE ON public.bi_opcoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed com as listas atuais
INSERT INTO public.bi_opcoes (categoria, valor, ordem) VALUES
  ('sistema_folha','Domínio',1),
  ('sistema_folha','Senior',2),
  ('sistema_folha','Alterdata',3),
  ('sistema_folha','Questor',4),
  ('sistema_folha','Fortes',5),
  ('sistema_folha','Nasajon',6),
  ('sistema_folha','RM',7),
  ('sistema_folha','Folhamatic',8),
  ('sistema_folha','Totvs RH',9),
  ('sistema_folha','Outro',10),
  ('sistema_folha','Sem movimento',11),
  ('sistema_cli','Excel / Google Sheets',1),
  ('sistema_cli','SAP',2),
  ('sistema_cli','Oracle',3),
  ('sistema_cli','TOTVS Protheus',4),
  ('sistema_cli','Senior',5),
  ('sistema_cli','Linx',6),
  ('sistema_cli','Bling',7),
  ('sistema_cli','Conta Azul',8),
  ('sistema_cli','Omie',9),
  ('sistema_cli','Netsuite',10),
  ('sistema_cli','Outro',11),
  ('fechamento_folha','Último dia útil do mês',1),
  ('fechamento_folha','5º dia útil do mês seguinte',2),
  ('apuracao','Mensal',1),
  ('apuracao','Trimestral',2),
  ('fech_tipo','Mensal',1),
  ('fech_tipo','Trimestral',2),
  ('fech_tipo','Semestral',3),
  ('fech_tipo','Anual',4),
  ('fech_tipo','Sem movimento',5)
ON CONFLICT (categoria, valor) DO NOTHING;
