create table if not exists public.carteira_trava (
  id int primary key default 1 check (id = 1),
  travado boolean not null default false,
  dt_liberacao date,
  atualizado_em timestamptz default now(),
  atualizado_por text
);
insert into public.carteira_trava (id, travado) values (1, false) on conflict do nothing;
grant select, update on public.carteira_trava to authenticated;
grant all on public.carteira_trava to service_role;
alter table public.carteira_trava enable row level security;
drop policy if exists "staff_trava" on public.carteira_trava;
create policy "staff_trava" on public.carteira_trava for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

alter table public.carteira_vinculos add column if not exists grupo text;
alter table public.carteira_vinculos alter column cnpj drop not null;
update public.carteira_vinculos set grupo = coalesce(grupo, razao, cnpj) where grupo is null;
create index if not exists idx_carteira_grupo on public.carteira_vinculos(grupo);
create index if not exists idx_carteira_status on public.carteira_vinculos(status);

alter table public.carteira_historico add column if not exists grupo text;
alter table public.carteira_historico add column if not exists colaborador_nome text;
alter table public.carteira_historico add column if not exists colaborador_cargo text;
alter table public.carteira_historico alter column cnpj drop not null;