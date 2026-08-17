import { supabase } from '../supabase-client.js';
import { state } from './state.js';
import { getExcludedIngredientIds, getExtraIngredientIds } from './pricing.js';

export async function submitOrder() {
  const { data, error } = await supabase.rpc('create_order', {
    p_dolma_type_id: state.selectedType.id,
    p_pot_size_id: state.selectedSize.id,
    p_customer_name: state.customer.name.trim(),
    p_customer_phone: state.customer.phone.trim(),
    p_pickup_date: state.pickup.date,
    p_pickup_time: state.pickup.time,
    p_customer_notes: state.notes.trim() || null,
    p_customer_address: state.customer.address.trim() || null,
    p_excluded_ingredient_ids: getExcludedIngredientIds(),
    p_extra_ingredient_ids: getExtraIngredientIds(),
  });

  if (error) throw error;

  state.lastOrderResult = data;
  return data;
}
