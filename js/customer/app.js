import { qs, todayIsoDate, friendlyError, formatCurrency } from '../shared/utils.js';
import { state, resetOrderFlow } from './state.js';
import { loadMenuData, renderTypeChoices, renderSizeChoices } from './menu.js';
import { loadRecipeCustomization, renderCustomizeScreen } from './customize.js';
import { renderLiveSummary } from './summary.js';
import { submitOrder } from './order.js';

const typesList = qs('#types-list');
const sizesList = qs('#sizes-list');
const customizeContent = qs('#customize-content');
const notesTextarea = qs('#notes-textarea');
const summaryContent = qs('#summary-content');
const orderError = qs('#order-error');
const confirmBtn = qs('#btn-confirm-order');

function updateSummary() {
  renderLiveSummary(summaryContent);
}

function showError(message, scrollTo) {
  orderError.textContent = message;
  orderError.style.display = 'block';
  const target = scrollTo || orderError;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError() {
  orderError.style.display = 'none';
}

// -------------------- تحميل القائمة عند فتح الصفحة مباشرة --------------------
async function init() {
  qs('#input-date').min = todayIsoDate();
  try {
    await loadMenuData();
    renderTypeChoices(typesList, onSelectType);
  } catch (err) {
    typesList.innerHTML = `<div class="alert alert-danger">تعذّر تحميل القائمة: ${friendlyError(err)}</div>`;
  }
}

// -------------------- اختيار النوع --------------------
function onSelectType(type) {
  state.selectedType = type;
  state.selectedSize = null;
  state.recipeData = null;
  state.selections = {};
  clearError();

  renderSizeChoices(sizesList, onSelectSize);
  customizeContent.innerHTML = '<div class="empty-state">اختاري الحجم ليظهر لكِ المكونات</div>';
  updateSummary();

  qs('#sizes-list').closest('.step-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -------------------- اختيار الحجم --------------------
async function onSelectSize(size) {
  state.selectedSize = size;
  clearError();
  customizeContent.innerHTML = '<div class="loading-spinner"></div>';
  updateSummary();

  try {
    await loadRecipeCustomization();
    renderCustomizeScreen(customizeContent, updateSummary);
    updateSummary();
  } catch (err) {
    customizeContent.innerHTML = `<div class="alert alert-danger">تعذّر تحميل تفاصيل الوصفة: ${friendlyError(err)}</div>`;
  }

  customizeContent.closest('.step-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -------------------- الملاحظات --------------------
notesTextarea.addEventListener('input', () => {
  state.notes = notesTextarea.value;
  updateSummary();
});

// -------------------- تأكيد الحجز --------------------
confirmBtn.addEventListener('click', async () => {
  clearError();

  if (!state.selectedType) {
    showError('الرجاء اختيار نوع الدولمة أولاً.', typesList);
    return;
  }
  if (!state.selectedSize) {
    showError('الرجاء اختيار حجم الجدر.', sizesList);
    return;
  }
  if (!state.recipeData) {
    showError('الرجاء الانتظار حتى يتم تحميل المكونات.', customizeContent);
    return;
  }

  const name = qs('#input-name').value.trim();
  const phone = qs('#input-phone').value.trim();
  const address = qs('#input-address').value.trim();
  const date = qs('#input-date').value;
  const time = qs('#input-time').value;

  if (!name || !phone) {
    showError('الرجاء إدخال الاسم ورقم الهاتف.', qs('#input-name'));
    return;
  }
  if (!date || !time) {
    showError('الرجاء تحديد تاريخ ووقت الاستلام.', qs('#input-date'));
    return;
  }

  state.customer = { name, phone, address };
  state.pickup = { date, time };

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'جارِ إرسال الطلب...';

  try {
    const result = await submitOrder();
    qs('#order-number-box').textContent = result.order_number;
    qs('#success-message').textContent = result.needs_price_confirmation
      ? 'سيتم تأكيد السعر النهائي معك من قبل المطعم قريباً.'
      : `السعر النهائي: ${formatCurrency(result.selling_price)}`;
    qs('#order-view').style.display = 'none';
    qs('#success-view').style.display = 'block';
    qs('#sticky-cta').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError('تعذّر إرسال الطلب: ' + friendlyError(err));
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'تأكيد الحجز';
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
  notesTextarea.value = '';
  sizesList.innerHTML = '<div class="empty-state">اختاري نوع الدولمة أولاً 👆</div>';
  customizeContent.innerHTML = '<div class="empty-state">اختاري النوع والحجم ليظهر لكِ المكونات</div>';
  clearError();
  updateSummary();

  renderTypeChoices(typesList, onSelectType);
  qs('#success-view').style.display = 'none';
  qs('#order-view').style.display = 'block';
  qs('#sticky-cta').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

updateSummary();
init();
