import { supabase } from '../supabase-client.js';
import { formatCurrency, formatDateAr, escapeHtml, friendlyError } from '../shared/utils.js';

const STATUSES = ['جديد', 'تم التأكيد', 'قيد التحضير', 'جاهز', 'تم التسليم', 'ملغي'];

let currentFilter = '';

export async function renderOrdersPanel(root) {
  root.innerHTML = `
    <div class="panel-title">الطلبات</div>
    <div class="toolbar">
      <select class="select-input" id="orders-status-filter">
        <option value="">كل الحالات</option>
        ${STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-secondary" id="orders-refresh">تحديث</button>
    </div>
    <div id="orders-table-wrap"><div class="loading-spinner"></div></div>
  `;

  root.querySelector('#orders-status-filter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    loadOrders(root.querySelector('#orders-table-wrap'));
  });
  root.querySelector('#orders-refresh').addEventListener('click', () => loadOrders(root.querySelector('#orders-table-wrap')));

  await loadOrders(root.querySelector('#orders-table-wrap'));
}

async function loadOrders(container) {
  container.innerHTML = '<div class="loading-spinner"></div>';

  let query = supabase
    .from('orders')
    .select(`
      id, order_number, status, selling_price, subtotal_cost, profit, needs_price_confirmation,
      customer_notes, admin_notes, pickup_date, pickup_time, created_at,
      customers(name, phone), dolma_types(name_ar), pot_sizes(name_ar)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (currentFilter) query = query.eq('status', currentFilter);

  const { data, error } = await query;
  if (error) {
    container.innerHTML = `<div class="alert alert-danger">تعذّر تحميل الطلبات: ${friendlyError(error)}</div>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = '<div class="empty-state">لا يوجد طلبات</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>رقم الطلب</th>
            <th>الزبون</th>
            <th>النوع/الحجم</th>
            <th>الاستلام</th>
            <th>السعر</th>
            <th>التكلفة</th>
            <th>الربح</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${data.map((o) => orderRow(o)).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-toggle-details]').forEach((btn) => {
    btn.addEventListener('click', () => toggleDetails(btn.dataset.toggleDetails, container));
  });

  container.querySelectorAll('[data-status-select]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const orderId = sel.dataset.statusSelect;
      const { error: updErr } = await supabase.from('orders').update({ status: sel.value }).eq('id', orderId);
      if (updErr) alert('تعذّر تحديث الحالة: ' + friendlyError(updErr));
    });
  });
}

function orderRow(o) {
  const hasAllergyNote = o.customer_notes && /حساس/.test(o.customer_notes);
  return `
    <tr>
      <td>${escapeHtml(o.order_number)}</td>
      <td>${escapeHtml(o.customers?.name || '')}<br><small>${escapeHtml(o.customers?.phone || '')}</small></td>
      <td>${escapeHtml(o.dolma_types?.name_ar || '')}<br><small>${escapeHtml(o.pot_sizes?.name_ar || '')}</small></td>
      <td>${formatDateAr(o.pickup_date)}<br><small>${escapeHtml(o.pickup_time || '')}</small></td>
      <td>${o.needs_price_confirmation ? '<span class="badge badge-gold">بانتظار تأكيد السعر</span>' : formatCurrency(o.selling_price)}</td>
      <td>${formatCurrency(o.subtotal_cost)}</td>
      <td>${formatCurrency(o.profit)}</td>
      <td>
        <select class="select-input" data-status-select="${o.id}">
          ${STATUSES.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        <button type="button" class="btn btn-secondary" data-toggle-details="${o.id}">التفاصيل</button>
      </td>
    </tr>
    <tr class="expand-row" id="details-${o.id}" style="display:none;">
      <td colspan="9">
        ${hasAllergyNote ? '<div class="alert alert-danger" style="margin-bottom:10px;">⚠️ ملاحظة تحتوي على إشارة لحساسية — راجعيها بعناية</div>' : ''}
        <div class="detail-line"><strong>ملاحظات الزبون:</strong> ${escapeHtml(o.customer_notes || '—')}</div>
        <div id="details-body-${o.id}"></div>
      </td>
    </tr>
  `;
}

async function toggleDetails(orderId, container) {
  const row = container.querySelector(`#details-${orderId}`);
  const isHidden = row.style.display === 'none';
  row.style.display = isHidden ? 'table-row' : 'none';
  if (!isHidden) return;

  const body = container.querySelector(`#details-body-${orderId}`);
  body.innerHTML = 'جارِ التحميل...';

  const { data, error } = await supabase
    .from('order_selected_ingredients')
    .select('ingredient_name_snapshot, is_included, is_allergen, price_delta_applied')
    .eq('order_id', orderId)
    .order('ingredient_name_snapshot');

  if (error) {
    body.innerHTML = `<div class="error-text">${friendlyError(error)}</div>`;
    return;
  }

  body.innerHTML = `
    <ul class="summary-list" style="margin-top:8px;">
      ${data.map((i) => `
        <li class="${i.is_included ? 'included' : 'excluded'}">
          ${escapeHtml(i.ingredient_name_snapshot)}
          ${i.is_allergen ? '<span class="allergen-flag"> ⚠️ مسبب حساسية</span>' : ''}
          ${i.price_delta_applied ? ` (${i.price_delta_applied > 0 ? '+' : ''}${i.price_delta_applied})` : ''}
        </li>
      `).join('')}
    </ul>
  `;
}
