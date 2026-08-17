import { qs, todayIsoDate, friendlyError, formatCurrency } from '../shared/utils.js';
import { state, resetOrderFlow } from './state.js';
import { loadMenuData, renderTypeChoices, renderSizeChoices } from './menu.js';
import { loadRecipeCustomization, renderCustomizeScreen } from './customize.js';
import { renderSummaryScreen, renderFinalRecap } from './summary.js';
import { submitOrder } from './order.js';

const historyStack = ['home'];

function showScreen(name, { push = true } = {}) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.querySelector(`[data-screen="${name}"]`);
  if (target) target.classList.add('active');
  if (push) historyStack.push(name);
  window.scrollTo(0, 0);
}

function goBack() {
  if (historyStack.length <= 1) return;
  historyStack.pop();
  const prev = historyStack[historyStack.length - 1] || 'home';
  showScreen(prev, { push: false });
}

document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', goBack));

// -------------------- الرئيسية → الأنواع --------------------
qs('#btn-start-order').addEventListener('click', async () => {
  const listEl = qs('#types-list');
  showScreen('types');
  try {
    if (!state.dolmaTypes.length) {
      listEl.innerHTML = '<div class="loading-spinner"></div>';
      await loadMenuData();
    }
    renderTypeChoices(listEl, onSelectType);
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-danger">تعذّر تحميل القائمة: ${friendlyError(err)}</div>`;
  }
});

function onSelectType(type) {
  state.selectedType = type;
  renderSizeChoices(qs('#sizes-list'), onSelectSize);
  showScreen('sizes');
}

// -------------------- الحجم → التخصيص --------------------
async function onSelectSize(size) {
  state.selectedSize = size;
  const content = qs('#customize-content');
  content.innerHTML = '<div class="loading-spinner"></div>';
  showScreen('customize');
  try {
    await loadRecipeCustomization();
    renderCustomizeScreen(content, null);
  } catch (err) {
    content.innerHTML = `<div class="alert alert-danger">تعذّر تحميل تفاصيل الوصفة: ${friendlyError(err)}</div>`;
  }
}

qs('#btn-customize-next').addEventListener('click', () => {
  qs('#notes-textarea').value = state.notes;
  showScreen('notes');
});

// -------------------- الملاحظات → الملخص --------------------
qs('#btn-notes-next').addEventListener('click', () => {
  state.notes = qs('#notes-textarea').value;
  renderSummaryScreen(qs('#summary-content'));
  showScreen('summary');
});

// -------------------- الملخص → معلومات العميل --------------------
qs('#btn-summary-next').addEventListener('click', () => {
  showScreen('customerInfo');
});

// -------------------- معلومات العميل → الاستلام --------------------
qs('#btn-customerinfo-next').addEventListener('click', () => {
  const name = qs('#input-name').value.trim();
  const phone = qs('#input-phone').value.trim();
  const address = qs('#input-address').value.trim();
  const errorEl = qs('#customer-info-error');

  if (!name || !phone) {
    errorEl.textContent = 'الرجاء إدخال الاسم ورقم الهاتف.';
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';

  state.customer = { name, phone, address };

  const dateInput = qs('#input-date');
  if (!dateInput.min) dateInput.min = todayIsoDate();
  if (!dateInput.value) dateInput.value = todayIsoDate();

  renderFinalRecap(qs('#final-recap'));
  showScreen('pickup');
});

qs('#input-date').addEventListener('change', () => renderFinalRecap(qs('#final-recap')));
qs('#input-time').addEventListener('change', () => renderFinalRecap(qs('#final-recap')));

// -------------------- تأكيد الحجز --------------------
qs('#btn-confirm-order').addEventListener('click', async () => {
  const date = qs('#input-date').value;
  const time = qs('#input-time').value;
  const errorEl = qs('#pickup-error');
  const btn = qs('#btn-confirm-order');

  if (!date || !time) {
    errorEl.textContent = 'الرجاء تحديد تاريخ ووقت الاستلام.';
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';
  state.pickup = { date, time };

  btn.disabled = true;
  btn.textContent = 'جارِ إرسال الطلب...';

  try {
    const result = await submitOrder();
    qs('#order-number-box').textContent = result.order_number;
    qs('#success-message').textContent = result.needs_price_confirmation
      ? 'سيتم تأكيد السعر النهائي معك من قبل المطعم قريباً.'
      : `السعر النهائي: ${formatCurrency(result.selling_price)}`;
    showScreen('success');
  } catch (err) {
    errorEl.textContent = 'تعذّر إرسال الطلب: ' + friendlyError(err);
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد الحجز';
  }
});

// -------------------- طلب جديد --------------------
qs('#btn-new-order').addEventListener('click', () => {
  resetOrderFlow();
  qs('#input-name').value = '';
  qs('#input-phone').value = '';
  qs('#input-address').value = '';
  qs('#input-date').value = '';
  qs('#input-time').value = '';
  qs('#notes-textarea').value = '';
  historyStack.length = 0;
  historyStack.push('home');
  showScreen('home', { push: false });
});
