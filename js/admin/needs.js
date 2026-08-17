import { supabase } from '../supabase-client.js';
import { escapeHtml, friendlyError, todayIsoDate } from '../shared/utils.js';

function isoDaysAhead(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function renderNeedsPanel(root) {
  root.innerHTML = `
    <div class="panel-title">احتياج المكونات للطلبات القادمة</div>
    <p class="step-subtitle">تجميع كميات المكونات المطلوبة حسب تاريخ الاستلام — أساس لتخطيط المشتريات لاحقاً.</p>
    <div class="toolbar">
      <div class="field" style="margin:0;"><label>من</label><input type="date" id="needs-from" /></div>
      <div class="field" style="margin:0;"><label>إلى</label><input type="date" id="needs-to" /></div>
      <button type="button" class="btn btn-primary" id="btn-calc-needs" style="align-self:flex-end;">احسب الاحتياج</button>
    </div>
    <div id="needs-result"></div>
  `;

  const fromInput = root.querySelector('#needs-from');
  const toInput = root.querySelector('#needs-to');
  fromInput.value = todayIsoDate();
  toInput.value = isoDaysAhead(7);

  root.querySelector('#btn-calc-needs').addEventListener('click', () => loadNeeds(root, fromInput.value, toInput.value));
  await loadNeeds(root, fromInput.value, toInput.value);
}

async function loadNeeds(root, dateFrom, dateTo) {
  const result = root.querySelector('#needs-result');
  result.innerHTML = '<div class="loading-spinner"></div>';

  const { data, error } = await supabase.rpc('calc_ingredient_needs', { p_date_from: dateFrom, p_date_to: dateTo });

  if (error) {
    result.innerHTML = `<div class="alert alert-danger">${friendlyError(error)}</div>`;
    return;
  }

  if (!data.length) {
    result.innerHTML = '<div class="empty-state">لا توجد طلبات ضمن هذا المدى</div>';
    return;
  }

  result.innerHTML = `
    <div class="table-wrap" style="margin-top:14px;">
      <table class="data-table">
        <thead><tr><th>المكوّن</th><th>الكمية الإجمالية</th><th>الوحدة</th></tr></thead>
        <tbody>
          ${data.map((r) => `
            <tr>
              <td data-label="المكوّن">${escapeHtml(r.ingredient_name)}</td>
              <td data-label="الكمية الإجمالية">${Number(r.total_quantity).toLocaleString('ar-IQ')}</td>
              <td data-label="الوحدة">${escapeHtml(r.unit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
