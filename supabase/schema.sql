-- =============================================================================
-- Mercadito ROMO — esquema PostgreSQL para Supabase
-- Ejecutar EN SUPABASE → SQL Editor → New query → pegar todo → Run.
-- Es IDEMPOTENTE: puedes ejecutarlo varias veces sin errores de "ya existe".
-- El orden importa: tenants se crea antes de las tablas que lo referencian.
--
-- Si una prueba anterior dejó tablas a medias con otra estructura, descomenta
-- este bloque una sola vez (¡BORRA DATOS!) y vuelve a ejecutar:
--
-- drop table if exists public.stock_losses, public.invoice_counters, public.invoices,
--   public.products, public.tenant_members, public.tenants cascade;
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Negocios (tenants)
--    paid_until = fecha hasta la que puede vender. null = sin vencimiento.
--    blocked = bloqueo manual del dueño del software.
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
  paid_until    timestamptz,
  blocked       boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.tenants add column if not exists paid_until timestamptz;
alter table public.tenants add column if not exists blocked boolean not null default false;

-- -----------------------------------------------------------------------------
-- 2. Dueño del software (super-admin). Solo estos correos ven todos los negocios.
-- -----------------------------------------------------------------------------
create table if not exists public.super_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

insert into public.super_admins (email)
values ('stivrios415@gmail.com')
on conflict (email) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Cajeros = Supabase Auth + pertenencia al negocio
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

alter table public.tenant_members add column if not exists email text;

create index if not exists tenant_members_user_idx on public.tenant_members(user_id);

-- -----------------------------------------------------------------------------
-- 4. Productos. cost = costo unitario de compra para análisis de inversión.
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  barcode    text not null,
  name       text not null,
  price      numeric(12,2) not null check (price >= 0),
  cost       numeric(12,2) not null default 0 check (cost >= 0),
  stock      integer not null default 0 check (stock >= 0),
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, barcode)
);

alter table public.products add column if not exists cost numeric(12,2) not null default 0;

create index if not exists products_tenant_idx on public.products(tenant_id);

