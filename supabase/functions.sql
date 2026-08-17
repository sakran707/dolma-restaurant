-- =====================================================================
-- Dolma Cloud Kitchen — Functions & Triggers
-- نفّذي هذا الملف بعد rls_policies.sql مباشرة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- عند تسجيل أي مستخدم جديد في Supabase Auth (يفترض فقط صاحبة المطعم/مساعديها،
-- لا يوجد تسجيل عام للزبائن في هذا النظام) — أنشئي صفاً في profiles تلقائياً
-- بدور 'customer' الافتراضي الآمن، ثم رقّيه يدوياً إلى 'owner' عبر SQL Editor:
--   update profiles set role = 'owner' where id = 'UUID-الحساب-هنا';
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- get_recipe_customer_view — الواجهة الآمنة الوحيدة التي يستخدمها الزبون
-- لعرض مكونات وصفة معيّنة (نوع + حجم). SECURITY DEFINER لتجاوز الحظر على
-- الجداول الداخلية، لكنها تُرجع فقط الحقول الآمنة (بدون تكلفة/سعر وحدة داخلي).
-- ---------------------------------------------------------------------
create or replace function get_recipe_customer_view(
  p_dolma_type_id uuid,
  p_pot_size_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_recipe recipes%rowtype;
  v_pricing_mode pot_pricing_mode;
  v_ingredients jsonb;
begin
  select pricing_mode into v_pricing_mode
  from pot_sizes
  where id = p_pot_size_id and is_active = true;

  if v_pricing_mode is null then
    raise exception 'الحجم المطلوب غير متوفر';
  end if;

  select * into v_recipe
  from recipes
  where dolma_type_id = p_dolma_type_id
    and pot_size_id = p_pot_size_id
    and is_active = true;

  if v_recipe.id is null then
    raise exception 'الوصفة غير متوفرة لهذا النوع والحجم';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ingredient_id', ri.ingredient_id,
      'name_ar', i.name_ar,
      'is_customer_optional', ri.is_customer_optional,
      'is_customer_removable', i.is_customer_removable,
      'is_core', i.is_core,
      'is_allergen', i.is_allergen,
      'pricing_rule', ri.pricing_rule,
      'price_delta', ri.price_delta,
      'is_addon', ri.is_addon,
      'default_included', (ri.pricing_rule <> 'extra_cost_addon'),
      'display_order', ri.display_order
    )
    order by ri.display_order
  ), '[]'::jsonb)
  into v_ingredients
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = v_recipe.id
    and i.is_active = true
    and i.is_visible_to_customer = true;

  return jsonb_build_object(
    'recipe_id', v_recipe.id,
    'pricing_mode', v_pricing_mode,
    'base_selling_price', case when v_pricing_mode = 'fixed' then v_recipe.base_selling_price else null end,
    'ingredients', v_ingredients
  );
end;
$$;

