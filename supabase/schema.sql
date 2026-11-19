-- =============================================================================
-- Mercadito ROMO — esquema PostgreSQL para Supabase
-- Ejecutar EN SUPABASE → SQL Editor → New query → pegar todo → Run.
-- Es IDEMPOTENTE: puedes ejecutarlo varias veces sin errores de "ya existe".
-- El orden importa: tenants se crea antes de las tablas que lo referencian.
--
-- Si una prueba anterior dejó tablas a medias con otra estructura, descomenta
-- este bloque una sola vez (¡BORRA DATOS!) y vuelve a ejecutar:
--
-- drop table if exists public.invoice_counters, public.invoices, public.products,
--   public.tenant_members, public.tenants cascade;
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Negocios (tenants)
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  logo          text,                       -- URL de Storage, nunca base64
  ruc           text,
  phone         text,
  address       text,
  currency      text not null default 'USD',
  tax_rate      numeric(5,4) not null default 0,
  require_login boolean not null default false,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Cajeros = Supabase Auth + pertenencia al negocio
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_members (
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'cashier')),
  email        text,
  display_name text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Por si el schema se ejecutó antes de que existiera este campo:
alter table public.tenant_members add column if not exists email text;

create index if not exists tenant_members_user_idx on public.tenant_members(user_id);

-- -----------------------------------------------------------------------------
-- 3. Productos
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  barcode    text not null,
  name       text not null,
  price      numeric(12,2) not null check (price >= 0),
  stock      integer not null default 0 check (stock >= 0),
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, barcode)
);

create index if not exists products_tenant_idx on public.products(tenant_id);

-- -----------------------------------------------------------------------------
-- 4. Facturas + contador por negocio
--    Los valores de payment coinciden con src/types.ts (PaymentMethod).
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_counters (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  next_number integer not null default 1
);

create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  number       integer not null,
  customer     text,
  cashier_name text,
  payment      text not null check (payment in ('Efectivo', 'Tarjeta', 'Transferencia')),
  lines        jsonb not null default '[]'::jsonb,
  subtotal     numeric(12,2) not null,
  tax          numeric(12,2) not null default 0,
  total        numeric(12,2) not null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, number)
);

