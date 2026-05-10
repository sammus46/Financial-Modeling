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
const goalModeToggleButton = document.getElementById("goal-mode-toggle");
const contributionHarmonizeButton = document.getElementById("contribution-harmonize-btn");
const contributionSplitInputs = Array.from(form.querySelectorAll("[data-contribution-split]"));
const contributionSplitErrorEl = document.getElementById("contribution_split_error");
const contributionSplitLabels = {
  traditional: form.querySelector('[data-contribution-split-label="traditional"]'),
  roth: form.querySelector('[data-contribution-split-label="roth"]'),
  brokerage: form.querySelector('[data-contribution-split-label="brokerage"]'),
};

let savingsRateInput;
let fixedContributionInput;
let portfolioChart;
let latestChartData = null;
let selectedChartMode = "balance";
let selectedGoalMode = "static";
let contributionSplitMode = "percent";
let contributionSplitValuesByMode = {
  percent: null,
  fixed: null,
};

const THEME_KEY = "financial-modeling-theme";
const FORM_VALUES_KEY = "retirement-form-values-v1";
const GOAL_MODE_KEY = "retirement-goal-mode-v1";
const CONTRIBUTION_SPLIT_STATE_KEY = "__contribution_split_values_by_mode";
const CALCULATE_TIMEOUT_MS = 20000;
const CONTRIBUTION_SPLIT_TOLERANCE = 0.01;
const DEFAULT_CONTRIBUTION_SPLIT_RATIOS = [0.34, 0.33, 0.33];
const CONTRIBUTION_SPLIT_FIELDS = contributionSplitInputs.map((input) => input.name);

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
    crossoverColor: getComputedColor("--chart-crossover") || "#16a34a",
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
    renderChart(
      latestChartData.ages,
      latestChartData.postTaxBalances,
      latestChartData.goalLine,
      latestChartData.dynamicGoalLine,
      latestChartData.monteCarlo,
    );
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

