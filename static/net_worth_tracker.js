const assetsBody = document.querySelector('#assets-table tbody');
const liabilitiesBody = document.querySelector('#liabilities-table tbody');
const calculateBtn = document.getElementById('calculate-networth-btn');
const errorEl = document.getElementById('networth-error');
const currentNetWorthEl = document.getElementById('current-net-worth');
const tenYearNetWorthEl = document.getElementById('ten-year-net-worth');
const debtFreeDateEl = document.getElementById('debt-free-date');
const milestonesList = document.getElementById('milestones-list');
const themeToggleButton = document.getElementById('networth-theme-toggle');
const monthlyContributionInput = document.getElementById('monthly_contribution');
const fiTargetInput = document.getElementById('fi_target');
const simulationTrialsInput = document.getElementById('simulation_trials');
const STORAGE_KEY = 'financial-modeling-net-worth-state';
const THEME_KEY = 'financial-modeling-theme';
const ASSET_CLASSES = ['cash', 'investments', 'real_estate', 'vehicle'];
const DEFAULT_ASSETS = [
  { name: 'Checking', asset_class: 'cash', current_value: 12000, annual_growth_rate: 1.0 },
  { name: '401k', asset_class: 'investments', current_value: 85000, annual_growth_rate: 6.5 },
  { name: 'Home', asset_class: 'real_estate', current_value: 350000, annual_growth_rate: 3.0 },
];
const DEFAULT_LIABILITIES = [
  { name: 'Mortgage', balance: 250000, annual_interest_rate: 6.2, minimum_payment: 1800 },
  { name: 'Car Loan', balance: 18000, annual_interest_rate: 4.9, minimum_payment: 420 },
];
let chart;
let saveTimeoutId;

const currency = (v)=> new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v||0);

function createCell(child) {
  const td = document.createElement('td');
  td.appendChild(child);
  return td;
}

function createInput(value, attributes = {}) {
  const input = document.createElement('input');
  Object.entries(attributes).forEach(([key, attributeValue]) => input.setAttribute(key, attributeValue));
  input.value = value ?? '';
  return input;
}

function addAssetRow(name, cls, value, growth){
  const tr=document.createElement('tr');
  const classSelect = document.createElement('select');
  ASSET_CLASSES.forEach((assetClass) => {
    const option = document.createElement('option');
    option.value = assetClass;
    option.textContent = assetClass;
    classSelect.appendChild(option);
  });
  classSelect.value = ASSET_CLASSES.includes(cls) ? cls : 'cash';
  tr.appendChild(createCell(createInput(name)));
  tr.appendChild(createCell(classSelect));
  tr.appendChild(createCell(createInput(value, { type: 'number', min: '0' })));
  tr.appendChild(createCell(createInput(growth, { type: 'number', step: '0.1' })));
  assetsBody.appendChild(tr);
}
function addLiabilityRow(name,balance,apr,minPayment){
  const tr=document.createElement('tr');
  tr.appendChild(createCell(createInput(name)));
  tr.appendChild(createCell(createInput(balance, { type: 'number', min: '0' })));
  tr.appendChild(createCell(createInput(apr, { type: 'number', step: '0.01' })));
  tr.appendChild(createCell(createInput(minPayment, { type: 'number', min: '0' })));
  liabilitiesBody.appendChild(tr);
}

function getChartTheme() {
  const isDark = document.body.classList.contains('dark-mode');
  return {
    axisColor: isDark ? '#e5e7eb' : '#111827',
    gridColor: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.3)',
  };
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

function collect(){
  const assets=[...assetsBody.querySelectorAll('tr')].map(r=>({
    name:r.cells[0].querySelector('input').value,
    asset_class:r.cells[1].querySelector('select').value,
    current_value:Number(r.cells[2].querySelector('input').value||0),
    annual_growth_rate:Number(r.cells[3].querySelector('input').value||0),
  }));
  const liabilities=[...liabilitiesBody.querySelectorAll('tr')].map(r=>({
    name:r.cells[0].querySelector('input').value,
    balance:Number(r.cells[1].querySelector('input').value||0),
    annual_interest_rate:Number(r.cells[2].querySelector('input').value||0),
    minimum_payment:Number(r.cells[3].querySelector('input').value||0),
  }));
  return {
    assets, liabilities,
    monthly_contribution:Number(monthlyContributionInput.value||0),
    fi_target:Number(fiTargetInput.value||0),
    simulation_trials:Number(simulationTrialsInput.value||1000),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collect()));
}

function debounceSaveState() {
  window.clearTimeout(saveTimeoutId);
  saveTimeoutId = window.setTimeout(saveState, 150);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return null;
  }
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function numberOrFallback(value, fallback, minimum = null, maximum = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (minimum !== null && numeric < minimum) {
    return minimum;
  }
  if (maximum !== null && numeric > maximum) {
    return maximum;
  }
  return numeric;
}

