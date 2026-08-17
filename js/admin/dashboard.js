import { supabase } from '../supabase-client.js';
import { formatCurrency, formatDateAr, escapeHtml, todayIsoDate } from '../shared/utils.js';

function dayBounds(dateIso) {
  const start = new Date(dateIso + 'T00:00:00');
  const end = new Date(dateIso + 'T23:59:59.999');
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function renderDashboard(root) {
  root.innerHTML = '<div class="loading-spinner"></div>';

  const today = todayIsoDate();
  const { start, end } = dayBounds(today);

  const [createdTodayRes, pickupsTodayRes, upcomingRes] = await Promise.all([
    supabase.from('orders').select('id, selling_price, subtotal_cost, profit, status').gte('created_at', start).lte('created_at', end),
    supabase.from('orders').select('id, order_number, status, selling_price, customers(name, phone), dolma_types(name_ar), pot_sizes(name_ar)').eq('pickup_date', today).order('pickup_time'),
    supabase.from('orders').select('id, order_number, status, pickup_date, pickup_time, selling_price, customers(name, phone), dolma_types(name_ar), pot_sizes(name_ar)').gt('pickup_date', today).neq('status', 'ملغي').order('pickup_date').limit(10),
  ]);

  if (createdTodayRes.error) { root.innerHTML = errBox(createdTodayRes.error); return; }
  if (pickupsTodayRes.error) { root.innerHTML = errBox(pickupsTodayRes.error); return; }
  if (upcomingRes.error) { root.innerHTML = errBox(upcomingRes.error); return; }

  const createdToday = createdTodayRes.data || [];
  const activeToday = createdToday.filter((o) => o.status !== 'ملغي');
  const sales = activeToday.reduce((s, o) => s + Number(o.selling_price || 0), 0);
  const cost = activeToday.reduce((s, o) => s + Number(o.subtotal_cost || 0), 0);
  const profit = activeToday.reduce((s, o) => s + Number(o.profit || 0), 0);

  root.innerHTML = `
    <div class="panel-title">لوحة المعلومات</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">طلبات اليوم</div><div class="stat-value">${createdToday.length}</div></div>
      <div class="stat-card"><div class="stat-label">حجوزات اليوم (استلام)</div><div class="stat-value">${(pickupsTodayRes.data || []).length}</div></div>
      <div class="stat-card"><div class="stat-label">المبيعات</div><div class="stat-value">${formatCurrency(sales)}</div></div>
      <div class="stat-card"><div class="stat-label">التكاليف</div><div class="stat-value">${formatCurrency(cost)}</div></div>
      <div class="stat-card"><div class="stat-label">الأرباح</div><div class="stat-value">${formatCurrency(profit)}</div></div>
    </div>

    <div class="panel-title" style="font-size:1.1rem;">حجوزات اليوم (${(pickupsTodayRes.data || []).length})</div>
    ${renderOrdersMiniTable(pickupsTodayRes.data || [])}

    <div class="panel-title" style="font-size:1.1rem; margin-top:26px;">الطلبات القادمة</div>
    ${renderOrdersMiniTable(upcomingRes.data || [], true)}
  `;
}

function renderOrdersMiniTable(orders, showDate = false) {
  if (!orders.length) return '<div class="empty-state">لا يوجد طلبات</div>';
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>رقم الطلب</th>
            <th>الزبون</th>
            <th>النوع</th>
            <th>الحجم</th>
            ${showDate ? '<th>تاريخ الاستلام</th>' : '<th>وقت الاستلام</th>'}
            <th>السعر</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((o) => `
            <tr>
              <td>${escapeHtml(o.order_number)}</td>
              <td>${escapeHtml(o.customers?.name || '')}<br><small>${escapeHtml(o.customers?.phone || '')}</small></td>
              <td>${escapeHtml(o.dolma_types?.name_ar || '')}</td>
              <td>${escapeHtml(o.pot_sizes?.name_ar || '')}</td>
              <td>${showDate ? formatDateAr(o.pickup_date) : (o.pickup_time || '—')}</td>
              <td>${formatCurrency(o.selling_price)}</td>
              <td><span class="status-pill status-${escapeHtml((o.status || '').replaceAll(' ', '-'))}">${escapeHtml(o.status)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function errBox(err) {
  return `<div class="alert alert-danger">تعذّر تحميل البيانات: ${escapeHtml(err.message || String(err))}</div>`;
}
