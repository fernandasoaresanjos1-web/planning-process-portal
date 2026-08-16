create table if not exists public.acessorias_entregas (
  id              text primary key,
  cnpj            text not null,
  razao           text,
  nome_entrega    text,
  tipo            text default 'O',
  status          text,
  departamento    text,
  resp_entrega    text,
  resp_prazo      text,
  dt_prazo        text,
  dt_finalizacao  text,
  sincronizado_em timestamptz not null default now()
);
create index if not exists idx_acessorias_entregas_cnpj on public.acessorias_entregas(cnpj);
create index if not exists idx_acessorias_entregas_dt   on public.acessorias_entregas(dt_finalizacao);

create table if not exists public.acessorias_processos (
  id              text primary key,
  cnpj            text,
  razao           text,
  nome_processo   text,
  status          text,
  porcentagem     int default 0,
  departamento    text,
  gestor          text,
  dt_inicio       text,
  dt_conclusao    text,
  sincronizado_em timestamptz not null default now()
);
create index if not exists idx_acessorias_processos_cnpj on public.acessorias_processos(cnpj);
create index if not exists idx_acessorias_processos_dt   on public.acessorias_processos(dt_inicio);

grant select, insert, update, delete on public.acessorias_entregas to authenticated;
grant all on public.acessorias_entregas to service_role;
grant select, insert, update, delete on public.acessorias_processos to authenticated;
grant all on public.acessorias_processos to service_role;

alter table public.acessorias_entregas  enable row level security;
alter table public.acessorias_processos enable row level security;

create policy "staff_all_entregas" on public.acessorias_entregas
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "staff_all_processos" on public.acessorias_processos
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));