function normalizeAsset(asset) {
  if (!asset || typeof asset !== 'object') {
    return null;
  }
  return {
    name: String(asset.name ?? ''),
    asset_class: ASSET_CLASSES.includes(asset.asset_class) ? asset.asset_class : 'cash',
    current_value: numberOrFallback(asset.current_value, 0, 0),
    annual_growth_rate: numberOrFallback(asset.annual_growth_rate, 0),
  };
}

function normalizeLiability(liability) {
  if (!liability || typeof liability !== 'object') {
    return null;
  }
  return {
    name: String(liability.name ?? ''),
    balance: numberOrFallback(liability.balance, 0, 0),
    annual_interest_rate: numberOrFallback(liability.annual_interest_rate, 0),
    minimum_payment: numberOrFallback(liability.minimum_payment, 0, 0),
  };
}

function getInitialRows(savedRows, defaultRows, normalize) {
  const normalizedRows = Array.isArray(savedRows) ? savedRows.map(normalize).filter(Boolean) : [];
  return normalizedRows.length ? normalizedRows : defaultRows;
}
function render(result){
  currentNetWorthEl.textContent=currency(result.current_net_worth);
  tenYearNetWorthEl.textContent=currency(result.horizons.y10.median);
  debtFreeDateEl.textContent=result.milestones.debt_free_date || 'Not within horizon';
  milestonesList.innerHTML='';
  Object.entries(result.milestones).forEach(([k,v])=>{ const li=document.createElement('li'); li.textContent=`${k}: ${v || 'Not within horizon'}`; milestonesList.appendChild(li); });
  const labels=result.timeline.map(p=>`M${p.month}`);
  const median=result.timeline.map(p=>p.net_worth_median);
  const low=result.timeline.map(p=>p.net_worth_p10);
  const high=result.timeline.map(p=>p.net_worth_p90);
  const theme = getChartTheme();
  if(chart) chart.destroy();
  chart=new Chart(document.getElementById('networthChart'),{
    type:'line',
    data:{labels,datasets:[{label:'P10',data:low,borderColor:'#f59e0b'},{label:'Median',data:median,borderColor:'#2563eb'},{label:'P90',data:high,borderColor:'#16a34a'}]},
    options:{
      interaction:{
        mode:'index',
        intersect:false,
      },
      scales:{
        x:{ticks:{color:theme.axisColor},grid:{color:theme.gridColor}},
        y:{ticks:{color:theme.axisColor},grid:{color:theme.gridColor}}
      },
      plugins:{
        legend:{labels:{color:theme.axisColor}},
        tooltip:{
          callbacks:{
            label(context){
              return `${context.dataset.label}: ${currency(Number(context.parsed.y || 0))}`;
            },
          },
        },
      }
    }
  });
}

async function run(){
  errorEl.textContent='';
  saveState();
  const resp=await fetch('/api/net-worth/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(collect())});
  const data=await resp.json();
  if(!resp.ok){ errorEl.textContent=data.error||'Calculation failed'; return; }
  render(data);
}

function initialize(){
  const state = loadState();
  const assets = getInitialRows(state?.assets, DEFAULT_ASSETS, normalizeAsset);
  const liabilities = getInitialRows(state?.liabilities, DEFAULT_LIABILITIES, normalizeLiability);

  monthlyContributionInput.value = String(numberOrFallback(state?.monthly_contribution, Number(monthlyContributionInput.value || 0), 0));
  fiTargetInput.value = String(numberOrFallback(state?.fi_target, Number(fiTargetInput.value || 0), 1000));
  simulationTrialsInput.value = String(numberOrFallback(state?.simulation_trials, Number(simulationTrialsInput.value || 1000), 200, 5000));

  assets.forEach((asset) => addAssetRow(asset.name, asset.asset_class, asset.current_value, asset.annual_growth_rate));
  liabilities.forEach((liability) => addLiabilityRow(liability.name, liability.balance, liability.annual_interest_rate, liability.minimum_payment));

  calculateBtn.addEventListener('click',run);
  [monthlyContributionInput, fiTargetInput, simulationTrialsInput].forEach((input) => {
    input.addEventListener('input', debounceSaveState);
    input.addEventListener('change', saveState);
  });

  [assetsBody, liabilitiesBody].forEach((body) => {
    body.addEventListener('input', debounceSaveState);
    body.addEventListener('change', saveState);
  });
  window.addEventListener('beforeunload', saveState);

  initializeTheme();
  if (themeToggleButton) {
    themeToggleButton.addEventListener('click', () => {
      const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }

  saveState();
  run();
}

initialize();