function renderChart(ages, postTaxBalances, goalLine, dynamicGoalLine, monteCarlo = null) {
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
    dynamicGoals: dynamicGoalLine.length,
  });

  const theme = getChartTheme();
  const selectedGoalLine = selectedGoalMode === "dynamic" ? dynamicGoalLine : goalLine;
  const goalSeriesLabel = selectedGoalMode === "dynamic" ? "Dynamic Goal" : "Retirement Goal";
  const usingProbability = selectedChartMode === "probability" && monteCarlo?.path_percentiles;
  const probabilityP10 = usingProbability ? monteCarlo.path_percentiles.p10 : [];
  const probabilityP50 = usingProbability ? monteCarlo.path_percentiles.p50 : [];
  const probabilityP90 = usingProbability ? monteCarlo.path_percentiles.p90 : [];
  const chartSeries =
    selectedChartMode === "gap"
      ? postTaxBalances.map((value, index) => value - selectedGoalLine[index])
      : selectedChartMode === "progress"
        ? postTaxBalances.map((value, index) => (selectedGoalLine[index] > 0 ? (value / selectedGoalLine[index]) * 100 : 0))
        : usingProbability
          ? probabilityP50
        : postTaxBalances;
  const benchmarkSeries =
    selectedChartMode === "gap"
      ? selectedGoalLine.map(() => 0)
      : selectedChartMode === "progress"
        ? selectedGoalLine.map(() => 100)
        : selectedGoalLine;
  const gapSeries = chartSeries.map((value, index) => value - (benchmarkSeries[index] ?? 0));
  const crossoverIndexes = gapSeries.reduce((indexes, value, index) => {
    if (!Number.isFinite(value)) {
      return indexes;
    }

    if (value === 0) {
      indexes.push(index);
      return indexes;
    }

    if (index === 0) {
      return indexes;
    }

    const previous = gapSeries[index - 1];
    if (!Number.isFinite(previous) || previous === 0) {
      return indexes;
    }

    if ((previous < 0 && value > 0) || (previous > 0 && value < 0)) {
      indexes.push(index);
    }

    return indexes;
  }, []);
  const chartLabel =
    selectedChartMode === "gap"
      ? "Gap vs Retirement Goal"
      : selectedChartMode === "progress"
        ? "Goal Progress"
        : selectedChartMode === "probability"
          ? "Monte Carlo Median Path"
        : "Portfolio Value (Post-Tax)";
  const yTickFormatter =
    selectedChartMode === "gap"
      ? (value) => `${value >= 0 ? "+" : "-"}${currency(Math.abs(value))}`
      : selectedChartMode === "progress"
        ? (value) => `${Number(value).toFixed(0)}%`
        : (value) => currency(value);
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
          data: benchmarkSeries,
          borderColor: theme.goalLine,
          borderDash: [8, 6],
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
          label: goalSeriesLabel,
        },
        {
          label: "Crossover Point",
          data: ages.map((_, index) => (crossoverIndexes.includes(index) ? chartSeries[index] : null)),
          borderColor: theme.crossoverColor,
          backgroundColor: theme.crossoverColor,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: "circle",
          showLine: false,
        },
        ...(usingProbability
          ? [
              {
                label: "P10 Path",
                data: probabilityP10,
                borderColor: "#dc2626",
                borderDash: [4, 4],
                fill: false,
                pointRadius: 0,
                borderWidth: 1.5,
                tension: 0.2,
              },
              {
                label: "P90 Path",
                data: probabilityP90,
                borderColor: "#16a34a",
                borderDash: [4, 4],
                fill: "-1",
                backgroundColor: "rgba(37, 99, 235, 0.12)",
                pointRadius: 0,
                borderWidth: 1.5,
                tension: 0.2,
              },
            ]
          : []),
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
            color: (tickContext) => (crossoverIndexes.includes(tickContext.index) ? theme.crossoverColor : theme.axisColor),
            font: (tickContext) => ({
              size: 13,
              weight: crossoverIndexes.includes(tickContext.index) ? "700" : "500",
            }),
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
            label: (context) => {
              if (context.dataset.label === "Crossover Point") {
                return ` Crossover at ${selectedChartMode === "progress" ? `${Number(context.parsed.y).toFixed(1)}%` : currency(context.parsed.y)}`;
              }

              if (selectedGoalMode === "dynamic" && ["gap", "progress"].includes(selectedChartMode) && context.dataset.label === goalSeriesLabel) {
                return ` Dynamic goal: ${currency(selectedGoalLine[context.dataIndex] || 0)}`;
              }

              return ` ${context.dataset.label}: ${
                selectedChartMode === "progress" ? `${Number(context.parsed.y).toFixed(1)}%` : currency(context.parsed.y)
              }`;
            },
            afterLabel: (context) => {
              if (context.dataset.label === "Crossover Point") {
                return " Actual and goal are equal at this point.";
              }

              if (selectedGoalMode === "dynamic" && ["gap", "progress"].includes(selectedChartMode) && context.dataset.label === goalSeriesLabel) {
                return "";
              }

              if (selectedChartMode === "progress") {
                if (context.dataset.label === goalSeriesLabel) {
                  return " Target reference line (100%).";
                }
                const progressDelta = context.parsed.y - 100;
                const direction = progressDelta >= 0 ? "Above" : "Below";
                return ` ${direction} target by ${Math.abs(progressDelta).toFixed(1)}%`;
              }
              if (selectedChartMode === "gap") {
                if (context.dataset.label === goalSeriesLabel) {
                  return " Goal reference line ($0 gap).";
                }
                const direction = context.parsed.y >= 0 ? "Ahead" : "Behind";
                return ` ${direction} goal by ${currency(Math.abs(context.parsed.y))}`;
              }
              if (context.dataset.label !== "Portfolio Value (Post-Tax)") {
                return "";
              }
              const goalValue = selectedGoalLine[context.dataIndex] || 0;
              const gap = context.parsed.y - goalValue;
              const direction = gap >= 0 ? "Ahead" : "Behind";
              return ` ${direction} goal by ${currency(Math.abs(gap))}`;
            },
          },
        },
      },
    },
  });

  latestChartData = { ages, postTaxBalances, goalLine, dynamicGoalLine, monteCarlo };
}

