import { supabase } from '../supabase-client.js';
import { formatCurrency, formatDateAr, escapeHtml, friendlyError } from '../shared/utils.js';

export async function renderCustomersPanel(root) {
  root.innerHTML = `
    <div class="panel-title">العملاء</div>
    <div id="customers-table-wrap"><div class="loading-spinner"></div></div>
  `;

  const container = root.querySelector('#customers-table-wrap');
  const { data, error } = await supabase.from('customers').select('*').order('last_order_at', { ascending: false, nullsFirst: false });

  if (error) {
    container.innerHTML = `<div class="alert alert-danger">${friendlyError(error)}</div>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = '<div class="empty-state">لا يوجد عملاء بعد</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>الاسم</th><th>الهاتف</th><th>عدد الطلبات</th><th>آخر طلب</th><th>إجمالي المشتريات</th><th></th></tr>
        </thead>
        <tbody>
          ${data.map((c) => `
            <tr>
              <td data-label="الاسم">${escapeHtml(c.name)}</td>
              <td data-label="الهاتف">${escapeHtml(c.phone)}</td>
              <td data-label="عدد الطلبات">${c.total_orders}</td>
              <td data-label="آخر طلب">${c.last_order_at ? formatDateAr(c.last_order_at.slice(0, 10)) : '—'}</td>
              <td data-label="إجمالي المشتريات">${formatCurrency(c.total_spent)}</td>
              <td data-label="إجراءات"><button type="button" class="btn btn-secondary btn-sm" data-view-customer="${c.id}">سجل الطلبات</button></td>
            </tr>
            <tr class="expand-row" id="cust-orders-${c.id}" style="display:none;"><td colspan="6"></td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-view-customer]').forEach((btn) => {
    btn.addEventListener('click', () => toggleCustomerOrders(btn.dataset.viewCustomer, container));
  });
}

async function toggleCustomerOrders(customerId, container) {
  const row = container.querySelector(`#cust-orders-${customerId}`);
  const isHidden = row.style.display === 'none';
  row.style.display = isHidden ? 'table-row' : 'none';
  if (!isHidden) return;

  const cell = row.querySelector('td');
  cell.innerHTML = 'جارِ التحميل...';

  const { data, error } = await supabase
    .from('orders')
    .select('order_number, status, selling_price, pickup_date, created_at, dolma_types(name_ar), pot_sizes(name_ar)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    cell.innerHTML = `<div class="error-text">${friendlyError(error)}</div>`;
    return;
  }

  cell.innerHTML = `
    <ul class="summary-list">
      ${data.map((o) => `
        <li>
          ${escapeHtml(o.order_number)} — ${escapeHtml(o.dolma_types?.name_ar || '')} / ${escapeHtml(o.pot_sizes?.name_ar || '')}
          — ${formatCurrency(o.selling_price)} — <span class="status-pill status-${escapeHtml((o.status || '').replaceAll(' ', '-'))}">${escapeHtml(o.status)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}
