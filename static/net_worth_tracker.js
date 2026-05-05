const assetsBody = document.querySelector('#assets-table tbody');
const liabilitiesBody = document.querySelector('#liabilities-table tbody');
const calculateBtn = document.getElementById('calculate-networth-btn');
const addAssetBtn = document.getElementById('add-asset-row-btn');
const addLiabilityBtn = document.getElementById('add-liability-row-btn');
const errorEl = document.getElementById('networth-error');
const currentNetWorthEl = document.getElementById('current-net-worth');
const tenYearNetWorthEl = document.getElementById('ten-year-net-worth');
const debtFreeDateEl = document.getElementById('debt-free-date');
const milestonesList = document.getElementById('milestones-list');
const themeToggleButton = document.getElementById('networth-theme-toggle');
const THEME_KEY = 'financial-modeling-theme';
const NET_WORTH_STATE_KEY = 'financial-modeling-networth-state-v1';
const LEGACY_NET_WORTH_STATE_KEYS = ['financial-modeling-net-worth-state'];
let chart;

const currency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);
const percent = (v) => `${Number(v || 0).toFixed(2)}%`;

const parseCurrencyInput = (value) => Number(String(value || '').replace(/[$,\s]/g, '')) || 0;
const parsePercentInput = (value) => Number(String(value || '').replace(/[%,\s]/g, '')) || 0;

function formatCurrencyInput(el) {
  const value = parseCurrencyInput(el.value);
  el.value = currency(value);
}

function formatPercentInput(el) {
  const value = parsePercentInput(el.value);
  el.value = percent(value);
}

function createRowActions(tr, containerBody) {
  const actionsTd = document.createElement('td');

  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'secondary-btn row-move-btn';
  moveUpBtn.textContent = '↑';
  moveUpBtn.ariaLabel = 'Move row up';
  moveUpBtn.addEventListener('click', () => {
    const previousRow = tr.previousElementSibling;
    if (!previousRow) return;
    containerBody.insertBefore(tr, previousRow);
    saveState();
  });

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'secondary-btn row-move-btn';
  moveDownBtn.textContent = '↓';
  moveDownBtn.ariaLabel = 'Move row down';
  moveDownBtn.addEventListener('click', () => {
    const nextRow = tr.nextElementSibling;
    if (!nextRow) return;
    containerBody.insertBefore(nextRow, tr);
    saveState();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'secondary-btn row-remove-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.ariaLabel = 'Remove row';
  deleteBtn.addEventListener('click', () => {
    tr.remove();
    saveState();
  });

  actionsTd.append(moveUpBtn, moveDownBtn, deleteBtn);
  return actionsTd;
}

function addAssetRow(name, cls, value, growth) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input value="${name}"/></td><td><select><option ${cls === 'cash' ? 'selected' : ''}>cash</option><option ${cls === 'investments' ? 'selected' : ''}>investments</option><option ${cls === 'real_estate' ? 'selected' : ''}>real_estate</option><option ${cls === 'vehicle' ? 'selected' : ''}>vehicle</option></select></td><td><input type="text" value="${currency(value)}" inputmode="decimal" data-format="currency"/></td><td><input type="text" value="${percent(growth)}" inputmode="decimal" data-format="percent"/></td>`;
  tr.appendChild(createRowActions(tr, assetsBody));
  assetsBody.appendChild(tr);
  wireRowInputs(tr);
}

function addLiabilityRow(name, balance, apr, minPayment) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input value="${name}"/></td><td><input type="text" value="${currency(balance)}" inputmode="decimal" data-format="currency"/></td><td><input type="text" value="${percent(apr)}" inputmode="decimal" data-format="percent"/></td><td><input type="text" value="${currency(minPayment)}" inputmode="decimal" data-format="currency"/></td>`;
  tr.appendChild(createRowActions(tr, liabilitiesBody));
  liabilitiesBody.appendChild(tr);
  wireRowInputs(tr);
}

function wireRowInputs(tr) {
  tr.querySelectorAll('input, select').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.format === 'currency') formatCurrencyInput(input);
      if (input.dataset.format === 'percent') formatPercentInput(input);
      saveState();
    });
    input.addEventListener('input', saveState);
  });
}

function getChartTheme() {
  const isDark = document.body.classList.contains('dark-mode');
  return {
    axisColor: isDark ? '#e5e7eb' : '#111827',
    gridColor: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.3)',
  };
}

function getFiniteChartBounds(values) {
  const finiteValues = values.map(Number).filter(Number.isFinite);
  if (!finiteValues.length) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (min === max) {
    const padding = Math.max(Math.abs(max) * 0.05, 1);
    return { min: min - padding, max: max + padding };
  }

  const padding = Math.max((max - min) * 0.05, Math.abs(max) * 0.05, 1);
  return { min: min - padding, max: max + padding };
}

