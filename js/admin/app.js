import { qs, qsa, friendlyError } from '../shared/utils.js';
import { login, logout, getAdminSession } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderOrdersPanel } from './orders.js';
import { renderIngredientsPanel } from './ingredients.js';
import { renderRecipesPanel } from './recipes.js';
import { renderPricingPanel } from './pricing.js';
import { renderCustomersPanel } from './customers.js';
import { renderReportsPanel } from './reports.js';
import { renderNeedsPanel } from './needs.js';

const PANEL_RENDERERS = {
  dashboard: renderDashboard,
  orders: renderOrdersPanel,
  ingredients: renderIngredientsPanel,
  recipes: renderRecipesPanel,
  pricing: renderPricingPanel,
  customers: renderCustomersPanel,
  reports: renderReportsPanel,
  needs: renderNeedsPanel,
};

function showLogin() {
  qs('#login-view').style.display = 'flex';
  qs('#app-view').style.display = 'none';
}

async function showApp() {
  qs('#login-view').style.display = 'none';
  qs('#app-view').style.display = 'block';
  await switchTab('dashboard');
}

async function switchTab(tab) {
  qsa('.nav-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  qsa('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));

  const panelEl = qs(`#panel-${tab}`);
  const renderer = PANEL_RENDERERS[tab];
  if (renderer) {
    try {
      await renderer(panelEl);
    } catch (err) {
      panelEl.innerHTML = `<div class="alert alert-danger">تعذّر تحميل هذا القسم: ${friendlyError(err)}</div>`;
    }
  }
}

qsa('.nav-tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

qs('#btn-login').addEventListener('click', async () => {
  const email = qs('#login-email').value.trim();
  const password = qs('#login-password').value;
  const errorEl = qs('#login-error');
  errorEl.style.display = 'none';

  if (!email || !password) {
    errorEl.textContent = 'الرجاء إدخال البريد الإلكتروني وكلمة المرور';
    errorEl.style.display = 'block';
    return;
  }

  try {
    await login(email, password);
    const session = await getAdminSession();
    if (!session) {
      errorEl.textContent = 'هذا الحساب لا يملك صلاحية الوصول للوحة الإدارة';
      errorEl.style.display = 'block';
      await logout();
      return;
    }
    await showApp();
  } catch (err) {
    errorEl.textContent = friendlyError(err);
    errorEl.style.display = 'block';
  }
});

qs('#btn-logout').addEventListener('click', async () => {
  await logout();
  showLogin();
});

(async function init() {
  const session = await getAdminSession();
  if (session) {
    await showApp();
  } else {
    showLogin();
  }
})();
