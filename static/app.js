const form = document.getElementById("retirement-form");
const errorEl = document.getElementById("error");
const statsBody = document.querySelector("#stats-table tbody");

let portfolioChart;

const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const percent = (value) => `${value.toFixed(2)}%`;

function renderChart(ages, balances) {
  const ctx = document.getElementById("portfolioChart").getContext("2d");

  if (portfolioChart) {
    portfolioChart.destroy();
  }

  portfolioChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: ages,
      datasets: [
        {
          label: "Portfolio Value (Pre-Tax)",
          data: balances,
          borderColor: "#0d6efd",
          tension: 0.2,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          ticks: {
            callback: (value) => currency(value),
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => ` ${currency(context.parsed.y)}`,
          },
        },
      },
    },
  });
}

function renderStats(stats) {
  const rows = [
    ["Actual withdrawal rate", percent(stats.actual_withdrawal_rate)],
    ["Yearly savings goal", currency(stats.yearly_savings_goal)],
    ["Additional yearly savings needed", currency(stats.additional_yearly_savings_needed)],
    ["Monthly savings goal", currency(stats.monthly_savings_goal)],
    ["Future value at retirement (pre-tax)", currency(stats.future_value_pre_tax_at_retirement)],
    ["Future value at retirement (after-tax)", currency(stats.future_value_after_tax_at_retirement)],
    ["Traditional balance at retirement", currency(stats.traditional_balance_at_retirement)],
    ["Roth balance at retirement", currency(stats.roth_balance_at_retirement)],
    ["Brokerage balance at retirement", currency(stats.brokerage_balance_at_retirement)],
    ["Projected salary at retirement", currency(stats.projected_income_at_retirement)],
    ["Yearly salary at retirement (SWR)", currency(stats.yearly_salary_at_retirement)],
    ["First-year retirement spending target", currency(stats.first_year_retirement_spending)],
    ["Target nest egg", currency(stats.target_nest_egg)],
    ["Retirement goal achieved in first year", percent(stats.retirement_goal_achieved_pct)],
  ];

  statsBody.innerHTML = rows
    .map(([metric, value]) => `<tr><td>${metric}</td><td>${value}</td></tr>`)
    .join("");
}

async function handleSubmit(event) {
  event.preventDefault();
  errorEl.textContent = "";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/calculate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    errorEl.textContent = data.error || "Unable to calculate results.";
    return;
  }

  renderChart(data.ages, data.balances);
  renderStats(data.stats);
}

form.addEventListener("submit", handleSubmit);
form.dispatchEvent(new Event("submit"));