-- -----------------------------------------------------------------------------
-- 5. Mermas / pérdidas de stock (daño, vencimiento, robo, otro).
--    No lleva FK a products para conservar el historial si se borra un producto.
-- -----------------------------------------------------------------------------
create table if not exists public.stock_losses (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  product_id   uuid not null,
  product_name text not null,
  qty          integer not null check (qty > 0),
  cost         numeric(12,2) not null default 0 check (cost >= 0),
  reason       text not null default 'Otro',
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists stock_losses_tenant_idx on public.stock_losses(tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 6. Facturas + contador por negocio
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
-- 7. Funciones base
-- -----------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.super_admins s
    where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Un negocio activo: no bloqueado y con vencimiento en el futuro (o sin vencimiento).
create or replace function public.tenant_is_active(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants t
    where t.id = p_tenant
      and not coalesce(t.blocked, false)
      and (t.paid_until is null or t.paid_until >= now())
  );
$$;

-- El creador del negocio queda como dueño. En el SQL Editor auth.uid() es NULL;
-- el guardia evita el error de NOT NULL. Cada usuario normal solo puede tener
-- un negocio; el super-admin puede crear varios para dar soporte.
create or replace function public.add_owner_to_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not public.is_super_admin() and exists (
      select 1 from public.tenant_members m
      where m.user_id = auth.uid() and m.role = 'owner'
    ) then
      raise exception 'Este usuario ya tiene un negocio';
    end if;

    insert into public.tenant_members (tenant_id, user_id, role, display_name, email)
    values (
      new.id,
      auth.uid(),
      'owner',
      coalesce(auth.jwt() ->> 'name', 'Dueño'),
      auth.jwt() ->> 'email'
    )
    on conflict (tenant_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_add_owner on public.tenants;
create trigger tenants_add_owner
after insert on public.tenants
for each row execute function public.add_owner_to_tenant();

-- Solo el super-admin puede cambiar estado de pago o bloqueo.
create or replace function public.guard_tenant_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() and (
    new.blocked is distinct from old.blocked or
    new.paid_until is distinct from old.paid_until
  ) then
    raise exception 'Solo el administrador del software puede cambiar el estado de pago';
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_guard_billing on public.tenants;
create trigger tenants_guard_billing
before update on public.tenants
for each row execute function public.guard_tenant_billing();

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
-- descuento de stock. Verifica pertenencia y que el negocio pueda vender.
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

  if not public.tenant_is_active(p_tenant) then
    raise exception 'Ventas bloqueadas: el negocio está vencido o fue bloqueado';
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

-- Merma: descuenta stock y guarda el costo congelado del producto.
create or replace function public.record_stock_loss(
  p_tenant uuid,
  p_product uuid,
  p_qty integer,
  p_reason text,
  p_note text
)
returns public.stock_losses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_loss public.stock_losses;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if not exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid() and active
  ) then
    raise exception 'Sin acceso a este negocio';
  end if;

  select * into v_product from public.products
  where id = p_product and tenant_id = p_tenant;

  if not found then
    raise exception 'Producto no encontrado';
  end if;
  if v_product.stock < p_qty then
    raise exception 'No hay tanto stock disponible';
  end if;

  update public.products
  set stock = stock - p_qty, updated_at = now()
  where id = p_product;

  insert into public.stock_losses (tenant_id, product_id, product_name, qty, cost, reason, note)
  values (p_tenant, p_product, v_product.name, p_qty, v_product.cost, coalesce(p_reason, 'Otro'), p_note)
  returning * into v_loss;

  return v_loss;
end;
$$;

-- Helpers RLS. security definer evita recursión sobre tenant_members.
-- El super-admin ve todos los negocios; los demás solo los suyos activos.
create or replace function public.current_tenant_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return query select id from public.tenants;
  else
    return query
      select m.tenant_id
      from public.tenant_members m
      where m.user_id = auth.uid() and m.active;
  end if;
end;
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

-- Resumen para el panel del dueño del software.
create or replace function public.admin_list_tenants()
returns table (
  id            uuid,
  slug          text,
  name          text,
  currency      text,
  owner_email   text,
  paid_until    timestamptz,
  blocked       boolean,
  products_count bigint,
  invoices_count bigint,
  total_sales   numeric,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    t.id,
    t.slug,
    t.name,
    t.currency,
    (select m.email from public.tenant_members m
      where m.tenant_id = t.id and m.role = 'owner' limit 1),
    t.paid_until,
    coalesce(t.blocked, false),
    (select count(*) from public.products p where p.tenant_id = t.id),
    (select count(*) from public.invoices i where i.tenant_id = t.id),
    coalesce((select sum(i.total) from public.invoices i where i.tenant_id = t.id), 0),
    t.created_at
  from public.tenants t
  order by t.created_at desc;
end;
$$;

create or replace function public.admin_set_billing(
  p_tenant uuid,
  p_paid_until timestamptz,
  p_blocked boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  update public.tenants
  set paid_until = p_paid_until,
      blocked = coalesce(p_blocked, false)
  where id = p_tenant;

  if not found then
    raise exception 'Negocio no encontrado';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.super_admins     enable row level security;
alter table public.tenant_members   enable row level security;
alter table public.products         enable row level security;
alter table public.stock_losses     enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_counters enable row level security;

-- Borra TODAS las políticas anteriores de estas tablas. Si en una ejecución
-- vieja quedó una política "for all" con using(current_tenant_ids()), el INSERT
-- de un negocio nuevo falla con 403: todavía no existe membresía que la permita.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'tenants', 'super_admins', 'tenant_members', 'products',
        'stock_losses', 'invoices', 'invoice_counters'
      )
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Los dueños ven sus negocios; el super-admin los ve todos (current_tenant_ids).
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
  using (id in (select public.current_tenant_ids()) or public.is_super_admin())
  with check (id in (select public.current_tenant_ids()) or public.is_super_admin());

drop policy if exists tenants_delete on public.tenants;
create policy tenants_delete on public.tenants
  for delete to authenticated
  using (public.is_tenant_owner(id) or public.is_super_admin());

drop policy if exists members_read on public.tenant_members;
create policy members_read on public.tenant_members
  for select to authenticated
  using (user_id = auth.uid() or tenant_id in (select public.current_tenant_ids()));

drop policy if exists members_manage on public.tenant_members;
create policy members_manage on public.tenant_members
  for all to authenticated
  using (public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_owner(tenant_id));

-- Lectura siempre disponible; escritura solo si el negocio está al día.
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  );

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  )
  with check (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  );

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated
  using (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  );

drop policy if exists stock_losses_select on public.stock_losses;
create policy stock_losses_select on public.stock_losses
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (tenant_id in (select public.current_tenant_ids()));

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update to authenticated
  using (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  )
  with check (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  );

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete to authenticated
  using (
    tenant_id in (select public.current_tenant_ids())
    and (public.tenant_is_active(tenant_id) or public.is_super_admin())
  );

drop policy if exists counters_tenant on public.invoice_counters;
create policy counters_tenant on public.invoice_counters
  for all to authenticated
  using (tenant_id in (select public.current_tenant_ids()))
  with check (tenant_id in (select public.current_tenant_ids()));

-- -----------------------------------------------------------------------------
-- 9. Permisos
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.tenants, public.tenant_members, public.products,
  public.invoices, public.invoice_counters
to authenticated;
grant select on public.stock_losses to authenticated;
-- super_admins solo se consulta desde funciones security definer.

grant execute on function
  public.current_tenant_ids(),
  public.is_super_admin(),
  public.tenant_is_active(uuid),
  public.is_tenant_owner(uuid),
  public.next_invoice_number(uuid),
  public.decrement_stock(uuid, integer),
  public.record_sale(uuid, jsonb, text, text, text, numeric, numeric, numeric),
  public.record_stock_loss(uuid, uuid, integer, text, text),
  public.admin_list_tenants(),
  public.admin_set_billing(uuid, timestamptz, boolean)
to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Storage: fotos de productos y logos
--     Las rutas son <tenant_id>/<uuid>.<ext> dentro del bucket aurora-images.
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
-- insert into public.products (tenant_id, barcode, name, price, cost, stock)
-- select id, '7790000000011', 'Leche entera 1 L', 3.50, 2.40, 20 from public.tenants
-- where slug = 'demo-market';
-- =============================================================================