function setChartMode(mode) {
  selectedChartMode = mode;
  chartModeButtons.forEach((button) => {
    const isSelected = button.dataset.chartMode === mode;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (latestChartData) {
    renderChart(latestChartData.ages, latestChartData.postTaxBalances, latestChartData.goalLine, latestChartData.dynamicGoalLine, latestChartData.monteCarlo);
  }
}

function applyGoalModeToggleUi() {
  if (!goalModeToggleButton) {
    return;
  }
  const isDynamic = selectedGoalMode === "dynamic";
  goalModeToggleButton.classList.toggle("is-dynamic", isDynamic);
  goalModeToggleButton.textContent = isDynamic ? "Dynamic" : "Static";
  goalModeToggleButton.setAttribute("aria-checked", String(isDynamic));
}

function setGoalMode(mode) {
  selectedGoalMode = mode === "dynamic" ? "dynamic" : "static";
  localStorage.setItem(GOAL_MODE_KEY, selectedGoalMode);
  applyGoalModeToggleUi();
  if (latestChartData) {
    renderChart(latestChartData.ages, latestChartData.postTaxBalances, latestChartData.goalLine, latestChartData.dynamicGoalLine, latestChartData.monteCarlo);
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

  if (contributionSplitMode !== mode) {
    syncCurrentContributionSplitState();
    loadContributionSplitState(mode);
  }

  savingsRateInput.disabled = !usingPercent;
  fixedContributionInput.disabled = usingPercent;
  const contributionModeFieldset = form.querySelector(".contribution-mode");
  if (contributionModeFieldset) {
    contributionModeFieldset.dataset.mode = mode;
    contributionModeFieldset.querySelectorAll(".contribution-input-panel").forEach((panel) => {
      const panelMode = panel.dataset.contributionPanel;
      const isActivePanel = panelMode === mode;
      panel.hidden = !isActivePanel;
      panel.setAttribute("aria-hidden", String(!isActivePanel));
    });
  }

  syncContributionSplitLabels(mode);
  contributionSplitMode = mode;
  updateContributionHarmonizeButton(mode);
  refreshContributionSplitWarning();
}

function formatDecimalValue(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(2)).toString();
}

function parseCurrencyInput(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  const [whole, ...decimalParts] = cleaned.split(".");
  const numeric = decimalParts.length > 0 ? `${whole}.${decimalParts.join("")}` : whole;
  return numeric === "" ? "" : numeric;
}

function formatCurrencyInput(value) {
  const numeric = parseCurrencyInput(value);
  if (numeric === "") {
    return "";
  }

  const [whole, decimal] = numeric.split(".");
  const withCommas = Number(whole || 0).toLocaleString("en-US");
  if (decimal !== undefined && decimal !== "") {
    return `$${withCommas}.${decimal.slice(0, 2)}`;
  }
  return `$${withCommas}`;
}

function formatCurrencyValue(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const rounded = Number(value.toFixed(2));
  return formatCurrencyInput(Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2));
}

function parseContributionNumber(value) {
  const raw = String(value ?? "").trim();
  const numeric = parseCurrencyInput(raw);
  if (numeric === "") {
    return raw === "" ? 0 : Number.NaN;
  }
  return Number(numeric);
}

function formatContributionSplitValue(value, mode) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (mode === "fixed") {
    return formatCurrencyValue(value);
  }
  return formatDecimalValue(value);
}

function getContributionTotalFromFields(mode) {
  if (mode === "fixed") {
    return parseContributionNumber(fixedContributionInput.value);
  }
  return parseContributionNumber(savingsRateInput.value);
}

function getContributionTotalFromPayload(payload, mode) {
  if (mode === "fixed") {
    return parseContributionNumber(payload.fixed_annual_contribution);
  }
  return parseContributionNumber(payload.savings_rate);
}