function setTheme(mode) {
  const isDark = mode === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  if (themeToggleButton) {
    themeToggleButton.textContent = isDark ? 'Light mode' : 'Dark mode';
    themeToggleButton.setAttribute('aria-pressed', String(isDark));
  }
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');

  if (chart) {
    const theme = getChartTheme();
    chart.options.scales.x.ticks.color = theme.axisColor;
    chart.options.scales.y.ticks.color = theme.axisColor;
    chart.options.scales.x.grid.color = theme.gridColor;
    chart.options.scales.y.grid.color = theme.gridColor;
    chart.update();
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(savedTheme || (preferredDark ? 'dark' : 'light'));
}

function collect() {
  const assets = [...assetsBody.querySelectorAll('tr')].map((r) => ({
    name: r.cells[0].querySelector('input').value,
    asset_class: r.cells[1].querySelector('select').value,
    current_value: parseCurrencyInput(r.cells[2].querySelector('input').value),
    annual_growth_rate: parsePercentInput(r.cells[3].querySelector('input').value),
  }));
  const liabilities = [...liabilitiesBody.querySelectorAll('tr')].map((r) => ({
    name: r.cells[0].querySelector('input').value,
    balance: parseCurrencyInput(r.cells[1].querySelector('input').value),
    annual_interest_rate: parsePercentInput(r.cells[2].querySelector('input').value),
    minimum_payment: parseCurrencyInput(r.cells[3].querySelector('input').value),
  }));
  return {
    assets,
    liabilities,
    monthly_contribution: parseCurrencyInput(document.getElementById('monthly_contribution').value),
    fi_target: parseCurrencyInput(document.getElementById('fi_target').value),
    simulation_trials: Number(document.getElementById('simulation_trials').value || 1000),
  };
}

function saveState() {
  localStorage.setItem(NET_WORTH_STATE_KEY, JSON.stringify(collect()));
}

function parseSavedState(key) {
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

function loadState() {
  const storageKeys = [NET_WORTH_STATE_KEY, ...LEGACY_NET_WORTH_STATE_KEYS];
  for (const key of storageKeys) {
    const state = parseSavedState(key);
    if (state) {
      return state;
    }
  }
  return null;
}

function render(result) {
  currentNetWorthEl.textContent = currency(result.current_net_worth);
  tenYearNetWorthEl.textContent = currency(result.horizons.y10.median);
  debtFreeDateEl.textContent = result.milestones.debt_free_date || 'Not within horizon';
  milestonesList.innerHTML = '';
  Object.entries(result.milestones).forEach(([k, v]) => {
    const li = document.createElement('li');
    li.textContent = `${k}: ${v || 'Not within horizon'}`;
    milestonesList.appendChild(li);
  });
  const labels = result.timeline.map((p) => `M${p.month}`);
  const median = result.timeline.map((p) => p.net_worth_median);
  const low = result.timeline.map((p) => p.net_worth_p10);
  const high = result.timeline.map((p) => p.net_worth_p90);
  const fiTarget = parseCurrencyInput(document.getElementById('fi_target').value);
  const fiGoal = labels.map(() => fiTarget);
  const chartValues = [...low, ...median, ...high, ...fiGoal];
  const chartBounds = getFiniteChartBounds(chartValues);
  const theme = getChartTheme();
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('networthChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'P10', data: low, borderColor: '#f59e0b' },
        { label: 'Median', data: median, borderColor: '#2563eb' },
        { label: 'P90', data: high, borderColor: '#16a34a' },
        // Canonical goal-line rendering path: keep FI goal as a standard dataset.
        { label: 'FI Goal', data: fiGoal, borderColor: '#ef4444', borderDash: [6, 6], borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 0, fill: false, order: 99 },
      ],
    },
    options: {
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: { ticks: { color: theme.axisColor }, grid: { color: theme.gridColor } },
        y: {
          min: chartBounds.min,
          max: chartBounds.max,
          ticks: { color: theme.axisColor },
          grid: { color: theme.gridColor },
        },
      },
      plugins: {
        legend: { labels: { color: theme.axisColor } },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${currency(Number(context.parsed.y || 0))}`;
            },
          },
        },
      },
    },
  });
}

async function run() {
  errorEl.textContent = '';
  saveState();
  const resp = await fetch('/api/net-worth/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
  const data = await resp.json();
  if (!resp.ok) { errorEl.textContent = data.error || 'Calculation failed'; return; }
  render(data);
}

function initializeForm() {
  const state = loadState();
  const assets = state?.assets?.length ? state.assets : [
    { name: 'Checking', asset_class: 'cash', current_value: 12000, annual_growth_rate: 1.0 },
    { name: '401k', asset_class: 'investments', current_value: 85000, annual_growth_rate: 6.5 },
    { name: 'Home', asset_class: 'real_estate', current_value: 350000, annual_growth_rate: 3.0 },
  ];
  const liabilities = state?.liabilities?.length ? state.liabilities : [
    { name: 'Mortgage', balance: 250000, annual_interest_rate: 6.2, minimum_payment: 1800 },
    { name: 'Car Loan', balance: 18000, annual_interest_rate: 4.9, minimum_payment: 420 },
  ];

  assets.forEach((a) => addAssetRow(a.name || '', a.asset_class || 'cash', a.current_value || 0, a.annual_growth_rate || 0));
  liabilities.forEach((l) => addLiabilityRow(l.name || '', l.balance || 0, l.annual_interest_rate || 0, l.minimum_payment || 0));

  document.getElementById('monthly_contribution').value = currency(state?.monthly_contribution ?? 1500);
  document.getElementById('fi_target').value = currency(state?.fi_target ?? 1000000);
  document.getElementById('simulation_trials').value = Number(state?.simulation_trials || 1000);

  ['monthly_contribution', 'fi_target'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('change', () => { formatCurrencyInput(el); saveState(); });
    el.addEventListener('input', saveState);
  });
  document.getElementById('simulation_trials').addEventListener('input', saveState);
}

calculateBtn.addEventListener('click', run);
addAssetBtn.addEventListener('click', () => { addAssetRow('', 'cash', 0, 0); saveState(); });
addLiabilityBtn.addEventListener('click', () => { addLiabilityRow('', 0, 0, 0); saveState(); });

initializeTheme();
initializeForm();
window.addEventListener('beforeunload', saveState);
if (themeToggleButton) {
  themeToggleButton.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(nextTheme);
  });
}
run();
