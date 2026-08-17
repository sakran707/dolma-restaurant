import { supabase } from '../supabase-client.js';
import { state } from './state.js';
import { escapeHtml } from '../shared/utils.js';

export async function loadRecipeCustomization() {
  const { data, error } = await supabase.rpc('get_recipe_customer_view', {
    p_dolma_type_id: state.selectedType.id,
    p_pot_size_id: state.selectedSize.id,
  });
  if (error) throw error;

  state.recipeData = data;
  state.selections = {};
  for (const ing of data.ingredients) {
    state.selections[ing.ingredient_id] = ing.default_included;
  }
}

// ملاحظة: التبديل (toggle) يظهر فقط عندما يسمح كل من الوصفة (is_customer_optional)
// والمكوّن نفسه (is_customer_removable) بذلك معاً — هذا يطابق تماماً الشرط
// المُطبَّق داخل create_order() على السيرفر، لتفادي أي فرق بين ما يراه الزبون
// وما يُحتسب فعلياً في السعر النهائي.
function optionalToggleableIngredients() {
  return state.recipeData.ingredients.filter(
    (i) => i.is_customer_optional && i.is_customer_removable && i.pricing_rule !== 'extra_cost_addon'
  );
}

function addonIngredients() {
  return state.recipeData.ingredients.filter(
    (i) => i.is_customer_optional && i.pricing_rule === 'extra_cost_addon'
  );
}

function fixedIngredientNames() {
  return state.recipeData.ingredients
    .filter((i) => !(i.is_customer_optional && i.is_customer_removable && i.pricing_rule !== 'extra_cost_addon') && !i.is_addon && i.pricing_rule !== 'extra_cost_addon')
    .map((i) => i.name_ar);
}

export function renderCustomizeScreen(root, onToggle) {
  const toggleable = optionalToggleableIngredients();
  const addons = addonIngredients();
  const fixedNames = fixedIngredientNames();
  const hasAllergen = toggleable.some((i) => i.is_allergen);

  let html = '';

  if (hasAllergen) {
    html += `
      <div class="alert alert-warning" style="margin-bottom:16px;">
        <span>⚠️</span>
        <span>إذا لديكِ حساسية من أي مكوّن (مثل الباقلاء)، يرجى التأكد من إلغاء اختياره وذكر ذلك في ملاحظات الطلب.</span>
      </div>
    `;
  }

  html += '<div class="section-label">مكوّنات جدرِك</div>';
  html += '<div class="ingredient-grid">';
  html += toggleable.map((ing) => `
    <div class="ingredient-chip ${state.selections[ing.ingredient_id] ? 'selected' : ''}" data-id="${ing.ingredient_id}">
      ${ing.is_allergen ? '<span class="chip-allergen">⚠️</span>' : ''}
      <span class="chip-check">✓</span>
      <span class="chip-name">${escapeHtml(ing.name_ar)}</span>
    </div>
  `).join('');
  html += '</div>';

  if (fixedNames.length) {
    html += `<div class="core-note">تشمل الوصفة أيضاً: ${escapeHtml(fixedNames.join('، '))}</div>`;
  }

  if (addons.length) {
    html += '<div class="section-label">إضافات اختيارية</div>';
    html += addons.map((ing) => `
      <div class="addon-row ${state.selections[ing.ingredient_id] ? 'selected' : ''}" data-id="${ing.ingredient_id}">
        <span class="chip-name">${escapeHtml(ing.name_ar)}</span>
        <span class="addon-price">+${Number(ing.price_delta).toLocaleString('ar-IQ')} د.ع</span>
      </div>
    `).join('');
  }

  root.innerHTML = html;

  root.querySelectorAll('.ingredient-chip, .addon-row').forEach((elm) => {
    elm.addEventListener('click', () => {
      const id = elm.dataset.id;
      state.selections[id] = !state.selections[id];
      elm.classList.toggle('selected', state.selections[id]);
      if (onToggle) onToggle();
    });
  });
}
