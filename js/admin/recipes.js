import { supabase } from '../supabase-client.js';
import { formatCurrency, escapeHtml, friendlyError } from '../shared/utils.js';

const PRICING_RULES = [
  { value: 'included_fixed', label: 'ضمن السعر الأساسي (حذفه لا يغيّر السعر)' },
  { value: 'included_reduce_on_remove', label: 'ضمن السعر، حذفه يُنقص السعر' },
  { value: 'extra_cost_addon', label: 'إضافة اختيارية تزيد السعر' },
];

let allIngredients = [];
let currentRecipeId = null;

export async function renderRecipesPanel(root) {
  root.innerHTML = `
    <div class="panel-title">الوصفات</div>
    <div class="toolbar">
      <select class="select-input" id="recipe-select" style="min-width:min(260px, 100%); flex:1;"></select>
    </div>
    <div id="recipe-detail"></div>
  `;

  const [{ data: recipes, error }, { data: ingredients }] = await Promise.all([
    supabase.from('recipes').select('*, dolma_types(name_ar), pot_sizes(name_ar, pricing_mode)').order('dolma_type_id'),
    supabase.from('ingredients').select('*').eq('is_active', true).order('name_ar'),
  ]);

  allIngredients = ingredients || [];

  if (error) {
    root.querySelector('#recipe-detail').innerHTML = `<div class="alert alert-danger">${friendlyError(error)}</div>`;
    return;
  }

  const select = root.querySelector('#recipe-select');
  select.innerHTML = recipes.map((r) => `<option value="${r.id}">${escapeHtml(r.dolma_types.name_ar)} — ${escapeHtml(r.pot_sizes.name_ar)}</option>`).join('');
  select.addEventListener('change', () => loadRecipeDetail(root, select.value));

  if (recipes.length) {
    currentRecipeId = recipes[0].id;
    await loadRecipeDetail(root, recipes[0].id);
  }
}

