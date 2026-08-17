import { supabase } from '../supabase-client.js';
import { state } from './state.js';
import { escapeHtml } from '../shared/utils.js';

const TYPE_ICONS = { regular: '🍃', meat_liyah: '🥩', lamb_ribs: '🍖' };
const SIZE_ICONS = { size1: '🍲', size2: '🍛', custom: '📝' };

export async function loadMenuData() {
  const [typesRes, sizesRes] = await Promise.all([
    supabase.from('dolma_types').select('*').eq('is_active', true).order('display_order'),
    supabase.from('pot_sizes').select('*').eq('is_active', true).order('display_order'),
  ]);

  if (typesRes.error) throw typesRes.error;
  if (sizesRes.error) throw sizesRes.error;

  state.dolmaTypes = typesRes.data || [];
  state.potSizes = sizesRes.data || [];
}

export function renderTypeChoices(container, onSelect) {
  if (!state.dolmaTypes.length) {
    container.innerHTML = '<div class="empty-state">لا تتوفر أنواع دولمة حالياً، حاولي لاحقاً.</div>';
    return;
  }

  container.innerHTML = state.dolmaTypes.map((t) => `
    <button type="button" class="choice-card" data-id="${t.id}">
      <span class="choice-icon">${TYPE_ICONS[t.key] || '🍽️'}</span>
      <span class="choice-body">
        <h3>${escapeHtml(t.name_ar)}</h3>
        <p>${escapeHtml(t.description_ar || '')}</p>
      </span>
      <span class="choice-arrow">‹</span>
    </button>
  `).join('');

  container.querySelectorAll('.choice-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = state.dolmaTypes.find((t) => t.id === btn.dataset.id);
      onSelect(type);
    });
  });
}

export function renderSizeChoices(container, onSelect) {
  if (!state.potSizes.length) {
    container.innerHTML = '<div class="empty-state">لا تتوفر أحجام حالياً، حاولي لاحقاً.</div>';
    return;
  }

  container.innerHTML = state.potSizes.map((s) => `
    <button type="button" class="choice-card" data-id="${s.id}">
      <span class="choice-icon">${SIZE_ICONS[s.key] || '🍲'}</span>
      <span class="choice-body">
        <h3>${escapeHtml(s.name_ar)}</h3>
        <p>${escapeHtml(s.people_range_ar || '')}${s.pricing_mode === 'custom' ? ' — السعر يُحدَّد بعد المراجعة' : ''}</p>
      </span>
      <span class="choice-arrow">‹</span>
    </button>
  `).join('');

  container.querySelectorAll('.choice-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = state.potSizes.find((s) => s.id === btn.dataset.id);
      onSelect(size);
    });
  });
}
