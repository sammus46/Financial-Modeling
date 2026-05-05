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
const goalProgressSummaryEl = document.getElementById('goal-progress-summary');
const themeToggleButton = document.getElementById('networth-theme-toggle');
const THEME_KEY = 'financial-modeling-theme';
const NET_WORTH_STATE_KEY = 'financial-modeling-networth-state-v1';
const NET_WORTH_BOUNDS_MODE_KEY = 'financial-modeling-networth-bounds-mode-v1';
const LEGACY_NET_WORTH_STATE_KEYS = ['financial-modeling-net-worth-state'];
let chart;
let lastResult = null;
let selectedBoundsMode = localStorage.getItem(NET_WORTH_BOUNDS_MODE_KEY) === 'progress-focus' ? 'progress-focus' : 'full-range';

const currency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);
const percent = (v) => `${Number(v || 0).toFixed(2)}%`;

const parseCurrencyInput = (value) => Number(String(value || '').replace(/[$,\s]/g, '')) || 0;
const parsePercentInput = (value) => Number(String(value || '').replace(/[%,\s]/g, '')) || 0;


const fiTargetOverlayPlugin = {
  id: 'fiTargetOverlay',
  afterDatasetsDraw(chartInstance, _args, pluginOptions) {
    const targetValue = Number(pluginOptions?.targetValue);
    const label = pluginOptions?.labelText || 'FI Goal';
    if (!Number.isFinite(targetValue)) return;

    const yScale = chartInstance.scales?.y;
    const { right, top, bottom } = chartInstance.chartArea || {};
    if (!yScale || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) return;
    const y = yScale.getPixelForValue(targetValue);
    if (!Number.isFinite(y) || y < top || y > bottom) return;

    const ctx = chartInstance.ctx;
    ctx.save();
    ctx.fillStyle = pluginOptions?.lineColor || '#dc2626';
    ctx.font = '600 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, right - 4, Math.max(top + 14, y - 4));
    ctx.restore();
  },
};

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