async function loadRecipeDetail(root, recipeId) {
  currentRecipeId = recipeId;
  const detail = root.querySelector('#recipe-detail');
  detail.innerHTML = '<div class="loading-spinner"></div>';

  const [{ data: recipe, error: rErr }, { data: items, error: iErr }, { data: costing }] = await Promise.all([
    supabase.from('recipes').select('*, dolma_types(name_ar), pot_sizes(name_ar, pricing_mode)').eq('id', recipeId).single(),
    supabase.from('recipe_ingredients').select('*, ingredients(name_ar)').eq('recipe_id', recipeId).order('display_order'),
    supabase.from('v_recipe_costing').select('*').eq('recipe_id', recipeId).maybeSingle(),
  ]);

  if (rErr || iErr) {
    detail.innerHTML = `<div class="alert alert-danger">${friendlyError(rErr || iErr)}</div>`;
    return;
  }

  const isCustom = recipe.pot_sizes.pricing_mode === 'custom';
  const usedIds = new Set(items.map((i) => i.ingredient_id));
  const available = allIngredients.filter((i) => !usedIds.has(i.id));

  detail.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">${escapeHtml(recipe.dolma_types.name_ar)} — ${escapeHtml(recipe.pot_sizes.name_ar)}</h3>
      <div class="admin-form-grid">
        <div class="field"><label>تكلفة التغليف</label><input type="number" step="0.01" id="rf-packaging" value="${recipe.packaging_cost}" /></div>
        <div class="field"><label>تكلفة إضافية أخرى</label><input type="number" step="0.01" id="rf-extra" value="${recipe.extra_cost}" /></div>
        <div class="field">
          <label>سعر البيع الأساسي ${isCustom ? '(حسب الطلب — يُترك فارغاً)' : ''}</label>
          <input type="number" step="0.01" id="rf-price" value="${recipe.base_selling_price ?? ''}" ${isCustom ? 'disabled placeholder="يُحدَّد لكل طلب"' : ''} />
        </div>
      </div>
      <div id="recipe-form-error" class="error-text" style="display:none;"></div>
      <button type="button" class="btn btn-primary" id="btn-save-recipe" style="margin-top:10px;">حفظ الوصفة</button>

      ${costing ? `
        <div class="stat-grid" style="margin-top:18px;">
          <div class="stat-card"><div class="stat-label">إجمالي التكلفة</div><div class="stat-value">${formatCurrency(costing.total_cost)}</div></div>
          <div class="stat-card"><div class="stat-label">الربح</div><div class="stat-value">${costing.profit !== null ? formatCurrency(costing.profit) : '—'}</div></div>
          <div class="stat-card"><div class="stat-label">هامش الربح</div><div class="stat-value">${costing.profit_margin_pct !== null ? costing.profit_margin_pct + '%' : '—'}</div></div>
        </div>
      ` : ''}
    </div>

    <div class="card">
      <h3 style="margin-top:0;">مكونات الوصفة</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>المكوّن</th><th>الكمية</th><th>قاعدة التسعير</th><th>أثر السعر</th><th>اختياري للزبون</th><th>يظهر كإضافة</th><th>الترتيب</th><th></th></tr>
          </thead>
          <tbody id="ri-tbody">
            ${items.map((it) => recipeIngredientRow(it)).join('')}
          </tbody>
        </table>
      </div>

      <div class="toolbar" style="margin-top:16px;">
        <select class="select-input" id="add-ingredient-select">
          ${available.map((i) => `<option value="${i.id}">${escapeHtml(i.name_ar)}</option>`).join('')}
        </select>
        <input type="number" step="0.001" class="mini-input" id="add-ingredient-qty" placeholder="الكمية" value="0.5" />
        <button type="button" class="btn btn-secondary" id="btn-add-ingredient">+ إضافة للوصفة</button>
      </div>
    </div>
  `;

  detail.querySelector('#btn-save-recipe').addEventListener('click', async () => {
    const payload = {
      packaging_cost: Number(detail.querySelector('#rf-packaging').value) || 0,
      extra_cost: Number(detail.querySelector('#rf-extra').value) || 0,
    };
    if (!isCustom) {
      payload.base_selling_price = Number(detail.querySelector('#rf-price').value) || 0;
    }
    const { error } = await supabase.from('recipes').update(payload).eq('id', recipeId);
    const errEl = detail.querySelector('#recipe-form-error');
    if (error) {
      errEl.textContent = friendlyError(error);
      errEl.style.display = 'block';
    } else {
      loadRecipeDetail(root, recipeId);
    }
  });

  wireRecipeIngredientRows(root, detail, recipeId);

  detail.querySelector('#btn-add-ingredient').addEventListener('click', async () => {
    const ingredientId = detail.querySelector('#add-ingredient-select').value;
    const qty = Number(detail.querySelector('#add-ingredient-qty').value) || 0;
    if (!ingredientId) return;
    const { error } = await supabase.from('recipe_ingredients').insert({
      recipe_id: recipeId, ingredient_id: ingredientId, quantity: qty,
      is_customer_optional: false, pricing_rule: 'included_fixed', price_delta: 0, is_addon: false, display_order: items.length + 1,
    });
    if (error) alert(friendlyError(error));
    else loadRecipeDetail(root, recipeId);
  });
}

function recipeIngredientRow(it) {
  return `
    <tr data-ri-row="${it.id}">
      <td data-label="المكوّن">${escapeHtml(it.ingredients.name_ar)}</td>
      <td data-label="الكمية"><input type="number" step="0.001" class="mini-input" data-field="quantity" value="${it.quantity}" /></td>
      <td data-label="قاعدة التسعير">
        <select class="select-input" data-field="pricing_rule">
          ${PRICING_RULES.map((r) => `<option value="${r.value}" ${r.value === it.pricing_rule ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </td>
      <td data-label="أثر السعر"><input type="number" step="0.01" class="mini-input" data-field="price_delta" value="${it.price_delta}" /></td>
      <td data-label="اختياري للزبون"><input type="checkbox" data-field="is_customer_optional" ${it.is_customer_optional ? 'checked' : ''} /></td>
      <td data-label="يظهر كإضافة"><input type="checkbox" data-field="is_addon" ${it.is_addon ? 'checked' : ''} /></td>
      <td data-label="الترتيب"><input type="number" class="mini-input" style="width:60px;" data-field="display_order" value="${it.display_order}" /></td>
      <td data-label="إجراءات"><button type="button" class="btn btn-secondary btn-sm" data-remove-ri="${it.id}">حذف</button></td>
    </tr>
  `;
}

function wireRecipeIngredientRows(root, detail, recipeId) {
  detail.querySelectorAll('[data-ri-row]').forEach((row) => {
    const riId = row.dataset.riRow;
    row.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', async () => {
        const field = input.dataset.field;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'number') value = Number(value) || 0;
        const { error } = await supabase.from('recipe_ingredients').update({ [field]: value }).eq('id', riId);
        if (error) alert(friendlyError(error));
        else loadRecipeDetail(root, recipeId);
      });
    });
  });

  detail.querySelectorAll('[data-remove-ri]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا المكوّن من الوصفة؟')) return;
      const { error } = await supabase.from('recipe_ingredients').delete().eq('id', btn.dataset.removeRi);
      if (error) alert(friendlyError(error));
      else loadRecipeDetail(root, recipeId);
    });
  });
}
