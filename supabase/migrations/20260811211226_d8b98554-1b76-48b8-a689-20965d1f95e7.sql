create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,
  departamento text,
  email text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
grant select, insert, update, delete on public.colaboradores to authenticated;
grant all on public.colaboradores to service_role;
alter table public.colaboradores enable row level security;
create policy "staff_colaboradores" on public.colaboradores for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger colaboradores_updated_at before update on public.colaboradores for each row execute function public.update_updated_at_column();

create table if not exists public.carteira_vinculos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.colaboradores(id) on delete cascade,
  cnpj text not null,
  razao text,
  departamento text not null,
  dt_inicio date not null,
  dt_fim date,
  status text not null default 'pendente',
  motivo text,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_carteira_cnpj on public.carteira_vinculos(cnpj);
create index if not exists idx_carteira_colaborador on public.carteira_vinculos(colaborador_id);
create index if not exists idx_carteira_status on public.carteira_vinculos(status);
grant select, insert, update, delete on public.carteira_vinculos to authenticated;
grant all on public.carteira_vinculos to service_role;
alter table public.carteira_vinculos enable row level security;
create policy "staff_carteira_vinculos" on public.carteira_vinculos for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create trigger carteira_vinculos_updated_at before update on public.carteira_vinculos for each row execute function public.update_updated_at_column();

create table if not exists public.carteira_historico (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid references public.carteira_vinculos(id) on delete set null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  cnpj text not null,
  razao text,
  departamento text,
  evento text not null,
  dt_vigencia date,
  motivo text,
  registrado_em timestamptz not null default now(),
  registrado_por text
);
create index if not exists idx_carteira_hist_cnpj on public.carteira_historico(cnpj);
create index if not exists idx_carteira_hist_colab on public.carteira_historico(colaborador_id);
grant select, insert, update, delete on public.carteira_historico to authenticated;
grant all on public.carteira_historico to service_role;
alter table public.carteira_historico enable row level security;
create policy "staff_carteira_historico" on public.carteira_historico for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));