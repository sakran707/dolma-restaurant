import { state } from './state.js';
import { formatCurrency, escapeHtml } from '../shared/utils.js';
import { computePricePreview } from './pricing.js';

// يُستدعى حياً بعد أي تغيير (اختيار نوع/حجم/مكوّن/ملاحظة) لتحديث الملخص فوراً
// بدون أي انتقال بين شاشات — كل شيء في نفس الصفحة.
export function renderLiveSummary(root) {
  if (!state.selectedType || !state.selectedSize) {
    root.innerHTML = '<div class="empty-state">اختاري نوع الدولمة والحجم ليظهر ملخص طلبك هنا</div>';
    return;
  }

  let html = `
    <div class="summary-block">
      <h4>نوع الدولمة والحجم</h4>
      <div style="font-weight:800; font-size:1.05rem;">${escapeHtml(state.selectedType.name_ar)}</div>
      <div style="color:var(--color-text-muted);">${escapeHtml(state.selectedSize.name_ar)} — ${escapeHtml(state.selectedSize.people_range_ar || '')}</div>
    </div>
  `;

  if (state.recipeData) {
    const preview = computePricePreview();
    const isToggleable = (i) => i.is_customer_optional && i.is_customer_removable && i.pricing_rule !== 'extra_cost_addon';
    const included = state.recipeData.ingredients.filter((i) => isToggleable(i) && state.selections[i.ingredient_id]);
    const excluded = state.recipeData.ingredients.filter((i) => isToggleable(i) && !state.selections[i.ingredient_id]);
    const addons = state.recipeData.ingredients.filter((i) => i.pricing_rule === 'extra_cost_addon' && state.selections[i.ingredient_id]);
    const fixedAddons = state.recipeData.ingredients.filter((i) => i.is_addon && i.pricing_rule !== 'extra_cost_addon');

    html += '<div class="summary-block"><h4>المكوّنات</h4><ul class="summary-list">';
    html += included.map((i) => `<li class="included">${escapeHtml(i.name_ar)}</li>`).join('');
    html += excluded.map((i) => `<li class="excluded">${escapeHtml(i.name_ar)}</li>`).join('');
    html += '</ul></div>';

    if (fixedAddons.length || addons.length) {
      html += '<div class="summary-block"><h4>الإضافات</h4><ul class="summary-list">';
      html += fixedAddons.map((i) => `<li class="included">${escapeHtml(i.name_ar)}</li>`).join('');
      html += addons.map((i) => `<li class="included">${escapeHtml(i.name_ar)} (+${formatCurrency(i.price_delta)})</li>`).join('');
      html += '</ul></div>';
    }

    if (state.notes && state.notes.trim()) {
      html += `<div class="summary-block"><h4>الملاحظات</h4><div class="summary-notes">${escapeHtml(state.notes)}</div></div>`;
    }

    html += preview.needsConfirmation
      ? '<div class="price-box pending"><span class="price-label">السعر</span><span class="price-value" style="font-size:1rem;">سيتم تحديده وتأكيده من المطعم</span></div>'
      : `<div class="price-box"><span class="price-label">السعر النهائي</span><span class="price-value">${formatCurrency(preview.sellingPrice)}</span></div>`;
  } else {
    html += '<div class="empty-state">جارِ تحميل المكونات...</div>';
  }

  root.innerHTML = html;
}
