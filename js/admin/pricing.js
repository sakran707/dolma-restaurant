import { supabase } from '../supabase-client.js';
import { formatCurrency, escapeHtml, friendlyError } from '../shared/utils.js';

export async function renderPricingPanel(root) {
  root.innerHTML = `
    <div class="panel-title">الأسعار والأرباح</div>
    <p class="step-subtitle">تعديل سعر البيع هنا منفصل تماماً عن تكلفة المكونات — تغيير التكلفة لا يغيّر السعر تلقائياً.</p>
    <div id="pricing-table-wrap"><div class="loading-spinner"></div></div>
  `;
  await loadPricing(root.querySelector('#pricing-table-wrap'));
}

async function loadPricing(container) {
  const { data, error } = await supabase.from('v_recipe_costing').select('*').order('dolma_type_name');
  if (error) {
    container.innerHTML = `<div class="alert alert-danger">${friendlyError(error)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>النوع</th><th>الحجم</th><th>التكلفة</th><th>سعر البيع</th><th>الربح</th><th>هامش الربح</th><th></th></tr>
        </thead>
        <tbody>
          ${data.map((r) => `
            <tr data-recipe-id="${r.recipe_id}">
              <td data-label="النوع">${escapeHtml(r.dolma_type_name)}</td>
              <td data-label="الحجم">${escapeHtml(r.pot_size_name)}</td>
              <td data-label="التكلفة">${formatCurrency(r.total_cost)}</td>
              <td data-label="سعر البيع">
                ${r.pricing_mode === 'custom'
                  ? '<span class="badge badge-gold">حسب الطلب</span>'
                  : `<input type="number" step="0.01" class="mini-input" data-price-input value="${r.base_selling_price ?? ''}" />`}
              </td>
              <td data-label="الربح">${r.profit !== null ? formatCurrency(r.profit) : '—'}</td>
              <td data-label="هامش الربح">${r.profit_margin_pct !== null ? r.profit_margin_pct + '%' : '—'}</td>
              <td data-label="إجراءات">${r.pricing_mode === 'custom' ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-save-price>حفظ</button>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-save-price]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const recipeId = row.dataset.recipeId;
      const price = Number(row.querySelector('[data-price-input]').value) || 0;
      const { error: updErr } = await supabase.from('recipes').update({ base_selling_price: price }).eq('id', recipeId);
      if (updErr) alert(friendlyError(updErr));
      else loadPricing(container);
    });
  });
}
