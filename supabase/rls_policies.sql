-- =====================================================================
-- Dolma Cloud Kitchen — Row Level Security
-- نفّذي هذا الملف بعد schema.sql مباشرة.
-- المبدأ: الزبون (anon) لا يرى القائمة العامة فقط (الأنواع/الأحجام النشطة)،
-- ولا يصل إطلاقاً إلى المكونات/الوصفات/الطلبات/العملاء مباشرة —
-- كل تفاعله مع القائمة والطلب يمر عبر دوال RPC آمنة (انظر functions.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- is_admin() — SECURITY DEFINER لتجنّب أي تكرار في تقييم سياسات جدول profiles
-- ---------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- تفعيل RLS على كل الجداول
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
alter table dolma_types enable row level security;
alter table pot_sizes enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_selected_ingredients enable row level security;
alter table settings enable row level security;

-- ---------------------------------------------------------------------
-- profiles: كل مستخدم يرى/يعدّل صف نفسه فقط، والإدمن يرى/يعدّل الكل
-- ---------------------------------------------------------------------
create policy "profiles_select_own_or_admin"
  on profiles for select
  to authenticated
  using (id = auth.uid() or is_admin());

create policy "profiles_update_own_or_admin"
  on profiles for update
  to authenticated
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------
-- dolma_types / pot_sizes: قراءة عامة للنشط فقط، إدارة كاملة للإدمن
-- ---------------------------------------------------------------------
create policy "dolma_types_public_read_active"
  on dolma_types for select
  to anon, authenticated
  using (is_active = true or is_admin());

create policy "dolma_types_admin_write"
  on dolma_types for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "pot_sizes_public_read_active"
  on pot_sizes for select
  to anon, authenticated
  using (is_active = true or is_admin());

create policy "pot_sizes_admin_write"
  on pot_sizes for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------
-- ingredients / recipes / recipe_ingredients: إدمن فقط — بدون أي وصول anon
-- (الزبون يصل لبيانات المكونات الآمنة فقط عبر get_recipe_customer_view في functions.sql)
-- ---------------------------------------------------------------------
create policy "ingredients_admin_only"
  on ingredients for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "recipes_admin_only"
  on recipes for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "recipe_ingredients_admin_only"
  on recipe_ingredients for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------
-- customers / orders / order_selected_ingredients: إدمن فقط
-- (إنشاء الطلبات من الزبون يتم فقط عبر دالة create_order الآمنة SECURITY DEFINER
-- والتي تتجاوز RLS بشكل متحكم به ومحدود، وليس بمنح anon صلاحية INSERT مباشرة)
-- ---------------------------------------------------------------------
create policy "customers_admin_only"
  on customers for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "orders_admin_only"
  on orders for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "order_selected_ingredients_admin_only"
  on order_selected_ingredients for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------
-- settings: إدمن فقط
-- ---------------------------------------------------------------------
create policy "settings_admin_only"
  on settings for all
  to authenticated
  using (is_admin())
  with check (is_admin());
