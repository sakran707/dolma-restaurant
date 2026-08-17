// أدوات مشتركة بين واجهة الزبون ولوحة الإدارة

export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '—';
  const n = Number(amount);
  return n.toLocaleString('ar-IQ', { maximumFractionDigits: 0 }) + ' د.ع';
}

export function formatDateAr(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function friendlyError(err) {
  if (!err) return 'حدث خطأ غير متوقع';
  return err.message || String(err);
}