revoke all on function get_recipe_customer_view(uuid, uuid) from public;
grant execute on function get_recipe_customer_view(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- create_order — الدالة الآمنة الوحيدة لإنشاء طلب. تُعيد حساب السعر والتكلفة
-- من جديد على السيرفر استناداً إلى اختيارات الزبون (لا تثق بأي سعر من المتصفح)،
-- ولا تُرجع للزبون أي بيانات تكلفة/ربح داخلية.
-- ---------------------------------------------------------------------
create or replace function create_order(
  p_dolma_type_id uuid,
  p_pot_size_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_pickup_date date,
  p_pickup_time time,
  p_customer_notes text default null,
  p_customer_address text default null,
  p_excluded_ingredient_ids uuid[] default '{}',
  p_extra_ingredient_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe recipes%rowtype;
  v_pricing_mode pot_pricing_mode;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal_cost numeric(12,2) := 0;
  v_price_adjust numeric(12,2) := 0;
  v_selling_price numeric(12,2);
  v_profit numeric(12,2);
  v_needs_confirmation boolean := false;
  r record;
  v_is_included boolean;
  v_row_cost numeric(12,2);
  v_row_delta numeric(12,2);
  v_result_ingredients jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'اسم الزبون مطلوب';
  end if;
  if coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'رقم الهاتف مطلوب';
  end if;

  select pricing_mode into v_pricing_mode
  from pot_sizes
  where id = p_pot_size_id and is_active = true;

  if v_pricing_mode is null then
    raise exception 'الحجم المطلوب غير متوفر';
  end if;

  select * into v_recipe
  from recipes
  where dolma_type_id = p_dolma_type_id
    and pot_size_id = p_pot_size_id
    and is_active = true;

  if v_recipe.id is null then
    raise exception 'الوصفة غير متوفرة لهذا النوع والحجم';
  end if;

  -- حساب التكلفة والسعر لكل مكوّن في الوصفة حسب اختيار الزبون
  for r in
    select ri.*, i.name_ar, i.unit_price, i.direct_cost, i.cost_method, i.is_allergen, i.is_customer_removable
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
    where ri.recipe_id = v_recipe.id
    order by ri.display_order
  loop
    if r.pricing_rule = 'extra_cost_addon' then
      v_is_included := r.is_customer_optional and (r.ingredient_id = any(p_extra_ingredient_ids));
    else
      v_is_included := true;
      if r.is_customer_optional and r.is_customer_removable
         and (r.ingredient_id = any(p_excluded_ingredient_ids)) then
        v_is_included := false;
      end if;
    end if;

    v_row_cost := case
      when not v_is_included then 0
      when r.cost_method = 'direct' then r.direct_cost
      else r.quantity * r.unit_price
    end;

    v_row_delta := case
      when r.pricing_rule = 'included_reduce_on_remove' and not v_is_included then -r.price_delta
      when r.pricing_rule = 'extra_cost_addon' and v_is_included then r.price_delta
      else 0
    end;

    v_subtotal_cost := v_subtotal_cost + v_row_cost;
    v_price_adjust := v_price_adjust + v_row_delta;

    v_result_ingredients := v_result_ingredients || jsonb_build_object(
      'name_ar', r.name_ar, 'is_included', v_is_included
    );
  end loop;

  v_subtotal_cost := v_subtotal_cost + coalesce(v_recipe.packaging_cost, 0) + coalesce(v_recipe.extra_cost, 0);

  if v_pricing_mode = 'custom' then
    v_selling_price := null;
    v_profit := null;
    v_needs_confirmation := true;
  else
    v_selling_price := coalesce(v_recipe.base_selling_price, 0) + v_price_adjust;
    v_profit := v_selling_price - v_subtotal_cost;
    v_needs_confirmation := false;
  end if;

  -- إنشاء/تحديث العميل حسب رقم الهاتف
  insert into customers (name, phone, address)
  values (trim(p_customer_name), trim(p_customer_phone), p_customer_address)
  on conflict (phone) do update
    set name = excluded.name,
        address = coalesce(excluded.address, customers.address)
  returning id into v_customer_id;

  v_order_number := 'DLM-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');

  insert into orders (
    order_number, customer_id, dolma_type_id, pot_size_id, recipe_id,
    subtotal_cost, selling_price, profit, needs_price_confirmation,
    customer_notes, pickup_date, pickup_time
  ) values (
    v_order_number, v_customer_id, p_dolma_type_id, p_pot_size_id, v_recipe.id,
    v_subtotal_cost, v_selling_price, v_profit, v_needs_confirmation,
    left(coalesce(p_customer_notes, ''), 1000), p_pickup_date, p_pickup_time
  ) returning id into v_order_id;

  -- إعادة إدراج سطور المكونات مرتبطة بالطلب الفعلي
  for r in
    select ri.*, i.name_ar, i.unit_price, i.direct_cost, i.cost_method, i.is_allergen, i.is_customer_removable
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
    where ri.recipe_id = v_recipe.id
    order by ri.display_order
  loop
    if r.pricing_rule = 'extra_cost_addon' then
      v_is_included := r.is_customer_optional and (r.ingredient_id = any(p_extra_ingredient_ids));
    else
      v_is_included := true;
      if r.is_customer_optional and r.is_customer_removable
         and (r.ingredient_id = any(p_excluded_ingredient_ids)) then
        v_is_included := false;
      end if;
    end if;

    v_row_cost := case
      when not v_is_included then 0
      when r.cost_method = 'direct' then r.direct_cost
      else r.quantity * r.unit_price
    end;

    v_row_delta := case
      when r.pricing_rule = 'included_reduce_on_remove' and not v_is_included then -r.price_delta
      when r.pricing_rule = 'extra_cost_addon' and v_is_included then r.price_delta
      else 0
    end;

    insert into order_selected_ingredients (
      order_id, ingredient_id, ingredient_name_snapshot, is_included,
      quantity_snapshot, unit_price_snapshot, cost_snapshot, price_delta_applied, is_allergen
    ) values (
      v_order_id, r.ingredient_id, r.name_ar, v_is_included,
      r.quantity, r.unit_price, v_row_cost, v_row_delta, r.is_allergen
    );
  end loop;

  update customers
  set total_orders = total_orders + 1,
      total_spent = total_spent + coalesce(v_selling_price, 0),
      last_order_at = now()
  where id = v_customer_id;

  return jsonb_build_object(
    'order_number', v_order_number,
    'selling_price', v_selling_price,
    'needs_price_confirmation', v_needs_confirmation,
    'pickup_date', p_pickup_date,
    'pickup_time', p_pickup_time,
    'ingredients', v_result_ingredients
  );
end;
$$;

revoke all on function create_order(uuid, uuid, text, text, date, time, text, text, uuid[], uuid[]) from public;
grant execute on function create_order(uuid, uuid, text, text, date, time, text, text, uuid[], uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- calc_ingredient_needs — تجميع احتياج المكونات لطلبات قادمة ضمن مدى تاريخ
-- SECURITY INVOKER (افتراضي): تحترم RLS تلقائياً، فقط الإدمن يرى نتائج فعلية
-- ---------------------------------------------------------------------
create or replace function calc_ingredient_needs(
  p_date_from date,
  p_date_to date
)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  total_quantity numeric
)
language sql
stable
as $$
  select
    osi.ingredient_id,
    osi.ingredient_name_snapshot,
    i.unit,
    sum(osi.quantity_snapshot) as total_quantity
  from order_selected_ingredients osi
  join orders o on o.id = osi.order_id
  join ingredients i on i.id = osi.ingredient_id
  where osi.is_included = true
    and o.status <> 'ملغي'
    and o.pickup_date between p_date_from and p_date_to
  group by osi.ingredient_id, osi.ingredient_name_snapshot, i.unit
  order by total_quantity desc;
$$;

-- ---------------------------------------------------------------------
-- get_ingredient_selection_stats — أكثر المكونات اختياراً/استبعاداً (تقارير)
-- SECURITY INVOKER: تحترم RLS تلقائياً
-- ---------------------------------------------------------------------
create or replace function get_ingredient_selection_stats(
  p_date_from date,
  p_date_to date
)
returns table (
  ingredient_name text,
  included_count bigint,
  excluded_count bigint
)
language sql
stable
as $$
  select
    osi.ingredient_name_snapshot,
    count(*) filter (where osi.is_included = true) as included_count,
    count(*) filter (where osi.is_included = false) as excluded_count
  from order_selected_ingredients osi
  join orders o on o.id = osi.order_id
  where o.created_at::date between p_date_from and p_date_to
  group by osi.ingredient_name_snapshot
  order by included_count desc;
$$;

-- ---------------------------------------------------------------------
-- v_recipe_costing — تكلفة/ربح كل وصفة (للوحة الإدارة فقط)
-- security_invoker = true يضمن احترام RLS الخاص بجداول ingredients/recipes
-- (إدمن فقط) بدل تشغيل الـ view بصلاحيات مالكها
-- ---------------------------------------------------------------------
create or replace view v_recipe_costing
with (security_invoker = true)
as
select
  r.id as recipe_id,
  r.name_ar as recipe_name,
  dt.name_ar as dolma_type_name,
  ps.name_ar as pot_size_name,
  ps.pricing_mode,
  coalesce(sum(
    case
      when ri.pricing_rule = 'extra_cost_addon' then 0
      when i.cost_method = 'direct' then i.direct_cost
      else ri.quantity * i.unit_price
    end
  ), 0) + r.packaging_cost + r.extra_cost as total_cost,
  r.base_selling_price,
  case
    when r.base_selling_price is null then null
    else r.base_selling_price - (coalesce(sum(
      case
        when ri.pricing_rule = 'extra_cost_addon' then 0
        when i.cost_method = 'direct' then i.direct_cost
        else ri.quantity * i.unit_price
      end
    ), 0) + r.packaging_cost + r.extra_cost)
  end as profit,
  case
    when r.base_selling_price is null or r.base_selling_price = 0 then null
    else round(
      (r.base_selling_price - (coalesce(sum(
        case
          when ri.pricing_rule = 'extra_cost_addon' then 0
          when i.cost_method = 'direct' then i.direct_cost
          else ri.quantity * i.unit_price
        end
      ), 0) + r.packaging_cost + r.extra_cost)) / r.base_selling_price * 100
    , 2)
  end as profit_margin_pct
from recipes r
join dolma_types dt on dt.id = r.dolma_type_id
join pot_sizes ps on ps.id = r.pot_size_id
left join recipe_ingredients ri on ri.recipe_id = r.id
left join ingredients i on i.id = ri.ingredient_id
group by r.id, r.name_ar, dt.name_ar, ps.name_ar, ps.pricing_mode, r.base_selling_price, r.packaging_cost, r.extra_cost;
