import { state } from './state.js';
import { formatCurrency, escapeHtml, formatDateAr } from '../shared/utils.js';
import { computePricePreview } from './pricing.js';

export function renderSummaryScreen(root) {
  const recipe = state.recipeData;
  const preview = computePricePreview();

  const isToggleable = (i) => i.is_customer_optional && i.is_customer_removable && i.pricing_rule !== 'extra_cost_addon';
  const included = recipe.ingredients.filter((i) => isToggleable(i) && state.selections[i.ingredient_id]);
  const excluded = recipe.ingredients.filter((i) => isToggleable(i) && !state.selections[i.ingredient_id]);
  const addons = recipe.ingredients.filter((i) => i.pricing_rule === 'extra_cost_addon' && state.selections[i.ingredient_id]);
  const fixedAddons = recipe.ingredients.filter((i) => i.is_addon && i.pricing_rule !== 'extra_cost_addon');

  let html = `
    <div class="card summary-block">
      <h4>نوع الدولمة والحجم</h4>
      <div style="font-weight:800; font-size:1.05rem;">${escapeHtml(state.selectedType.name_ar)}</div>
      <div style="color:var(--color-text-muted);">${escapeHtml(state.selectedSize.name_ar)} — ${escapeHtml(state.selectedSize.people_range_ar || '')}</div>
    </div>
  `;

  html += '<div class="card summary-block">';
  html += '<h4>المكوّنات</h4><ul class="summary-list">';
  html += included.map((i) => `<li class="included">${escapeHtml(i.name_ar)}</li>`).join('');
  html += excluded.map((i) => `<li class="excluded">${escapeHtml(i.name_ar)}</li>`).join('');
  html += '</ul></div>';

  if (fixedAddons.length || addons.length) {
    html += '<div class="card summary-block"><h4>الإضافات</h4><ul class="summary-list">';
    html += fixedAddons.map((i) => `<li class="included">${escapeHtml(i.name_ar)}</li>`).join('');
    html += addons.map((i) => `<li class="included">${escapeHtml(i.name_ar)} (+${formatCurrency(i.price_delta)})</li>`).join('');
    html += '</ul></div>';
  }

  if (state.notes && state.notes.trim()) {
    html += `<div class="card summary-block"><h4>الملاحظات</h4><div class="summary-notes">${escapeHtml(state.notes)}</div></div>`;
  }

  if (preview.needsConfirmation) {
    html += `
      <div class="price-box pending">
        <span class="price-label">السعر</span>
        <span class="price-value" style="font-size:1rem;">سيتم تحديده وتأكيده من المطعم</span>
      </div>
    `;
  } else {
    html += `
      <div class="price-box">
        <span class="price-label">السعر النهائي</span>
        <span class="price-value">${formatCurrency(preview.sellingPrice)}</span>
      </div>
    `;
  }

  root.innerHTML = html;
}

export function renderFinalRecap(root) {
  const preview = state.pricePreview || computePricePreview();
  root.innerHTML = `
    <div class="card summary-block">
      <h4>ملخص سريع</h4>
      <div>${escapeHtml(state.selectedType.name_ar)} — ${escapeHtml(state.selectedSize.name_ar)}</div>
      <div style="color:var(--color-text-muted); margin-top:4px;">
        الاستلام: ${state.pickup.date ? formatDateAr(state.pickup.date) : '—'} ${state.pickup.time ? 'الساعة ' + state.pickup.time : ''}
      </div>
    </div>
    ${preview.needsConfirmation
      ? '<div class="price-box pending"><span class="price-label">السعر</span><span class="price-value" style="font-size:1rem;">سيُؤكَّد من المطعم</span></div>'
      : `<div class="price-box"><span class="price-label">السعر النهائي</span><span class="price-value">${formatCurrency(preview.sellingPrice)}</span></div>`
    }
  `;
}
