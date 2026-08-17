-- =====================================================================
-- Dolma Cloud Kitchen — Database Schema
-- نفّذي هذا الملف أولاً في Supabase SQL Editor (Project → SQL Editor → New query)
-- ثم rls_policies.sql ثم functions.sql ثم seed.sql (اختياري للتجربة)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------

create type order_status as enum (
  'جديد',
  'تم التأكيد',
  'قيد التحضير',
  'جاهز',
  'تم التسليم',
  'ملغي'
);

create type cost_method as enum ('quantity', 'direct');

create type pot_pricing_mode as enum ('fixed', 'custom');

-- كيف يؤثر اختيار/حذف الزبون لمكوّن معيّن على سعر البيع (منفصل عن تكلفة المكوّن الداخلية)
create type ingredient_pricing_rule as enum (
  'included_fixed',            -- ضمن السعر الأساسي، حذفه لا يغيّر السعر
  'included_reduce_on_remove',  -- حذفه يُنقص price_delta من السعر
  'extra_cost_addon'            -- إضافته تزيد price_delta على السعر
);

-- ---------------------------------------------------------------------
-- profiles — حسابات الإدارة فقط (صاحبة المطعم / مساعدين محتملين)
-- يُنشأ تلقائياً عند تسجيل أي مستخدم في auth.users (انظر functions.sql)
-- الدور الافتراضي 'customer' غير مستخدم فعلياً في هذا النظام (الزبون Guest)،
-- لكن نتركه كقيمة آمنة افتراضية؛ يجب تغييره يدوياً إلى owner/admin من لوحة Supabase
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'owner')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- dolma_types — الاعتيادية / لحم ولية / ريش غنم
-- ---------------------------------------------------------------------
create table dolma_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,               -- 'regular' | 'meat_liyah' | 'lamb_ribs'
  name_ar text not null,
  description_ar text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- pot_sizes — 2-3 أشخاص / 4-5 أشخاص / حسب الطلب
-- ---------------------------------------------------------------------
create table pot_sizes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,               -- 'size1' | 'size2' | 'custom'
  name_ar text not null,
  people_range_ar text,                    -- نص وصفي: "2-3 أشخاص"
  pricing_mode pot_pricing_mode not null default 'fixed',
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ingredients — كل المكونات القابلة للإدارة
-- ---------------------------------------------------------------------
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  unit text not null default 'كغم',        -- وحدة القياس: كغم، حبة، ...
  unit_price numeric(12,2) not null default 0,   -- سعر الوحدة (يُستخدم إذا cost_method = quantity)
  cost_method cost_method not null default 'quantity',
  direct_cost numeric(12,2) not null default 0,  -- تكلفة مباشرة (تُستخدم إذا cost_method = direct)
  is_active boolean not null default true,        -- تعطيل بدل الحذف الفعلي
  is_visible_to_customer boolean not null default true,
  is_customer_removable boolean not null default true,
  is_core boolean not null default false,          -- مكوّن أساسي لا يمكن حذفه إطلاقاً
  is_allergen boolean not null default false,       -- مثل الباقلاء — يجب تحذير الزبون
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- recipes — وصفة مستقلة لكل (نوع دولمة × حجم) = 9 وصفات
-- ---------------------------------------------------------------------
create table recipes (
  id uuid primary key default gen_random_uuid(),
  dolma_type_id uuid not null references dolma_types(id) on delete restrict,
  pot_size_id uuid not null references pot_sizes(id) on delete restrict,
  name_ar text not null,
  packaging_cost numeric(12,2) not null default 0,
  extra_cost numeric(12,2) not null default 0,      -- أي تكلفة إضافية أخرى (نقل، إلخ)
  base_selling_price numeric(12,2),                  -- NULL مسموح فقط عندما pot_size.pricing_mode = 'custom'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dolma_type_id, pot_size_id)
);

-- ---------------------------------------------------------------------
-- recipe_ingredients — مكونات كل وصفة + قواعد التسعير عند تخصيص الزبون
-- ---------------------------------------------------------------------
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity numeric(12,3) not null default 0,         -- الكمية المستخدمة في هذه الوصفة (لحساب التكلفة)
  is_customer_optional boolean not null default false, -- هل يظهر للزبون كخيار يمكن حذفه/إضافته؟
  pricing_rule ingredient_pricing_rule not null default 'included_fixed',
  price_delta numeric(12,2) not null default 0,       -- أثر الاختيار على سعر البيع (وليس التكلفة)
  is_addon boolean not null default false,             -- للعرض كـ"إضافات" في ملخص الطلب (مثل لحم/لية)
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (recipe_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- customers — سجل عملاء بسيط (بدون تسجيل دخول، يُطابق حسب رقم الهاتف)
-- ---------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  address text,
  total_orders int not null default 0,
  total_spent numeric(12,2) not null default 0,
  last_order_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- orders — رقم تسلسلي بشري + كل تفاصيل التسعير/التكلفة كـ Snapshot
-- ---------------------------------------------------------------------
create sequence order_number_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references customers(id) on delete restrict,
  dolma_type_id uuid not null references dolma_types(id) on delete restrict,
  pot_size_id uuid not null references pot_sizes(id) on delete restrict,
  recipe_id uuid not null references recipes(id) on delete restrict,
  status order_status not null default 'جديد',

  subtotal_cost numeric(12,2) not null default 0,     -- Snapshot: التكلفة الإجمالية وقت الطلب
  selling_price numeric(12,2),                          -- Snapshot: السعر النهائي (NULL إذا بانتظار تأكيد الحجم المخصص)
  profit numeric(12,2),                                 -- selling_price - subtotal_cost (NULL إذا السعر غير مؤكد)
  needs_price_confirmation boolean not null default false, -- true لحجم "حسب الطلب"

  customer_notes text,                                  -- ملاحظات الزبون (حساسية، تفضيلات...)
  admin_notes text,                                      -- ملاحظات داخلية لصاحبة المطعم

  pickup_date date,
  pickup_time time,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_status on orders(status);
create index idx_orders_pickup_date on orders(pickup_date);
create index idx_orders_customer on orders(customer_id);
create index idx_orders_created_at on orders(created_at);

-- ---------------------------------------------------------------------
-- order_selected_ingredients — تفصيل ما تم تضمينه/استبعاده لكل طلب (Snapshot كامل)
-- ---------------------------------------------------------------------
create table order_selected_ingredients (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  ingredient_name_snapshot text not null,     -- يبقى صحيحاً حتى لو تغيّر/تعطّل اسم المكوّن لاحقاً
  is_included boolean not null,               -- تم اختياره (true) أو استبعاده (false)
  quantity_snapshot numeric(12,3) not null default 0,
  unit_price_snapshot numeric(12,2) not null default 0,
  cost_snapshot numeric(12,2) not null default 0,
  price_delta_applied numeric(12,2) not null default 0,
  is_allergen boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_osi_order on order_selected_ingredients(order_id);

-- ---------------------------------------------------------------------
-- settings — إعدادات عامة (jsonb مرن)، مثل تكلفة تغليف افتراضية، معلومات المطعم
-- ---------------------------------------------------------------------
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_ingredients_updated_at before update on ingredients
  for each row execute function set_updated_at();

create trigger trg_recipes_updated_at before update on recipes
  for each row execute function set_updated_at();

create trigger trg_orders_updated_at before update on orders
  for each row execute function set_updated_at();
