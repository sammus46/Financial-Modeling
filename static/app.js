const form = document.getElementById("retirement-form");
const errorEl = document.getElementById("error");
const statsBody = document.querySelector("#stats-table tbody");
const goalProgressEl = document.getElementById("goal-progress");
const projectedValueEl = document.getElementById("projected-value");
const targetValueEl = document.getElementById("target-value");
const goalCardEl = document.getElementById("goal-card");
const projectedCardEl = document.getElementById("projected-card");
const targetCardEl = document.getElementById("target-card");
const submitButton = document.getElementById("calculate-btn");
const currencyInputs = form.querySelectorAll('input[data-currency="true"]');

const savingsRateInput = form.elements["savings_rate"];
const fixedContributionInput = form.elements["fixed_annual_contribution"];

let portfolioChart;

const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const percent = (value) => `${value.toFixed(2)}%`;

function formatMetricValue(metricKey, value) {
  if (value === null || value === undefined) {
    return "—";
  }

  const percentMetrics = new Set([
    "actual_withdrawal_rate",
    "retirement_goal_achieved_pct",
  ]);

  if (percentMetrics.has(metricKey)) {
    return percent(Number(value));
  }

  return currency(Number(value));
}

function renderChart(ages, postTaxBalances, goalLine) {
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
          label: "Portfolio Value (Post-Tax)",
          data: postTaxBalances,
          borderColor: "#0d6efd",
          tension: 0.2,
          pointRadius: 2,
        },
        {
          label: "Retirement Goal",
          data: goalLine,
          borderColor: "#f59e0b",
          borderDash: [8, 6],
          tension: 0,
          pointRadius: 0,
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
            label: (context) => ` ${context.dataset.label}: ${currency(context.parsed.y)}`,
          },
        },
      },
    },
  });
}

function renderStats(stats) {
  const metricLabels = {
    actual_withdrawal_rate: "Actual withdrawal rate",
    yearly_savings_goal: "Yearly savings",
    monthly_savings_goal: "Monthly savings",
    additional_yearly_savings_needed: "Additional yearly savings needed",
    future_value_pre_tax_at_retirement: "Future value at retirement (pre-tax)",
    future_value_after_tax_at_retirement: "Future value at retirement (after-tax)",
    traditional_balance_at_retirement: "Traditional balance at retirement",
    roth_balance_at_retirement: "Roth balance at retirement",
    brokerage_balance_at_retirement: "Brokerage balance at retirement",
    projected_income_at_retirement: "Projected salary at retirement",
    yearly_salary_at_retirement: "Yearly salary at retirement (SWR)",
    first_year_retirement_spending: "First-year retirement spending target",
    target_nest_egg: "Target nest egg",
    retirement_goal_achieved_pct: "Retirement goal achieved",
  };

  const orderedKeys = [
    "actual_withdrawal_rate",
    "yearly_savings_goal",
    "monthly_savings_goal",
    "additional_yearly_savings_needed",
    "future_value_pre_tax_at_retirement",
    "future_value_after_tax_at_retirement",
    "traditional_balance_at_retirement",
    "roth_balance_at_retirement",
    "brokerage_balance_at_retirement",
    "projected_income_at_retirement",
    "yearly_salary_at_retirement",
    "first_year_retirement_spending",
    "target_nest_egg",
    "retirement_goal_achieved_pct",
  ];

  statsBody.innerHTML = orderedKeys
    .map((key) => {
      const row = stats[key];
      return `<tr>
        <td>${metricLabels[key]}</td>
        <td>${formatMetricValue(key, row.actual)}</td>
        <td>${formatMetricValue(key, row.goal)}</td>
      </tr>`;
    })
    .join("");
}

function renderSummary(stats) {
  const goalPct = Number(stats.retirement_goal_achieved_pct.actual || 0);

  goalProgressEl.textContent = formatMetricValue(
    "retirement_goal_achieved_pct",
    goalPct,
  );
  projectedValueEl.textContent = formatMetricValue(
    "future_value_after_tax_at_retirement",
    stats.future_value_after_tax_at_retirement.actual,
  );
  targetValueEl.textContent = formatMetricValue("target_nest_egg", stats.target_nest_egg.goal);

  const statusClass = goalPct >= 100 ? "status-good" : goalPct >= 75 ? "status-mid" : "status-low";
  [goalCardEl, projectedCardEl, targetCardEl].forEach((card) => {
    card.classList.remove("status-good", "status-mid", "status-low");
    card.classList.add(statusClass);
  });
}

function syncContributionMode() {
  const mode = form.elements["contribution_mode"].value;
  const usingPercent = mode === "percent";

  savingsRateInput.disabled = !usingPercent;
  fixedContributionInput.disabled = usingPercent;
}

function parseCurrencyInput(value) {
  const numeric = value.replace(/[^0-9.]/g, "");
  return numeric === "" ? "" : numeric;
}

function formatCurrencyInput(value) {
  const numeric = parseCurrencyInput(value);
  if (numeric === "") {
    return "";
  }

  const [whole, decimal] = numeric.split(".");
  const withCommas = Number(whole || 0).toLocaleString("en-US");
  if (decimal !== undefined) {
    return `$${withCommas}.${decimal.slice(0, 2)}`;
  }
  return `$${withCommas}`;
}

function normalizeCurrencyFields(payload) {
  currencyInputs.forEach((input) => {
    payload[input.name] = parseCurrencyInput(payload[input.name] || "0");
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  errorEl.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent = "Calculating…";

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    normalizeCurrencyFields(payload);
    payload.savings_rate = form.elements["savings_rate"].value || "0";
    payload.fixed_annual_contribution = parseCurrencyInput(
      form.elements["fixed_annual_contribution"].value || "0",
    );

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

    renderChart(data.ages, data.post_tax_balances, data.goal_line);
    renderStats(data.stats);
    renderSummary(data.stats);
  } catch (_error) {
    errorEl.textContent = "Something went wrong while calculating. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Calculate";
  }
}

form.addEventListener("submit", handleSubmit);
form.querySelectorAll('input[name="contribution_mode"]').forEach((radio) => {
  radio.addEventListener("change", syncContributionMode);
});

currencyInputs.forEach((input) => {
  input.value = formatCurrencyInput(input.value);
  input.addEventListener("input", () => {
    input.value = formatCurrencyInput(input.value);
  });
});

syncContributionMode();
form.dispatchEvent(new Event("submit"));
