// معاينة سعر فورية في المتصفح فقط — للعرض السريع للزبون.
// السعر النهائي المعتمد يُحسب دائماً على السيرفر داخل create_order()
// (Postgres RPC)، وهذه الدالة لا تُرسل أي سعر إلى قاعدة البيانات.
import { state } from './state.js';

export function computePricePreview() {
  const recipe = state.recipeData;
  if (!recipe) return null;

  if (recipe.pricing_mode === 'custom') {
    return { sellingPrice: null, needsConfirmation: true };
  }

  let adjust = 0;
  for (const ing of recipe.ingredients) {
    const included = !!state.selections[ing.ingredient_id];
    if (ing.pricing_rule === 'included_reduce_on_remove' && !included) {
      adjust -= Number(ing.price_delta);
    } else if (ing.pricing_rule === 'extra_cost_addon' && included) {
      adjust += Number(ing.price_delta);
    }
  }

  const sellingPrice = Number(recipe.base_selling_price || 0) + adjust;
  state.pricePreview = { sellingPrice, needsConfirmation: false };
  return state.pricePreview;
}

export function getExcludedIngredientIds() {
  return state.recipeData.ingredients
    .filter((i) => i.pricing_rule !== 'extra_cost_addon' && i.is_customer_optional && i.is_customer_removable && !state.selections[i.ingredient_id])
    .map((i) => i.ingredient_id);
}

export function getExtraIngredientIds() {
  return state.recipeData.ingredients
    .filter((i) => i.pricing_rule === 'extra_cost_addon' && state.selections[i.ingredient_id])
    .map((i) => i.ingredient_id);
}
