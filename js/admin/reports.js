import { supabase } from '../supabase-client.js';
import { formatCurrency, escapeHtml, friendlyError, todayIsoDate } from '../shared/utils.js';

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function salesBetween(dateFrom, dateTo) {
  const { data, error } = await supabase
    .from('orders')
    .select('selling_price, profit, status, created_at')
    .gte('created_at', dateFrom + 'T00:00:00')
    .lte('created_at', dateTo + 'T23:59:59.999');
  if (error) throw error;
  const active = data.filter((o) => o.status !== 'ملغي');
  return {
    count: active.length,
    sales: active.reduce((s, o) => s + Number(o.selling_price || 0), 0),
    profit: active.reduce((s, o) => s + Number(o.profit || 0), 0),
  };
}

export async function renderReportsPanel(root) {
  root.innerHTML = `
    <div class="panel-title">التقارير</div>
    <div class="stat-grid" id="quick-stats"><div class="loading-spinner"></div></div>

    <div class="card" style="margin-top:10px;">
      <h3 style="margin-top:0;">تقرير مخصص</h3>
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>من</label><input type="date" id="rep-from" /></div>
        <div class="field" style="margin:0;"><label>إلى</label><input type="date" id="rep-to" /></div>
        <button type="button" class="btn btn-primary" id="btn-run-report" style="align-self:flex-end;">عرض التقرير</button>
      </div>
      <div id="custom-report-body"></div>
    </div>
  `;

  const quickWrap = root.querySelector('#quick-stats');
  try {
    const today = todayIsoDate();
    const [dayStats, weekStats, monthStats] = await Promise.all([
      salesBetween(today, today),
      salesBetween(isoDaysAgo(6), today),
      salesBetween(isoDaysAgo(29), today),
    ]);
    quickWrap.innerHTML = `
      <div class="stat-card"><div class="stat-label">مبيعات اليوم</div><div class="stat-value">${formatCurrency(dayStats.sales)}</div></div>
      <div class="stat-card"><div class="stat-label">مبيعات الأسبوع</div><div class="stat-value">${formatCurrency(weekStats.sales)}</div></div>
      <div class="stat-card"><div class="stat-label">مبيعات الشهر</div><div class="stat-value">${formatCurrency(monthStats.sales)}</div></div>
      <div class="stat-card"><div class="stat-label">أرباح الشهر</div><div class="stat-value">${formatCurrency(monthStats.profit)}</div></div>
    `;
  } catch (err) {
    quickWrap.innerHTML = `<div class="alert alert-danger">${friendlyError(err)}</div>`;
  }

  const fromInput = root.querySelector('#rep-from');
  const toInput = root.querySelector('#rep-to');
  fromInput.value = isoDaysAgo(6);
  toInput.value = todayIsoDate();

  root.querySelector('#btn-run-report').addEventListener('click', () => runCustomReport(root, fromInput.value, toInput.value));
  await runCustomReport(root, fromInput.value, toInput.value);
}

async function runCustomReport(root, dateFrom, dateTo) {
  const body = root.querySelector('#custom-report-body');
  body.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const [{ data: orders, error: ordErr }, { data: stats, error: statsErr }] = await Promise.all([
      supabase.from('orders').select('selling_price, profit, status, dolma_type_id, pot_size_id, dolma_types(name_ar), pot_sizes(name_ar)').gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59.999'),
      supabase.rpc('get_ingredient_selection_stats', { p_date_from: dateFrom, p_date_to: dateTo }),
    ]);
    if (ordErr) throw ordErr;
    if (statsErr) throw statsErr;

    const active = orders.filter((o) => o.status !== 'ملغي');
    const totalSales = active.reduce((s, o) => s + Number(o.selling_price || 0), 0);
    const totalProfit = active.reduce((s, o) => s + Number(o.profit || 0), 0);

    const byType = groupCount(active, (o) => o.dolma_types?.name_ar || '—');
    const bySize = groupCount(active, (o) => o.pot_sizes?.name_ar || '—');

    body.innerHTML = `
      <div class="stat-grid" style="margin-top:14px;">
        <div class="stat-card"><div class="stat-label">عدد الطلبات</div><div class="stat-value">${active.length}</div></div>
        <div class="stat-card"><div class="stat-label">إجمالي المبيعات</div><div class="stat-value">${formatCurrency(totalSales)}</div></div>
        <div class="stat-card"><div class="stat-label">إجمالي الأرباح</div><div class="stat-value">${formatCurrency(totalProfit)}</div></div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; margin-top:10px;">
        <div>
          <div class="section-label">أكثر مسار مبيعاً</div>
          ${renderRankList(byType)}
        </div>
        <div>
          <div class="section-label">أكثر حجم مبيعاً</div>
          ${renderRankList(bySize)}
        </div>
        <div>
          <div class="section-label">أكثر المكونات اختياراً</div>
          ${renderRankList(topN(stats, 'included_count'))}
        </div>
        <div>
          <div class="section-label">أكثر المكونات استبعاداً</div>
          ${renderRankList(topN(stats, 'excluded_count'))}
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${friendlyError(err)}</div>`;
  }
}

function groupCount(rows, keyFn) {
  const map = {};
  for (const r of rows) {
    const k = keyFn(r);
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function topN(stats, field) {
  return [...stats]
    .filter((s) => Number(s[field]) > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, 8)
    .map((s) => ({ name: s.ingredient_name, count: s[field] }));
}

function renderRankList(rows) {
  if (!rows.length) return '<div class="empty-state">لا يوجد بيانات كافية</div>';
  return `<ul class="summary-list">${rows.map((r) => `<li>${escapeHtml(r.name)} <strong>(${r.count})</strong></li>`).join('')}</ul>`;
}
