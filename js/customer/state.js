// حالة معالج الطلب — تُحفظ في الذاكرة فقط طوال الجلسة (ليست قاعدة بيانات)
export const state = {
  dolmaTypes: [],
  potSizes: [],
  selectedType: null,
  selectedSize: null,
  recipeData: null, // { recipe_id, pricing_mode, base_selling_price, ingredients: [] }
  selections: {},   // ingredient_id -> boolean (مضمّن أم لا)
  notes: '',
  customer: { name: '', phone: '', address: '' },
  pickup: { date: '', time: '' },
  pricePreview: null, // { sellingPrice, needsConfirmation }
  lastOrderResult: null,
};

export function resetOrderFlow() {
  state.selectedType = null;
  state.selectedSize = null;
  state.recipeData = null;
  state.selections = {};
  state.notes = '';
  state.customer = { name: '', phone: '', address: '' };
  state.pickup = { date: '', time: '' };
  state.pricePreview = null;
  state.lastOrderResult = null;
}