function getContributionSplitValuesFromInputs(mode) {
  return contributionSplitInputs.map((input) => parseContributionNumber(input.value, mode));
}

function getContributionSplitValuesFromPayload(payload, mode) {
  return CONTRIBUTION_SPLIT_FIELDS.map((fieldName) => parseContributionNumber(payload[fieldName], mode));
}

function setContributionSplitValues(values, mode) {
  contributionSplitInputs.forEach((input, index) => {
    input.value = formatContributionSplitValue(values[index], mode);
  });
}

function getDefaultContributionSplitValues(mode) {
  const total = getContributionTotalFromFields(mode);
  if (!Number.isFinite(total) || total <= 0) {
    return [0, 0, 0];
  }
  return DEFAULT_CONTRIBUTION_SPLIT_RATIOS.map((ratio) => ratio * total);
}

function normalizeContributionSplitStateValues(values, mode) {
  if (!Array.isArray(values) || values.length !== contributionSplitInputs.length) {
    return null;
  }
  const normalizedValues = values.map((value) => parseContributionNumber(value, mode));
  if (normalizedValues.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return normalizedValues;
}

function syncCurrentContributionSplitState() {
  if (!["percent", "fixed"].includes(contributionSplitMode)) {
    return;
  }
  contributionSplitValuesByMode[contributionSplitMode] = getContributionSplitValuesFromInputs(contributionSplitMode);
}

function initializeContributionSplitState() {
  const mode = form.elements["contribution_mode"].value;
  const currentValues = getContributionSplitValuesFromInputs(mode);
  contributionSplitValuesByMode[mode] = currentValues;
  ["percent", "fixed"].forEach((stateMode) => {
    if (!contributionSplitValuesByMode[stateMode]) {
      contributionSplitValuesByMode[stateMode] =
        stateMode === mode ? currentValues : getDefaultContributionSplitValues(stateMode);
    }
  });
}

function loadContributionSplitState(mode) {
  const values = contributionSplitValuesByMode[mode] || getDefaultContributionSplitValues(mode);
  setContributionSplitValues(values, mode);
}

function getOppositeContributionMode(mode) {
  return mode === "fixed" ? "percent" : "fixed";
}

function applyContributionSplitRatiosFromMode(sourceMode, targetMode) {
  const sourceValues = contributionSplitValuesByMode[sourceMode] || getDefaultContributionSplitValues(sourceMode);
  const sourceTotal = sourceValues.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  const ratios =
    sourceTotal > 0
      ? sourceValues.map((value) => (Number.isFinite(value) ? value / sourceTotal : 0))
      : DEFAULT_CONTRIBUTION_SPLIT_RATIOS;
  const targetTotal = getContributionTotalFromFields(targetMode);
  const targetValues =
    Number.isFinite(targetTotal) && targetTotal > 0 ? ratios.map((ratio) => ratio * targetTotal) : [0, 0, 0];
  contributionSplitValuesByMode[targetMode] = targetValues;
  if (targetMode === contributionSplitMode) {
    setContributionSplitValues(targetValues, targetMode);
  }
}

function updateContributionHarmonizeButton(mode) {
  if (!contributionHarmonizeButton) {
    return;
  }
  contributionHarmonizeButton.textContent = mode === "fixed" ? "Match % split" : "Match fixed split";
  contributionHarmonizeButton.title =
    mode === "fixed" ? "Use the percent split proportions here" : "Use the fixed split proportions here";
}

function syncContributionSplitLabels(mode) {
  const suffix = mode === "fixed" ? "($ per year)" : "(% of income)";
  if (contributionSplitLabels.traditional) {
    contributionSplitLabels.traditional.textContent = `Traditional contribution ${suffix}`;
  }
  if (contributionSplitLabels.roth) {
    contributionSplitLabels.roth.textContent = `Roth contribution ${suffix}`;
  }
  if (contributionSplitLabels.brokerage) {
    contributionSplitLabels.brokerage.textContent = `Brokerage contribution ${suffix}`;
  }
  contributionSplitInputs.forEach((input) => {
    input.inputMode = "decimal";
    input.value = formatContributionSplitValue(parseContributionNumber(input.value), mode);
  });
}

function formatContributionTotalForMessage(value, mode) {
  if (mode === "fixed") {
    return formatCurrencyValue(value);
  }
  return `${formatDecimalValue(value)}%`;
}

function getContributionSplitValidation(payload) {
  const mode = payload.contribution_mode;
  if (!["percent", "fixed"].includes(mode)) {
    return null;
  }

  const total = getContributionTotalFromPayload(payload, mode);
  const values = getContributionSplitValuesFromPayload(payload, mode);
  const invalidValue = values.some((value) => !Number.isFinite(value));
  if (invalidValue) {
    return {
      field: "contribution_split",
      fields: CONTRIBUTION_SPLIT_FIELDS,
      message: "Traditional, Roth, and brokerage contributions must be valid numbers.",
    };
  }

  const negativeValue = values.some((value) => value < 0);
  if (negativeValue) {
    return {
      field: "contribution_split",
      fields: CONTRIBUTION_SPLIT_FIELDS,
      message: "Traditional, Roth, and brokerage contributions cannot be negative.",
    };
  }

  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  const contributionSplitTotal = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(contributionSplitTotal - total) > CONTRIBUTION_SPLIT_TOLERANCE) {
    return {
      field: "contribution_split",
      fields: CONTRIBUTION_SPLIT_FIELDS,
      message: `Traditional, Roth, and brokerage contributions must add up to ${formatContributionTotalForMessage(
        total,
        mode,
      )}. Current total is ${formatContributionTotalForMessage(contributionSplitTotal, mode)}.`,
    };
  }

  return null;
}

