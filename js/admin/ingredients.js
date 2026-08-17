import { supabase } from '../supabase-client.js';
import { formatCurrency, escapeHtml, friendlyError } from '../shared/utils.js';

export async function renderIngredientsPanel(root) {
  root.innerHTML = `
    <div class="panel-title">المكونات</div>
    <div class="toolbar">
      <button type="button" class="btn btn-primary" id="btn-new-ingredient">+ إضافة مكوّن</button>
    </div>
    <div id="ingredient-form-wrap"></div>
    <div id="ingredients-table-wrap"><div class="loading-spinner"></div></div>
  `;

  root.querySelector('#btn-new-ingredient').addEventListener('click', () => {
    showForm(root.querySelector('#ingredient-form-wrap'), null, () => loadIngredients(root));
  });

  await loadIngredients(root);
}

async function loadIngredients(root) {
  const container = root.querySelector('#ingredients-table-wrap');
  const { data, error } = await supabase.from('ingredients').select('*').order('name_ar');

  if (error) {
    container.innerHTML = `<div class="alert alert-danger">تعذّر تحميل المكونات: ${friendlyError(error)}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>الاسم</th><th>الوحدة</th><th>سعر الوحدة</th><th>طريقة الحساب</th>
            <th>تكلفة مباشرة</th><th>حساسية</th><th>مرئي للزبون</th><th>قابل للحذف</th><th>نشط</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${data.map((i) => `
            <tr>
              <td>${escapeHtml(i.name_ar)}</td>
              <td>${escapeHtml(i.unit)}</td>
              <td>${formatCurrency(i.unit_price)}</td>
              <td>${i.cost_method === 'direct' ? 'مباشرة' : 'كمية × سعر'}</td>
              <td>${i.cost_method === 'direct' ? formatCurrency(i.direct_cost) : '—'}</td>
              <td>${i.is_allergen ? '<span class="allergen-flag">⚠️ نعم</span>' : 'لا'}</td>
              <td>${i.is_visible_to_customer ? 'نعم' : 'لا'}</td>
              <td>${i.is_customer_removable ? 'نعم' : 'لا'}</td>
              <td>${i.is_active ? '✅' : '❌'}</td>
              <td>
                <button type="button" class="btn btn-secondary" data-edit="${i.id}">تعديل</button>
                <button type="button" class="btn btn-secondary" data-toggle-active="${i.id}">${i.is_active ? 'تعطيل' : 'تفعيل'}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ing = data.find((x) => x.id === btn.dataset.edit);
      showForm(root.querySelector('#ingredient-form-wrap'), ing, () => loadIngredients(root));
    });
  });

  container.querySelectorAll('[data-toggle-active]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ing = data.find((x) => x.id === btn.dataset.toggleActive);
      const { error: updErr } = await supabase.from('ingredients').update({ is_active: !ing.is_active }).eq('id', ing.id);
      if (updErr) alert(friendlyError(updErr));
      else loadIngredients(root);
    });
  });
}

function showForm(wrap, ingredient, onSaved) {
  const isEdit = !!ingredient;
  const v = ingredient || {
    name_ar: '', unit: 'كغم', unit_price: 0, cost_method: 'quantity', direct_cost: 0,
    is_active: true, is_visible_to_customer: true, is_customer_removable: true,
    is_core: false, is_allergen: false, notes: '',
  };

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;">${isEdit ? 'تعديل مكوّن' : 'إضافة مكوّن جديد'}</h3>
      <div class="admin-form-grid">
        <div class="field"><label>الاسم</label><input type="text" id="f-name" value="${escapeHtml(v.name_ar)}" /></div>
        <div class="field"><label>الوحدة</label><input type="text" id="f-unit" value="${escapeHtml(v.unit)}" /></div>
        <div class="field"><label>طريقة الحساب</label>
          <select class="select-input" id="f-method">
            <option value="quantity" ${v.cost_method === 'quantity' ? 'selected' : ''}>الكمية × سعر الوحدة</option>
            <option value="direct" ${v.cost_method === 'direct' ? 'selected' : ''}>سعر مباشر</option>
          </select>
        </div>
        <div class="field"><label>سعر الوحدة</label><input type="number" step="0.01" id="f-unit-price" value="${v.unit_price}" /></div>
        <div class="field"><label>التكلفة المباشرة</label><input type="number" step="0.01" id="f-direct-cost" value="${v.direct_cost}" /></div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:16px; margin:10px 0;">
        <label class="pill-toggle"><input type="checkbox" id="f-visible" ${v.is_visible_to_customer ? 'checked' : ''}/> مرئي للزبون</label>
        <label class="pill-toggle"><input type="checkbox" id="f-removable" ${v.is_customer_removable ? 'checked' : ''}/> يمكن للزبون حذفه</label>
        <label class="pill-toggle"><input type="checkbox" id="f-core" ${v.is_core ? 'checked' : ''}/> مكوّن أساسي</label>
        <label class="pill-toggle"><input type="checkbox" id="f-allergen" ${v.is_allergen ? 'checked' : ''}/> ⚠️ مسبب حساسية</label>
      </div>
      <div class="field"><label>ملاحظات</label><textarea id="f-notes">${escapeHtml(v.notes || '')}</textarea></div>
      <div id="form-error" class="error-text" style="display:none;"></div>
      <div style="display:flex; gap:10px;">
        <button type="button" class="btn btn-primary" id="btn-save-ingredient">حفظ</button>
        <button type="button" class="btn btn-secondary" id="btn-cancel-ingredient">إلغاء</button>
      </div>
    </div>
  `;

  wrap.querySelector('#btn-cancel-ingredient').addEventListener('click', () => { wrap.innerHTML = ''; });

  wrap.querySelector('#btn-save-ingredient').addEventListener('click', async () => {
    const payload = {
      name_ar: wrap.querySelector('#f-name').value.trim(),
      unit: wrap.querySelector('#f-unit').value.trim(),
      cost_method: wrap.querySelector('#f-method').value,
      unit_price: Number(wrap.querySelector('#f-unit-price').value) || 0,
      direct_cost: Number(wrap.querySelector('#f-direct-cost').value) || 0,
      is_visible_to_customer: wrap.querySelector('#f-visible').checked,
      is_customer_removable: wrap.querySelector('#f-removable').checked,
      is_core: wrap.querySelector('#f-core').checked,
      is_allergen: wrap.querySelector('#f-allergen').checked,
      notes: wrap.querySelector('#f-notes').value.trim(),
    };

    if (!payload.name_ar) {
      const err = wrap.querySelector('#form-error');
      err.textContent = 'اسم المكوّن مطلوب';
      err.style.display = 'block';
      return;
    }

    const query = isEdit
      ? supabase.from('ingredients').update(payload).eq('id', ingredient.id)
      : supabase.from('ingredients').insert(payload);

    const { error } = await query;
    if (error) {
      const err = wrap.querySelector('#form-error');
      err.textContent = friendlyError(error);
      err.style.display = 'block';
      return;
    }

    wrap.innerHTML = '';
    onSaved();
  });
}
