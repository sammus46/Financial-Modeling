const assetsBody = document.querySelector('#assets-table tbody');
const liabilitiesBody = document.querySelector('#liabilities-table tbody');
const calculateBtn = document.getElementById('calculate-networth-btn');
const errorEl = document.getElementById('networth-error');
const currentNetWorthEl = document.getElementById('current-net-worth');
const tenYearNetWorthEl = document.getElementById('ten-year-net-worth');
const debtFreeDateEl = document.getElementById('debt-free-date');
const milestonesList = document.getElementById('milestones-list');
const themeToggleButton = document.getElementById('networth-theme-toggle');
const THEME_KEY = 'financial-modeling-theme';
let chart;

const currency = (v)=> new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v||0);

function addAssetRow(name, cls, value, growth){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input value="${name}"/></td><td><select><option ${cls==='cash'?'selected':''}>cash</option><option ${cls==='investments'?'selected':''}>investments</option><option ${cls==='real_estate'?'selected':''}>real_estate</option><option ${cls==='vehicle'?'selected':''}>vehicle</option></select></td><td><input type="number" value="${value}" min="0"/></td><td><input type="number" value="${growth}" step="0.1"/></td>`;
  assetsBody.appendChild(tr);
}
function addLiabilityRow(name,balance,apr,minPayment){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input value="${name}"/></td><td><input type="number" value="${balance}" min="0"/></td><td><input type="number" value="${apr}" step="0.01"/></td><td><input type="number" value="${minPayment}" min="0"/></td>`;
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
    monthly_contribution:Number(document.getElementById('monthly_contribution').value||0),
    fi_target:Number(document.getElementById('fi_target').value||0),
    simulation_trials:Number(document.getElementById('simulation_trials').value||1000),
  };
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
      scales:{
        x:{ticks:{color:theme.axisColor},grid:{color:theme.gridColor}},
        y:{ticks:{color:theme.axisColor},grid:{color:theme.gridColor}}
      },
      plugins:{legend:{labels:{color:theme.axisColor}}}
    }
  });
}

async function run(){
  errorEl.textContent='';
  const resp=await fetch('/api/net-worth/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(collect())});
  const data=await resp.json();
  if(!resp.ok){ errorEl.textContent=data.error||'Calculation failed'; return; }
  render(data);
}
calculateBtn.addEventListener('click',run);
addAssetRow('Checking','cash',12000,1.0);
addAssetRow('401k','investments',85000,6.5);
addAssetRow('Home','real_estate',350000,3.0);
addLiabilityRow('Mortgage',250000,6.2,1800);
addLiabilityRow('Car Loan',18000,4.9,420);

initializeTheme();
if (themeToggleButton) {
  themeToggleButton.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(nextTheme);
  });
}
