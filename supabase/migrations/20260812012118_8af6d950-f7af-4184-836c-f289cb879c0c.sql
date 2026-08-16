alter table public.acessorias_entregas
  add column if not exists competencia text,
  add column if not exists fechado boolean not null default false;

create index if not exists idx_entregas_competencia on public.acessorias_entregas(competencia);
create index if not exists idx_entregas_fechado on public.acessorias_entregas(fechado);
create unique index if not exists uq_entregas_id_competencia on public.acessorias_entregas(id, competencia);

update public.acessorias_entregas
set competencia = substr(dt_prazo, 1, 7)
where competencia is null and dt_prazo is not null and dt_prazo <> '' and dt_prazo not like '0000%';

create table if not exists public.competencias_fechadas (
  competencia text primary key,
  fechado_em timestamptz not null default now(),
  fechado_por text,
  totais_json jsonb not null default '{}'::jsonb
);

grant select, insert, update, delete on public.competencias_fechadas to authenticated;
grant all on public.competencias_fechadas to service_role;

alter table public.competencias_fechadas enable row level security;

drop policy if exists "staff_comp_fechadas" on public.competencias_fechadas;
create policy "staff_comp_fechadas" on public.competencias_fechadas
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));