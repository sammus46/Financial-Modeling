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
const inputsPanel = document.querySelector(".inputs-panel");
const chartModeButtons = document.querySelectorAll("[data-chart-mode]");

let savingsRateInput;
let fixedContributionInput;
let portfolioChart;
let latestChartData = null;
let selectedChartMode = "balance";

const THEME_KEY = "retirement-theme";
const FORM_VALUES_KEY = "retirement-form-values-v1";

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
  const chartSeries =
    selectedChartMode === "gap"
      ? postTaxBalances.map((value, index) => value - goalLine[index])
      : postTaxBalances;
  const chartLabel = selectedChartMode === "gap" ? "Gap vs Retirement Goal" : "Portfolio Value (Post-Tax)";
  const yTickFormatter =
    selectedChartMode === "gap" ? (value) => `${value >= 0 ? "+" : "-"}${currency(Math.abs(value))}` : (value) => currency(value);
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
          label: chartLabel,
          data: chartSeries,
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
          data: selectedChartMode === "gap" ? goalLine.map(() => 0) : goalLine,
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
            callback: yTickFormatter,
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
            afterLabel: (context) => {
              if (selectedChartMode === "gap") {
                return context.parsed.y >= 0 ? " Ahead of plan" : " Behind plan";
              }
              if (context.dataset.label !== "Portfolio Value (Post-Tax)") {
                return "";
              }
              const goalValue = goalLine[context.dataIndex] || 0;
              const gap = context.parsed.y - goalValue;
              const direction = gap >= 0 ? "Ahead" : "Behind";
              return ` ${direction} goal by ${currency(Math.abs(gap))}`;
            },
          },
        },
      },
    },
  });

  latestChartData = { ages, postTaxBalances, goalLine };
}

