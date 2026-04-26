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
const themeToggleButton = document.getElementById("theme-toggle");
const currencyInputs = form.querySelectorAll('input[data-currency="true"]');

let savingsRateInput;
let fixedContributionInput;
let portfolioChart;
let latestChartData = null;

const THEME_KEY = "retirement-theme";

const DEBUG_PREFIX = "[retirement-ui]";

function logDebug(message, details) {
  if (details !== undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`, details);
    return;
  }
  console.log(`${DEBUG_PREFIX} ${message}`);
}

const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const percent = (value) => `${value.toFixed(2)}%`;


function getComputedColor(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function toRgba(color, alpha) {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((char) => char + char).join("");
    }
    const value = Number.parseInt(hex, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
  }

  return color;
}

function getChartTheme() {
  const balanceLine = getComputedColor("--chart-balance-line") || "#2563eb";
  return {
    balanceLine,
    goalLine: getComputedColor("--chart-goal-line") || "#f59e0b",
    axisColor: getComputedColor("--axis-color") || "#1e293b",
    gridColor: getComputedColor("--grid-color") || "rgba(148, 163, 184, 0.22)",
    tooltipBg: getComputedColor("--tooltip-bg") || "rgba(15, 23, 42, 0.92)",
    tooltipBorder: getComputedColor("--tooltip-border") || "rgba(148, 163, 184, 0.25)",
    gradientTop: toRgba(balanceLine, 0.35),
    gradientBottom: toRgba(balanceLine, 0.06),
  };
}

function setTheme(mode) {
  const isDark = mode === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  if (themeToggleButton) {
    themeToggleButton.textContent = isDark ? "Light mode" : "Dark mode";
    themeToggleButton.setAttribute("aria-pressed", String(isDark));
  }
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");

  if (latestChartData) {
    renderChart(latestChartData.ages, latestChartData.postTaxBalances, latestChartData.goalLine);
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (preferredDark ? "dark" : "light"));
}

function formatMetricValue(metricKey, value) {
  if (value === null || value === undefined) {
    return "—";
  }

  const percentMetrics = new Set(["actual_withdrawal_rate", "retirement_goal_achieved_pct"]);

  if (percentMetrics.has(metricKey)) {
    return percent(Number(value));
  }

  return currency(Number(value));
}

function getMetricStatus(key, actual, goal) {
  const actualValue = Number(actual);
  const goalValue = Number(goal);

  if (!Number.isFinite(actualValue) || !Number.isFinite(goalValue)) {
    return "";
  }

  const lowerIsBetterMetrics = new Set(["actual_withdrawal_rate"]);
  const lowerIsBetter = lowerIsBetterMetrics.has(key);

  if (goalValue === 0) {
    if (lowerIsBetter) {
      return actualValue === 0 ? "status-good" : "status-low";
    }
    return actualValue > 0 ? "status-good" : "status-low";
  }

  const progressRatio = lowerIsBetter ? goalValue / Math.max(actualValue, Number.EPSILON) : actualValue / goalValue;
  if (progressRatio >= 1) {
    return "status-good";
  }
  if (progressRatio >= 0.75) {
    return "status-mid";
  }
  return "status-low";
}

function renderChart(ages, postTaxBalances, goalLine) {
  if (typeof Chart === "undefined") {
    logDebug("Chart.js is unavailable on window; skipping chart render.");
    return;
  }

  const chartEl = document.getElementById("portfolioChart");
  if (!chartEl) {
    logDebug("Chart canvas is missing; skipping chart render.");
    return;
  }

  logDebug("Rendering chart.", {
    points: ages.length,
    balances: postTaxBalances.length,
    goals: goalLine.length,
  });

  const theme = getChartTheme();
  const ctx = chartEl.getContext("2d");
  const balanceGradient = ctx.createLinearGradient(0, 0, 0, chartEl.height || 320);
  balanceGradient.addColorStop(0, theme.gradientTop);
  balanceGradient.addColorStop(1, theme.gradientBottom);

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
          borderColor: theme.balanceLine,
          backgroundColor: balanceGradient,
          fill: true,
          borderWidth: 3,
          tension: 0.32,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: "Retirement Goal",
          data: goalLine,
          borderColor: theme.goalLine,
          borderDash: [8, 6],
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: theme.axisColor,
            font: {
              size: 13,
              weight: "500",
            },
          },
        },
        y: {
          grid: {
            color: theme.gridColor,
          },
          ticks: {
            callback: (value) => currency(value),
            color: theme.axisColor,
            font: {
              size: 13,
              weight: "500",
            },
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            boxWidth: 12,
            color: theme.axisColor,
            font: {
              size: 14,
              weight: "500",
            },
          },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (context) => ` ${context.dataset.label}: ${currency(context.parsed.y)}`,
          },
        },
      },
    },
  });

  latestChartData = { ages, postTaxBalances, goalLine };
}

function renderStats(stats) {
  const metricLabels = {
    actual_withdrawal_rate: "Actual withdrawal rate",
    future_value_pre_tax_at_retirement: "Future value at retirement (pre-tax)",
    future_value_after_tax_at_retirement: "Future value at retirement (after-tax)",
    traditional_balance_at_retirement: "Traditional balance at retirement",
    roth_balance_at_retirement: "Roth balance at retirement",
    brokerage_balance_at_retirement: "Brokerage balance at retirement",
    total_balance_at_retirement: "Total balance at retirement",
    projected_income_at_retirement: "Projected salary at retirement (employment income)",
    yearly_salary_at_retirement: "Yearly salary at retirement (SWR portfolio income)",
    first_year_retirement_spending: "First-year retirement spending target",
    retirement_goal_achieved_pct: "Retirement goal achieved",
  };

  const orderedKeys = [
    "actual_withdrawal_rate",
    "future_value_pre_tax_at_retirement",
    "future_value_after_tax_at_retirement",
    "traditional_balance_at_retirement",
    "roth_balance_at_retirement",
    "brokerage_balance_at_retirement",
    "total_balance_at_retirement",
    "projected_income_at_retirement",
    "yearly_salary_at_retirement",
    "first_year_retirement_spending",
    "retirement_goal_achieved_pct",
  ];

  logDebug("Rendering stats table.", { metrics: orderedKeys.length });
  statsBody.innerHTML = orderedKeys
    .map((key) => {
      const row = stats[key];
      const status = getMetricStatus(key, row.actual, row.goal);
      return `<tr>
        <td>${metricLabels[key]}</td>
        <td class="metric-actual ${status}">${formatMetricValue(key, row.actual)}</td>
        <td>${formatMetricValue(key, row.goal)}</td>
      </tr>`;
    })
    .join("");
}

function renderSummary(stats) {
  const goalPct = Number(stats.retirement_goal_achieved_pct.actual || 0);
  logDebug("Rendering summary cards.", { goalPct });

  goalProgressEl.textContent = formatMetricValue(
    "retirement_goal_achieved_pct",
    stats.retirement_goal_achieved_pct.actual,
  );
  projectedValueEl.textContent = formatMetricValue(
    "future_value_after_tax_at_retirement",
    stats.future_value_after_tax_at_retirement.actual,
  );
  targetValueEl.textContent = formatMetricValue("total_balance_at_retirement", stats.total_balance_at_retirement.goal);

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
  logDebug("Calculate clicked; submit flow started.");

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    normalizeCurrencyFields(payload);
    const mode = form.elements["contribution_mode"].value;
    const savingsRateValue = Number(form.elements["savings_rate"].value || 0);
    const fixedContributionValue = Number(parseCurrencyInput(form.elements["fixed_annual_contribution"].value || "0"));

    if (mode === "percent" && savingsRateValue <= 0) {
      errorEl.textContent = "Savings rate must be greater than 0 when using % mode.";
      logDebug("Client validation blocked submit: invalid percent savings rate.", { savingsRateValue });
      return;
    }
    if (mode === "fixed" && fixedContributionValue <= 0) {
      errorEl.textContent = "Fixed annual contribution must be greater than $0 in fixed mode.";
      logDebug("Client validation blocked submit: invalid fixed contribution.", { fixedContributionValue });
      return;
    }

    payload.savings_rate = mode === "percent" ? form.elements["savings_rate"].value || "0" : "0";
    payload.fixed_annual_contribution = mode === "fixed" ? String(fixedContributionValue) : "0";
    logDebug("Prepared payload.", payload);

    const response = await fetch("/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    logDebug("Received /calculate response.", { status: response.status, ok: response.ok });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      logDebug("Failed to parse /calculate response as JSON.", parseError);
      errorEl.textContent = "Server response was not valid JSON.";
      return;
    }

    if (!response.ok) {
      errorEl.textContent = data.error || "Unable to calculate results.";
      logDebug("Calculation returned non-OK response.", data);
      return;
    }

    logDebug("Calculation succeeded.", {
      ages: data.ages?.length || 0,
      postTaxBalances: data.post_tax_balances?.length || 0,
      hasStats: Boolean(data.stats),
    });

    renderChart(data.ages, data.post_tax_balances, data.goal_line);
    renderStats(data.stats);
    renderSummary(data.stats);
  } catch (_error) {
    logDebug("Unhandled error during calculate flow.", _error);
    errorEl.textContent = "Something went wrong while calculating. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Calculate";
    logDebug("Submit flow finished; button restored.");
  }
}

savingsRateInput = form.elements["savings_rate"];
fixedContributionInput = form.elements["fixed_annual_contribution"];

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

if (themeToggleButton) {
  themeToggleButton.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("dark-mode") ? "light" : "dark";
    setTheme(nextTheme);
  });
}

initializeTheme();
form.dispatchEvent(new Event("submit"));