function getComputedColor(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function getChartTheme() {
  return {
    axisColor: getComputedColor('--axis-color') || '#1e293b',
    gridColor: getComputedColor('--grid-color') || 'rgba(148, 163, 184, 0.22)',
    goalLine: getComputedColor('--chart-networth-goal-line') || getComputedColor('--chart-goal-line') || '#dc2626',
    medianLine: getComputedColor('--chart-networth-median-line') || getComputedColor('--chart-balance-line') || '#2563eb',
    p10Line: getComputedColor('--chart-networth-p10-line') || getComputedColor('--chart-p10-line') || '#f59e0b',
    p90Line: getComputedColor('--chart-networth-p90-line') || getComputedColor('--chart-p90-line') || '#16a34a',
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


function getNetWorthChartBounds({ low, median, high, fiGoal, mode = 'full-range' }) {
  const percentileValues = [...(low || []), ...(median || []), ...(high || [])].map(Number).filter(Number.isFinite);
  const goalValues = (fiGoal || []).map(Number).filter(Number.isFinite);

  if (!percentileValues.length && !goalValues.length) {
    return { min: 0, max: 1 };
  }

  if (mode === 'progress-focus') {
    const percentileBounds = getFiniteChartBounds(percentileValues);
    const goalHint = goalValues.length ? Math.max(...goalValues) : null;
    if (!Number.isFinite(goalHint)) {
      return { ...percentileBounds, goalHint: null, mode };
    }

    const span = Math.max(percentileBounds.max - percentileBounds.min, 1);
    const aboveGap = Math.max(goalHint - percentileBounds.max, 0);
    const belowGap = Math.max(percentileBounds.min - goalHint, 0);
    const maxExtension = span * 0.35;
    const upperExtension = Math.min(aboveGap * 0.2, maxExtension);
    const lowerExtension = Math.min(belowGap * 0.2, maxExtension);

    const focusedMin = percentileBounds.min - lowerExtension;
    const focusedMax = percentileBounds.max + upperExtension;
    const goalPadding = Math.max(span * 0.02, 1);

    return {
      // Keep the progress-focused feel, but never clip the FI goal line entirely.
      min: Math.min(focusedMin, goalHint - goalPadding),
      max: Math.max(focusedMax, goalHint + goalPadding),
      goalHint,
      mode,
    };
  }

  const fullBounds = getFiniteChartBounds([...percentileValues, ...goalValues]);
  return { ...fullBounds, goalHint: goalValues.length ? Math.max(...goalValues) : null, mode: 'full-range' };
}

function applyGoalVisibilityPadding(bounds) {
  if (!bounds) return { min: 0, max: 1 };
  const min = Number(bounds.min);
  const max = Number(bounds.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ...bounds, min: 0, max: 1 };

  const span = Math.max(max - min, 1);
  const padding = Math.max(span * 0.08, 1);
  return { ...bounds, min: min - padding, max: max + padding };
}


function getGoalHintAnnotation(bounds) {
  if (!bounds || !Number.isFinite(bounds.goalHint)) return '';
  if (bounds.goalHint >= bounds.min && bounds.goalHint <= bounds.max) return '';
  const direction = bounds.goalHint > bounds.max ? 'above' : 'below';
  return ` • FI goal ${direction} chart (${currency(bounds.goalHint)})`;
}

function setBoundsMode(mode) {
  selectedBoundsMode = mode === 'progress-focus' ? 'progress-focus' : 'full-range';
  localStorage.setItem(NET_WORTH_BOUNDS_MODE_KEY, selectedBoundsMode);
  const boundsModeButton = document.getElementById('networth-bounds-mode-toggle');
  if (boundsModeButton) {
    const isProgressFocus = selectedBoundsMode === 'progress-focus';
    boundsModeButton.textContent = isProgressFocus ? 'Bounds: Progress focus' : 'Bounds: Full range';
    boundsModeButton.setAttribute('aria-pressed', String(isProgressFocus));
  }
  if (lastResult) render(lastResult);
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
    chart.data.datasets[0].borderColor = theme.p10Line;
    chart.data.datasets[1].borderColor = theme.medianLine;
    chart.data.datasets[2].borderColor = theme.p90Line;
    chart.data.datasets[3].borderColor = theme.goalLine;
    chart.options.scales.x.ticks.color = theme.axisColor;
    chart.options.scales.y.ticks.color = theme.axisColor;
    chart.options.scales.x.grid.color = theme.gridColor;
    chart.options.scales.y.grid.color = theme.gridColor;
    chart.options.plugins.legend.labels.color = theme.axisColor;
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

function formatGoalGap(value) {
  const absValue = Math.abs(Number(value) || 0);
  return `${value >= 0 ? '+' : '-'}${currency(absValue)}`;
}

function getGoalGapNarrative(value) {
  const absValue = Math.abs(Number(value) || 0);
  if (absValue < 1) return 'At FI goal';
  return `${formatGoalGap(value)} ${value >= 0 ? 'above' : 'below'} FI goal`;
}

function render(result) {
  lastResult = result;
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
  const fiGoalLabel = `FI Goal (${currency(fiTarget)})`;
  const fiGoal = labels.map(() => fiTarget);
  const chartBounds = applyGoalVisibilityPadding(getNetWorthChartBounds({ low, median, high, fiGoal, mode: selectedBoundsMode }));

  const horizonPoint = result.timeline[result.timeline.length - 1];
  if (goalProgressSummaryEl && horizonPoint) {
    const horizonGap = Number(horizonPoint.net_worth_median || 0) - fiTarget;
    const horizonLabel = `M${horizonPoint.month}`;
    goalProgressSummaryEl.textContent = `Goal progress (${horizonLabel} median): ${getGoalGapNarrative(horizonGap)}`;
  }

  const theme = getChartTheme();
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('networthChart'), {
    plugins: [fiTargetOverlayPlugin],
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'P10', data: low, borderColor: theme.p10Line, order: 3 },
        { label: 'Median', data: median, borderColor: theme.medianLine, order: 3 },
        { label: 'P90', data: high, borderColor: theme.p90Line, order: 3 },
        // Canonical goal-line rendering path: keep FI goal as a standard dataset.
        {
          label: fiGoalLabel,
          data: fiGoal,
          borderColor: theme.goalLine,
          borderDash: [6, 6],
          borderWidth: 3.5,
          pointRadius: 0,
          pointHoverRadius: 2,
          pointHitRadius: 10,
          tension: 0,
          fill: false,
          spanGaps: true,
          clip: false,
          yAxisID: 'y',
          // Draw after percentile series so the FI target remains visually obvious.
          order: 99,
        },
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
        legend: {
          labels: {
            color: theme.axisColor,
            useLineStyle: true,
          },
        },
        fiTargetOverlay: {
          targetValue: fiTarget,
          labelText: fiGoalLabel,
          lineColor: theme.goalLine,
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = Number(context.parsed.y || 0);
              const baseLabel = `${context.dataset.label}: ${currency(value)}`;
              if (!['P10', 'Median', 'P90'].includes(context.dataset.label)) return baseLabel;
              const goalValue = Number(fiGoal[context.dataIndex] || fiTarget || 0);
              const gap = value - goalValue;
              return `${baseLabel} (${getGoalGapNarrative(gap)})`;
            },
            afterBody() {
              const hint = getGoalHintAnnotation(chartBounds);
              return hint ? [hint] : [];
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
setBoundsMode(selectedBoundsMode);
window.addEventListener('beforeunload', saveState);
if (themeToggleButton) {
  themeToggleButton.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(nextTheme);
  });
}
run();

const boundsModeToggleButton = document.getElementById('networth-bounds-mode-toggle');
if (boundsModeToggleButton) {
  boundsModeToggleButton.addEventListener('click', () => {
    const nextMode = selectedBoundsMode === 'full-range' ? 'progress-focus' : 'full-range';
    setBoundsMode(nextMode);
  });
}