create index if not exists invoices_tenant_idx on public.invoices(tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5. Funciones
-- -----------------------------------------------------------------------------

-- El creador del negocio queda como dueño. En el SQL Editor auth.uid() es NULL;
-- el guardia evita el error de NOT NULL.
create or replace function public.add_owner_to_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.tenant_members (tenant_id, user_id, role, display_name)
    values (new.id, auth.uid(), 'owner', coalesce(auth.jwt() ->> 'name', 'Dueño'))
    on conflict (tenant_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_add_owner on public.tenants;
create trigger tenants_add_owner
after insert on public.tenants
for each row execute function public.add_owner_to_tenant();

-- Número de factura sin duplicados aunque vendan dos cajas a la vez.
create or replace function public.next_invoice_number(p_tenant uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.invoice_counters (tenant_id, next_number)
  values (p_tenant, 1)
  on conflict (tenant_id) do nothing;

  select next_number into n
  from public.invoice_counters
  where tenant_id = p_tenant
  for update;

  update public.invoice_counters
  set next_number = n + 1
  where tenant_id = p_tenant;

  return n;
end;
$$;

-- Stock atómico: nunca queda negativo.
create or replace function public.decrement_stock(p_product uuid, p_qty integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock = stock - p_qty, updated_at = now()
  where id = p_product and stock >= p_qty;

  if not found then
    raise exception 'Stock insuficiente';
  end if;
end;
$$;

-- Venta completa en una sola transacción: numero de factura + insercion +
-- descuento de stock. Verifica pertenencia al tenant porque es security definer.
create or replace function public.record_sale(
  p_tenant uuid,
  p_lines jsonb,
  p_customer text,
  p_cashier_name text,
  p_payment text,
  p_subtotal numeric,
  p_tax numeric,
  p_total numeric
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_line jsonb;
begin
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid() and active
  ) then
    raise exception 'Sin acceso a este negocio';
  end if;

  insert into public.invoices (
    tenant_id, number, customer, cashier_name, payment,
    lines, subtotal, tax, total
  )
  values (
    p_tenant, public.next_invoice_number(p_tenant), p_customer, p_cashier_name,
    p_payment, p_lines, p_subtotal, p_tax, p_total
  )
  returning * into v_invoice;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    update public.products
    set stock = stock - (v_line->>'qty')::integer, updated_at = now()
    where id = (v_line->>'productId')::uuid
      and tenant_id = p_tenant
      and stock >= (v_line->>'qty')::integer;

    if not found then
      raise exception 'Stock insuficiente';
    end if;
  end loop;

  return v_invoice;
end;
$$;

-- Helpers RLS. security definer evita recursión sobre tenant_members.
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid() and active
$$;

create or replace function public.is_tenant_owner(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members
    where tenant_id = p_tenant
      and user_id = auth.uid()
      and role = 'owner'
      and active
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.tenant_members   enable row level security;
alter table public.products         enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_counters enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (id in (select public.current_tenant_ids()));

drop policy if exists tenants_insert on public.tenants;
create policy tenants_insert on public.tenants
  for insert to authenticated
  with check (true);

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants
  for update to authenticated
  using (id in (select public.current_tenant_ids()))
  with check (id in (select public.current_tenant_ids()));

drop policy if exists tenants_delete on public.tenants;
create policy tenants_delete on public.tenants
  for delete to authenticated
  using (public.is_tenant_owner(id));

drop policy if exists members_read on public.tenant_members;
create policy members_read on public.tenant_members
  for select to authenticated
  using (user_id = auth.uid() or tenant_id in (select public.current_tenant_ids()));

drop policy if exists members_manage on public.tenant_members;
create policy members_manage on public.tenant_members
  for all to authenticated
  using (public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_owner(tenant_id));

drop policy if exists products_tenant on public.products;
create policy products_tenant on public.products
  for all to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists invoices_tenant on public.invoices;
create policy invoices_tenant on public.invoices
  for all to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));

drop policy if exists counters_tenant on public.invoice_counters;
create policy counters_tenant on public.invoice_counters
  for all to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));

-- -----------------------------------------------------------------------------
-- 7. Permisos
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.tenants, public.tenant_members, public.products,
  public.invoices, public.invoice_counters
to authenticated;

grant execute on function
  public.current_tenant_ids(),
  public.is_tenant_owner(uuid),
  public.next_invoice_number(uuid),
  public.decrement_stock(uuid, integer),
  public.record_sale(uuid, jsonb, text, text, text, numeric, numeric, numeric)
to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Storage: fotos de productos y logos
--    Las rutas son <tenant_id>/<uuid>.<ext> dentro del bucket aurora-images.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('aurora-images', 'aurora-images', true)
on conflict (id) do nothing;

drop policy if exists aurora_images_read on storage.objects;
create policy aurora_images_read on storage.objects
  for select using (bucket_id = 'aurora-images');

drop policy if exists aurora_images_insert on storage.objects;
create policy aurora_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'aurora-images'
    and exists (
      select 1 from public.current_tenant_ids() t
      where t::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists aurora_images_update on storage.objects;
create policy aurora_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'aurora-images'
    and exists (
      select 1 from public.current_tenant_ids() t
      where t::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists aurora_images_delete on storage.objects;
create policy aurora_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'aurora-images'
    and exists (
      select 1 from public.current_tenant_ids() t
      where t::text = (storage.foldername(name))[1]
    )
  );

-- =============================================================================
-- PRUEBA RÁPIDA (opcional). Descomenta, ejecuta, y luego vuelve a comentar.
-- Crea un negocio de prueba sin depender de auth.uid().
--
-- insert into public.tenants (slug, name) values ('demo-market', 'Demo Market');
-- insert into public.products (tenant_id, barcode, name, price, stock)
-- select id, '7790000000011', 'Leche entera 1 L', 3.50, 20 from public.tenants
-- where slug = 'demo-market';
-- select t.name, p.name, p.stock from public.tenants t
-- join public.products p on p.tenant_id = t.id;
-- =============================================================================