function setChartMode(mode) {
  selectedChartMode = mode;
  chartModeButtons.forEach((button) => {
    const isSelected = button.dataset.chartMode === mode;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (latestChartData) {
    renderChart(latestChartData.ages, latestChartData.postTaxBalances, latestChartData.goalLine);
  }
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
  const contributionModeFieldset = form.querySelector(".contribution-mode");
  if (contributionModeFieldset) {
    contributionModeFieldset.dataset.mode = mode;
  }
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

function ensureFieldErrorElement(fieldName) {
  let fieldErrorEl = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (fieldErrorEl) {
    return fieldErrorEl;
  }
  const field = form.elements[fieldName];
  if (!field) {
    return null;
  }
  fieldErrorEl = document.createElement("p");
  fieldErrorEl.className = "field-error";
  fieldErrorEl.dataset.errorFor = fieldName;
  field.insertAdjacentElement("afterend", fieldErrorEl);
  return fieldErrorEl;
}

function clearFieldErrors() {
  form.querySelectorAll("input").forEach((field) => {
    field.setAttribute("aria-invalid", "false");
  });
  form.querySelectorAll(".field-error").forEach((errorNode) => {
    errorNode.textContent = "";
    errorNode.classList.remove("active");
  });
}

function setFieldError(fieldName, message) {
  const field = form.elements[fieldName];
  if (!field) {
    return;
  }
  field.setAttribute("aria-invalid", "true");
  const fieldErrorEl = ensureFieldErrorElement(fieldName);
  if (fieldErrorEl) {
    fieldErrorEl.textContent = message;
    fieldErrorEl.classList.add("active");
  }
}

function validateForm(payload) {
  const errors = [];
  const number = (fieldName) => Number(payload[fieldName] ?? 0);
  const currentAge = number("current_age");
  const retirementAge = number("retirement_age");
  const inflationRate = number("inflation_rate");
  const retirementSpendRate = number("retirement_spend_rate");
  const desiredSwr = number("desired_swr");
  const mode = payload.contribution_mode;
  const savingsRateValue = number("savings_rate");
  const fixedContributionValue = Number(parseCurrencyInput(payload.fixed_annual_contribution || "0"));

  if (retirementAge <= currentAge) {
    errors.push({ field: "retirement_age", message: "Retirement age must be greater than current age." });
  }
  if (inflationRate <= 0) {
    errors.push({ field: "inflation_rate", message: "Inflation rate must be greater than 0." });
  }
  if (retirementSpendRate <= 0) {
    errors.push({ field: "retirement_spend_rate", message: "Retirement spending rate must be greater than 0." });
  }
  if (desiredSwr <= 0) {
    errors.push({ field: "desired_swr", message: "Desired SWR must be greater than 0." });
  }
  ["traditional_retirement_tax_rate", "brokerage_retirement_tax_rate"].forEach((fieldName) => {
    if (number(fieldName) > 100) {
      errors.push({ field: fieldName, message: "Tax rate cannot be greater than 100%." });
    }
  });
  if (mode === "percent" && savingsRateValue <= 0) {
    errors.push({ field: "savings_rate", message: "Savings rate must be greater than 0 in % mode." });
  }
  if (mode === "fixed" && fixedContributionValue <= 0) {
    errors.push({ field: "fixed_annual_contribution", message: "Fixed annual contribution must be greater than $0 in fixed mode." });
  }

  return errors;
}

function saveFormValues() {
  const payload = Object.fromEntries(new FormData(form).entries());
  localStorage.setItem(FORM_VALUES_KEY, JSON.stringify(payload));
}

function applySavedFormValues() {
  const saved = localStorage.getItem(FORM_VALUES_KEY);
  if (!saved) {
    return;
  }
  try {
    const values = JSON.parse(saved);
    Object.entries(values).forEach(([name, value]) => {
      const field = form.elements[name];
      if (!field) {
        return;
      }
      if (field instanceof RadioNodeList) {
        const radio = form.querySelector(`input[name="${name}"][value="${value}"]`);
        if (radio) {
          radio.checked = true;
        }
        return;
      }
      field.value = value;
    });
    logDebug("Loaded saved form values.");
  } catch (error) {
    logDebug("Failed to parse saved form values.", error);
  }
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
    clearFieldErrors();
    const validationErrors = validateForm(payload);
    if (validationErrors.length > 0) {
      validationErrors.forEach((validationError) => setFieldError(validationError.field, validationError.message));
      errorEl.textContent = validationErrors[0].message;
      logDebug("Client validation blocked submit.", { validationErrors });
      return;
    }

    const mode = form.elements["contribution_mode"].value;
    const fixedContributionValue = Number(parseCurrencyInput(form.elements["fixed_annual_contribution"].value || "0"));
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
    saveFormValues();
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

applySavedFormValues();

form.addEventListener("submit", handleSubmit);
form.querySelectorAll('input[name="contribution_mode"]').forEach((radio) => {
  radio.addEventListener("change", syncContributionMode);
  radio.addEventListener("change", saveFormValues);
});

form.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", () => {
    input.setAttribute("aria-invalid", "false");
    const inlineError = form.querySelector(`[data-error-for="${input.name}"]`);
    if (inlineError) {
      inlineError.textContent = "";
      inlineError.classList.remove("active");
    }
    saveFormValues();
  });
});

currencyInputs.forEach((input) => {
  input.value = formatCurrencyInput(input.value);
  input.addEventListener("input", () => {
    input.value = parseCurrencyInput(input.value);
  });
  input.addEventListener("blur", () => {
    input.value = formatCurrencyInput(input.value);
  });
  input.addEventListener("focus", () => {
    input.value = parseCurrencyInput(input.value);
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
if (inputsPanel) {
  inputsPanel.addEventListener("scroll", () => {
    inputsPanel.classList.toggle("scrolled", inputsPanel.scrollTop > 8);
  });
}
chartModeButtons.forEach((button) => {
  button.addEventListener("click", () => setChartMode(button.dataset.chartMode));
  button.setAttribute("aria-pressed", button.dataset.chartMode === selectedChartMode ? "true" : "false");
});
form.dispatchEvent(new Event("submit"));