function setContributionSplitError(message) {
  contributionSplitInputs.forEach((input) => {
    input.setAttribute("aria-invalid", "true");
  });
  if (contributionSplitErrorEl) {
    contributionSplitErrorEl.textContent = message;
    contributionSplitErrorEl.classList.add("active");
  }
}

function clearContributionSplitError() {
  contributionSplitInputs.forEach((input) => {
    input.setAttribute("aria-invalid", "false");
  });
  if (contributionSplitErrorEl) {
    contributionSplitErrorEl.textContent = "";
    contributionSplitErrorEl.classList.remove("active");
  }
}

function refreshContributionSplitWarning() {
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.contribution_mode = form.elements["contribution_mode"].value;
  payload.savings_rate = savingsRateInput.value || "0";
  payload.fixed_annual_contribution = fixedContributionInput.value || "0";
  contributionSplitInputs.forEach((input) => {
    payload[input.name] = input.value;
  });

  const contributionSplitError = getContributionSplitValidation(payload);
  if (contributionSplitError) {
    setContributionSplitError(contributionSplitError.message);
    return;
  }
  clearContributionSplitError();
}

function prepareContributionAllocationPayload(payload) {
  const mode = payload.contribution_mode;
  const values = getContributionSplitValuesFromPayload(payload, mode);
  const contributionSplitTotal = values.reduce((sum, value) => sum + value, 0);
  CONTRIBUTION_SPLIT_FIELDS.forEach((fieldName, index) => {
    const allocationPct = contributionSplitTotal > 0 ? (values[index] / contributionSplitTotal) * 100 : 0;
    payload[fieldName] = String(allocationPct);
  });
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

function displayValidationError(validationError) {
  if (validationError.field === "contribution_split" || validationError.fields) {
    setContributionSplitError(validationError.message);
    return;
  }
  setFieldError(validationError.field, validationError.message);
}

function validateForm(payload) {
  const errors = [];
  const number = (fieldName) => Number(payload[fieldName] ?? 0);
  const currentAge = number("current_age");
  const retirementAge = number("retirement_age");
  const annualIncome = Number(parseCurrencyInput(payload.annual_income || "0"));
  const mode = payload.contribution_mode;
  const savingsRateValue = number("savings_rate");
  const fixedContributionValue = Number(parseCurrencyInput(payload.fixed_annual_contribution || "0"));

  if (currentAge < 0 || currentAge > 120) {
    errors.push({ field: "current_age", message: "Current age must be between 0 and 120." });
  }
  if (retirementAge < 1 || retirementAge > 130) {
    errors.push({ field: "retirement_age", message: "Retirement age must be between 1 and 130." });
  }
  if (retirementAge <= currentAge) {
    errors.push({ field: "retirement_age", message: "Retirement age must be greater than current age." });
  }
  if (retirementAge - currentAge > 100) {
    errors.push({ field: "retirement_age", message: "Years to retirement must be 100 or less." });
  }
  if (annualIncome <= 0) {
    errors.push({ field: "annual_income", message: "Annual income must be greater than 0." });
  }

  if (!["percent", "fixed"].includes(mode)) {
    errors.push({ field: "savings_rate", message: "Contribution mode must be either percent or fixed." });
  }
  if (mode === "percent") {
    if (savingsRateValue <= 0) {
      errors.push({ field: "savings_rate", message: "Savings rate must be greater than 0 when using percent mode." });
    }
    if (Math.abs(fixedContributionValue) > 0.000001) {
      errors.push({ field: "fixed_annual_contribution", message: "Fixed annual contribution must be 0 in percent mode." });
    }
  }
  if (mode === "fixed") {
    if (fixedContributionValue <= 0) {
      errors.push({ field: "fixed_annual_contribution", message: "Fixed annual contribution must be greater than 0 in fixed mode." });
    }
    if (Math.abs(savingsRateValue) > 0.000001) {
      errors.push({ field: "savings_rate", message: "Savings rate must be 0 in fixed mode." });
    }
  }

  [
    ["salary_growth_rate", "Salary growth rate must be between 0 and 100."],
    ["savings_rate", "Savings rate must be between 0 and 100."],
    ["inflation_rate", "Inflation rate must be between 0 and 100."],
    ["traditional_return_rate", "Traditional pre-tax return rate must be between 0 and 100."],
    ["roth_return_rate", "Roth pre-tax return rate must be between 0 and 100."],
    ["brokerage_return_rate", "Brokerage pre-tax return rate must be between 0 and 100."],
    ["retirement_spend_rate", "Retirement spending percent must be between 0 and 100."],
    ["desired_swr", "Desired SWR must be between 0 and 100."],
    ["traditional_retirement_tax_rate", "Traditional retirement tax rate must be between 0 and 100."],
    ["brokerage_retirement_tax_rate", "Brokerage retirement tax rate must be between 0 and 100."],
  ].forEach(([fieldName, message]) => {
    const value = number(fieldName);
    if (value < 0 || value > 100) {
      errors.push({ field: fieldName, message });
    }
  });

  if (Math.abs(number("desired_swr")) <= 0.000001) {
    errors.push({ field: "desired_swr", message: "Desired SWR must be greater than 0." });
  }

  const contributionSplitError = getContributionSplitValidation(payload);
  if (contributionSplitError) {
    errors.push(contributionSplitError);
  }

  ["traditional_assets", "roth_assets", "brokerage_assets"].forEach((fieldName) => {
    const value = Number(parseCurrencyInput(payload[fieldName] || "0"));
    if (value < 0) {
      errors.push({ field: fieldName, message: "Asset balances cannot be negative." });
    }
  });

  if (payload.enable_monte_carlo === true || payload.enable_monte_carlo === "true") {
    const trials = number("monte_carlo_trials");
    const returnStdDev = number("monte_carlo_return_stddev");
    const inflationStdDev = number("monte_carlo_inflation_stddev");
    if (trials < 100 || trials > 20000) {
      errors.push({ field: "monte_carlo_trials", message: "Monte Carlo trials must be between 100 and 20000." });
    }
    if (returnStdDev < 0 || returnStdDev > 100) {
      errors.push({ field: "monte_carlo_return_stddev", message: "Monte Carlo return std dev must be between 0 and 100." });
    }
    if (inflationStdDev < 0 || inflationStdDev > 100) {
      errors.push({ field: "monte_carlo_inflation_stddev", message: "Monte Carlo inflation std dev must be between 0 and 100." });
    }
  }

  if (payload.enable_contribution_escalation === true || payload.enable_contribution_escalation === "true") {
    const escalationRate = number("contribution_escalation_rate");
    if (escalationRate < 0 || escalationRate > 100) {
      errors.push({ field: "contribution_escalation_rate", message: "Contribution escalation rate must be between 0 and 100." });
    }
  }

  if (payload.enable_glidepath === true || payload.enable_glidepath === "true") {
    [
      ["glidepath_equity_start", "Glidepath equity start must be between 0 and 100."],
      ["glidepath_equity_end", "Glidepath equity end must be between 0 and 100."],
      ["glidepath_equity_return_rate", "Glidepath equity return must be between 0 and 100."],
      ["glidepath_bond_return_rate", "Glidepath bond return must be between 0 and 100."],
    ].forEach(([fieldName, message]) => {
      const value = number(fieldName);
      if (value < 0 || value > 100) {
        errors.push({ field: fieldName, message });
      }
    });
  }

  return errors;
}


function saveFormValues() {
  syncCurrentContributionSplitState();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload[CONTRIBUTION_SPLIT_STATE_KEY] = contributionSplitValuesByMode;
  localStorage.setItem(FORM_VALUES_KEY, JSON.stringify(payload));
}

function applySavedFormValues() {
  const saved = localStorage.getItem(FORM_VALUES_KEY);
  if (!saved) {
    return;
  }
  try {
    const values = JSON.parse(saved);
    const savedSplitState = values[CONTRIBUTION_SPLIT_STATE_KEY] || {};
    ["percent", "fixed"].forEach((mode) => {
      const splitValues = normalizeContributionSplitStateValues(savedSplitState[mode], mode);
      if (splitValues) {
        contributionSplitValuesByMode[mode] = splitValues;
      }
    });
    Object.entries(values).forEach(([name, value]) => {
      if (name === CONTRIBUTION_SPLIT_STATE_KEY) {
        return;
      }
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

function migrateLegacyContributionSplitValues() {
  const mode = form.elements["contribution_mode"].value;
  const values = getContributionSplitValuesFromInputs("percent");
  const splitTotal = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const activeTotal = getContributionTotalFromFields(mode);
  const looksLikeLegacyAllocation =
    values.every(Number.isFinite) &&
    Math.abs(splitTotal - 100) <= CONTRIBUTION_SPLIT_TOLERANCE &&
    Number.isFinite(activeTotal) &&
    activeTotal > 0 &&
    Math.abs(activeTotal - 100) > CONTRIBUTION_SPLIT_TOLERANCE;

  if (!looksLikeLegacyAllocation) {
    return;
  }

  setContributionSplitValues(
    values.map((value) => (value / 100) * activeTotal),
    mode,
  );
  logDebug("Migrated saved contribution allocation values to contribution split values.");
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
      validationErrors.forEach(displayValidationError);
      errorEl.textContent = validationErrors[0].message;
      logDebug("Client validation blocked submit.", { validationErrors });
      return;
    }

    const mode = form.elements["contribution_mode"].value;
    const fixedContributionValue = Number(parseCurrencyInput(form.elements["fixed_annual_contribution"].value || "0"));
    payload.savings_rate = mode === "percent" ? form.elements["savings_rate"].value || "0" : "0";
    payload.fixed_annual_contribution = mode === "fixed" ? String(fixedContributionValue) : "0";
    prepareContributionAllocationPayload(payload);
    payload.enable_monte_carlo = Boolean(form.elements["enable_monte_carlo"]?.checked);
    payload.enable_contribution_escalation = Boolean(form.elements["enable_contribution_escalation"]?.checked);
    payload.enable_glidepath = Boolean(form.elements["enable_glidepath"]?.checked);
    logDebug("Prepared payload.", payload);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CALCULATE_TIMEOUT_MS);
    const response = await fetch("/api/retirement/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => {
      window.clearTimeout(timeoutId);
    });
    logDebug("Received /api/retirement/calculate response.", { status: response.status, ok: response.ok });

    const responseType = response.headers.get("content-type") || "";
    let data = {};
    if (responseType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (parseError) {
        logDebug("Failed to parse /api/retirement/calculate response as JSON.", parseError);
        errorEl.textContent = "Server response was not valid JSON.";
        return;
      }
    } else {
      const textPayload = await response.text();
      logDebug("Received non-JSON /api/retirement/calculate response.", { responseType, textPayload });
      data.error = textPayload || "Server response format was unexpected.";
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

    renderChart(
      data.ages,
      data.post_tax_balances,
      data.goal_line,
      data.dynamic_goal_line || data.goal_line,
      data.monte_carlo || null,
    );
    renderStats(data.stats);
    renderSummary(data.stats);
    saveFormValues();
  } catch (_error) {
    logDebug("Unhandled error during calculate flow.", _error);
    errorEl.textContent =
      _error?.name === "AbortError"
        ? "Calculation timed out. Please check your connection and try again."
        : "Something went wrong while calculating. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Calculate";
    logDebug("Submit flow finished; button restored.");
  }
}

savingsRateInput = form.elements["savings_rate"];
fixedContributionInput = form.elements["fixed_annual_contribution"];

applySavedFormValues();
migrateLegacyContributionSplitValues();
initializeContributionSplitState();
contributionSplitMode = form.elements["contribution_mode"].value;

form.addEventListener("submit", handleSubmit);
form.querySelectorAll('input[name="contribution_mode"]').forEach((radio) => {
  radio.addEventListener("change", syncContributionMode);
  radio.addEventListener("change", saveFormValues);
});

if (contributionHarmonizeButton) {
  contributionHarmonizeButton.addEventListener("click", () => {
    const mode = form.elements["contribution_mode"].value;
    const sourceMode = getOppositeContributionMode(mode);
    syncCurrentContributionSplitState();
    applyContributionSplitRatiosFromMode(sourceMode, mode);
    refreshContributionSplitWarning();
    saveFormValues();
  });
}

form.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", () => {
    input.setAttribute("aria-invalid", "false");
    const inlineError = form.querySelector(`[data-error-for="${input.name}"]`);
    if (inlineError) {
      inlineError.textContent = "";
      inlineError.classList.remove("active");
    }
    if (
      input.matches("[data-contribution-split]") ||
      input.name === "savings_rate" ||
      input.name === "fixed_annual_contribution"
    ) {
      window.requestAnimationFrame(refreshContributionSplitWarning);
    }
    saveFormValues();
  });
});

contributionSplitInputs.forEach((input) => {
  input.addEventListener("input", () => {
    input.value = parseCurrencyInput(input.value);
    refreshContributionSplitWarning();
    saveFormValues();
  });
  input.addEventListener("focus", () => {
    if (contributionSplitMode === "fixed") {
      input.value = parseCurrencyInput(input.value);
    }
  });
  input.addEventListener("blur", () => {
    input.value = formatContributionSplitValue(parseContributionNumber(input.value), contributionSplitMode);
    refreshContributionSplitWarning();
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
setGoalMode(localStorage.getItem(GOAL_MODE_KEY) || "static");
chartModeButtons.forEach((button) => {
  button.addEventListener("click", () => setChartMode(button.dataset.chartMode));
  button.setAttribute("aria-pressed", button.dataset.chartMode === selectedChartMode ? "true" : "false");
});
if (goalModeToggleButton) {
  goalModeToggleButton.addEventListener("click", () => {
    setGoalMode(selectedGoalMode === "static" ? "dynamic" : "static");
  });
}
form.dispatchEvent(new Event("submit"));
