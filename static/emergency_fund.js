const emergencyTableBody = document.querySelector("#emergency-table tbody");
const addRowButton = document.getElementById("add-row-btn");
const calculateButton = document.getElementById("calculate-emergency-btn");
const themeToggleButton = document.getElementById("emergency-theme-toggle");
const errorEl = document.getElementById("emergency-error");
const monthlyTotalEl = document.getElementById("monthly-total");
const coverageMonthsEl = document.getElementById("coverage-months");
const healthStatusEl = document.getElementById("health-status");
const monthlyCardEl = document.getElementById("emergency-monthly-card");
const coverageCardEl = document.getElementById("emergency-coverage-card");
const healthCardEl = document.getElementById("emergency-health-card");
const projectionTableBody = document.querySelector("#projection-table tbody");
const currentFundInput = document.getElementById("current_fund_amount");
const monthlyContributionInput = document.getElementById("monthly_contribution_amount");
const contributionMonthsInput = document.getElementById("contribution_months");
const emergencyNotesInput = document.getElementById("emergency_notes");
const totalWeeklyEl = document.getElementById("table-total-weekly");
const totalMonthlyEl = document.getElementById("table-total-monthly");

let emergencyChart;
let saveTimeoutId;
let latestProjectionData = null;

const DEFAULT_ROWS = [
  { expense_class: "Weekly Necessities", name: "Groceries", weekly_amount: "", monthly_amount: 900, enabled: true, active_period: "monthly" },
  { expense_class: "Weekly Necessities", name: "Gas", weekly_amount: "", monthly_amount: 200, enabled: true, active_period: "monthly" },
  { expense_class: "Transportation", name: "Auto Insurance", weekly_amount: "", monthly_amount: 133.33, enabled: true, active_period: "monthly" },
  { expense_class: "Financial Obligations", name: "Rent + renters insurance", weekly_amount: "", monthly_amount: 2000, enabled: true, active_period: "monthly" },
  { expense_class: "Financial Obligations", name: "Student loan payment", weekly_amount: "", monthly_amount: 61.4, enabled: true, active_period: "monthly" },
];
const DEFAULT_NOTES = "";
const STORAGE_KEY = "emergency-fund-form-v2";
const THEME_KEY = "financial-modeling-theme";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCurrencyInput(value) {
  const numeric = String(value ?? "").replace(/[^0-9.]/g, "");
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


function attachAutoGrow(textarea) {
  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", resize);
  window.requestAnimationFrame(resize);
}

function createCellInput(type, value, className = "") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  if (className) {
    input.className = className;
  }
  return input;
}

function createRow(row = {}) {
  const tr = document.createElement("tr");

  const enabledTd = document.createElement("td");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.checked = row.enabled ?? true;
  enabled.className = "enabled";
  enabledTd.appendChild(enabled);

  const classTd = document.createElement("td");
  const classInput = document.createElement("textarea");
  classInput.className = "table-text-field";
  classInput.rows = 1;
  classInput.value = row.expense_class ?? "";
  classTd.appendChild(classInput);
  attachAutoGrow(classInput);

  const nameTd = document.createElement("td");
  const nameInput = document.createElement("textarea");
  nameInput.className = "table-text-field";
  nameInput.rows = 1;
  nameInput.value = row.name ?? "";
  nameTd.appendChild(nameInput);
  attachAutoGrow(nameInput);

  const weeklyTd = document.createElement("td");
  const weeklyInput = createCellInput("text", formatCurrencyInput(row.weekly_amount ?? ""), "weekly currency-field");
  weeklyInput.inputMode = "decimal";
  weeklyTd.appendChild(weeklyInput);

  const monthlyTd = document.createElement("td");
  const monthlyInput = createCellInput("text", formatCurrencyInput(row.monthly_amount ?? ""), "monthly currency-field");
  monthlyInput.inputMode = "decimal";
  monthlyTd.appendChild(monthlyInput);

  const actionsTd = document.createElement("td");
  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "secondary-btn row-move-btn";
  moveUpBtn.textContent = "↑";
  moveUpBtn.ariaLabel = "Move expense row up";
  moveUpBtn.addEventListener("click", () => {
    const previousRow = tr.previousElementSibling;
    if (!previousRow) {
      return;
    }
    emergencyTableBody.insertBefore(tr, previousRow);
    saveState();
  });

  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "secondary-btn row-move-btn";
  moveDownBtn.textContent = "↓";
  moveDownBtn.ariaLabel = "Move expense row down";
  moveDownBtn.addEventListener("click", () => {
    const nextRow = tr.nextElementSibling;
    if (!nextRow) {
      return;
    }
    emergencyTableBody.insertBefore(nextRow, tr);
    saveState();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary-btn row-remove-btn";
  deleteBtn.textContent = "−";
  deleteBtn.ariaLabel = "Remove expense row";
  deleteBtn.addEventListener("click", () => {
    tr.remove();
    saveState();
    refreshTableTotals();
  });
  actionsTd.append(moveUpBtn, moveDownBtn, deleteBtn);

  const setActivePeriod = (period, shouldClearInactive = true) => {
    const weeklyActive = period === "weekly";
    weeklyInput.readOnly = !weeklyActive;
    monthlyInput.readOnly = weeklyActive;
    weeklyInput.classList.toggle("is-inactive", !weeklyActive);
    monthlyInput.classList.toggle("is-inactive", weeklyActive);
    tr.dataset.activePeriod = weeklyActive ? "weekly" : "monthly";
    if (shouldClearInactive) {
      if (weeklyActive) {
        monthlyInput.value = "";
      } else {
        weeklyInput.value = "";
      }
    }
  };

  const activePeriod =
    row.active_period ||
    ((row.weekly_amount ?? "") !== "" && Number(row.weekly_amount) > 0 ? "weekly" : "monthly");
  setActivePeriod(activePeriod, false);

  weeklyInput.addEventListener("focus", () => {
    setActivePeriod("weekly");
    saveState();
  });
  monthlyInput.addEventListener("focus", () => {
    setActivePeriod("monthly");
    saveState();
  });
  const attachCurrencyFormatting = (input) => {
    input.addEventListener("input", () => {
      const formatted = formatCurrencyInput(input.value);
      input.value = formatted;
      debounceSaveState();
      refreshTableTotals();
    });
    input.addEventListener("blur", () => {
      input.value = formatCurrencyInput(input.value);
      saveState();
    });
  };
  attachCurrencyFormatting(weeklyInput);
  attachCurrencyFormatting(monthlyInput);

  tr.append(enabledTd, classTd, nameTd, weeklyTd, monthlyTd, actionsTd);
  tr.addEventListener("input", () => {
    debounceSaveState();
    refreshTableTotals();
  });
  tr.addEventListener("change", saveState);
  emergencyTableBody.appendChild(tr);
}

function collectExpenses() {
  const rows = emergencyTableBody.querySelectorAll("tr");
  return Array.from(rows).map((row) => {
    const cells = row.querySelectorAll("td");
    return {
      enabled: cells[0].querySelector("input").checked,
      expense_class: cells[1].querySelector("textarea").value.trim(),
      name: cells[2].querySelector("textarea").value.trim(),
      weekly_amount: parseCurrencyInput(cells[3].querySelector("input").value),
      monthly_amount: parseCurrencyInput(cells[4].querySelector("input").value),
      active_period: row.dataset.activePeriod || "monthly",
    };
  });
}

function saveState() {
  const payload = {
    current_fund_amount: parseCurrencyInput(currentFundInput.value),
    monthly_contribution_amount: parseCurrencyInput(monthlyContributionInput.value),
    contribution_months: Number(contributionMonthsInput.value || 0),
    emergency_notes: emergencyNotesInput.value,
    expenses: collectExpenses(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function debounceSaveState() {
  window.clearTimeout(saveTimeoutId);
  saveTimeoutId = window.setTimeout(saveState, 150);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSummaryCardStatuses() {
  [monthlyCardEl, coverageCardEl, healthCardEl].forEach((card) => {
    card.classList.remove("status-good", "status-mid", "status-low");
  });
}

function applySummaryCardStatuses(result) {
  clearSummaryCardStatuses();
  const coverage = Number(result.coverage_months || 0);
  const status = coverage >= 6 ? "status-good" : coverage >= 3 ? "status-mid" : "status-low";
  [monthlyCardEl, coverageCardEl, healthCardEl].forEach((card) => card.classList.add(status));
}

function renderProjectionRows(projections) {
  projectionTableBody.innerHTML = "";
  projections.forEach((item) => {
    const row = document.createElement("tr");
    const gap = Number(item.projected_fund || 0) - item.target;
    const gapClass = gap >= 0 ? "gap-positive" : "gap-negative";
    row.innerHTML = `
      <td>${getProjectionLabel(item.months)}</td>
      <td>${formatCurrency(item.target)}</td>
      <td class="${gapClass}">${formatCurrency(gap)}</td>
    `;
    projectionTableBody.appendChild(row);
  });
}

function getProjectionLabel(months) {
  const baseDate = new Date();
  const projectedDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + months, 1);
  const month = projectedDate.toLocaleString("en-US", { month: "short" });
  const year = String(projectedDate.getFullYear()).slice(-2);
  return `${month} '${year}`;
}

function getChartTheme() {
  const computed = getComputedStyle(document.body);
  return {
    axisColor: computed.getPropertyValue("--axis-color").trim() || "#1e293b",
    gridColor: computed.getPropertyValue("--grid-color").trim() || "rgba(148, 163, 184, 0.22)",
  };
}

function renderChart(projections) {
  const chartEl = document.getElementById("emergencyChart");
  const labels = projections.map((item) => getProjectionLabel(item.months));
  const targets = projections.map((item) => item.target);
  const currentSeries = projections.map((item) => Number(item.projected_fund || 0));
  const theme = getChartTheme();

  if (emergencyChart) {
    emergencyChart.destroy();
  }

  emergencyChart = new Chart(chartEl, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Target",
          data: targets,
          backgroundColor: "rgba(37, 99, 235, 0.55)",
          borderColor: "#2563eb",
          borderWidth: 1,
        },
        {
          label: "Current Fund",
          type: "line",
          data: currentSeries,
          borderColor: "#f59e0b",
          borderWidth: 2,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: theme.axisColor,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: theme.axisColor,
          },
          grid: {
            color: theme.gridColor,
          },
        },
        y: {
          grid: {
            color: theme.gridColor,
          },
          ticks: {
            callback: (value) => formatCurrency(value),
            color: theme.axisColor,
          },
        },
      },
    },
  });
  latestProjectionData = { projections };
}

function renderSummary(result) {
  monthlyTotalEl.textContent = formatCurrency(result.total_monthly);
  coverageMonthsEl.textContent = `${result.coverage_months.toFixed(2)} months`;
  healthStatusEl.textContent = result.health_status;
  applySummaryCardStatuses(result);
  renderProjectionRows(result.projections);
  renderChart(result.projections);
}

function refreshTableTotals() {
  const expenses = collectExpenses().filter((expense) => expense.enabled);
  const totals = expenses.reduce(
    (acc, expense) => {
      const weeklyRaw = Number(expense.weekly_amount || 0);
      const monthlyRaw = Number(expense.monthly_amount || 0);
      const monthly = monthlyRaw > 0 ? monthlyRaw : weeklyRaw * 52 / 12;
      const weekly = weeklyRaw > 0 ? weeklyRaw : monthlyRaw > 0 ? monthlyRaw * 12 / 52 : 0;
      acc.weekly += weekly;
      acc.monthly += monthly;
      return acc;
    },
    { weekly: 0, monthly: 0 },
  );
  totalWeeklyEl.textContent = formatCurrency(totals.weekly);
  totalMonthlyEl.textContent = formatCurrency(totals.monthly);
}

async function calculateEmergencyFund() {
  errorEl.textContent = "";
  const currentFund = Number(parseCurrencyInput(currentFundInput.value) || 0);
  const monthlyContribution = Number(parseCurrencyInput(monthlyContributionInput.value) || 0);
  const contributionMonths = Number(contributionMonthsInput.value || 0);

  try {
    const response = await fetch("/api/emergency-fund/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_fund_amount: currentFund,
        monthly_contribution_amount: monthlyContribution,
        contribution_months: contributionMonths,
        expenses: collectExpenses(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to calculate emergency fund projections.");
    }

    renderSummary(data);
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

function initialize() {
  const state = loadState();
  const rows = state?.expenses?.length ? state.expenses : DEFAULT_ROWS;
  rows.forEach((row) => createRow(row));
  currentFundInput.value = formatCurrencyInput(state?.current_fund_amount ?? currentFundInput.value);
  monthlyContributionInput.value = formatCurrencyInput(state?.monthly_contribution_amount ?? monthlyContributionInput.value);
  contributionMonthsInput.value = String(Math.max(0, Number(state?.contribution_months ?? contributionMonthsInput.value || 0)));
  emergencyNotesInput.value = state?.emergency_notes ?? DEFAULT_NOTES;
  addRowButton.addEventListener("click", () => {
    createRow({ enabled: true, active_period: "monthly" });
    saveState();
  });
  calculateButton.addEventListener("click", calculateEmergencyFund);
  [currentFundInput, monthlyContributionInput, contributionMonthsInput, emergencyNotesInput].forEach((input) => {
    input.addEventListener("input", debounceSaveState);
    input.addEventListener("change", saveState);
  });
  currentFundInput.addEventListener("input", () => {
    currentFundInput.value = formatCurrencyInput(currentFundInput.value);
    debounceSaveState();
  });
  currentFundInput.addEventListener("blur", () => {
    currentFundInput.value = formatCurrencyInput(currentFundInput.value);
    saveState();
  });
  monthlyContributionInput.addEventListener("input", () => {
    monthlyContributionInput.value = formatCurrencyInput(monthlyContributionInput.value);
    debounceSaveState();
  });
  monthlyContributionInput.addEventListener("blur", () => {
    monthlyContributionInput.value = formatCurrencyInput(monthlyContributionInput.value);
    saveState();
  });
  contributionMonthsInput.addEventListener("input", () => {
    contributionMonthsInput.value = String(Math.max(0, Number(contributionMonthsInput.value || 0)));
    debounceSaveState();
  });
  initializeTheme();
  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", () => {
      const toDarkMode = !document.body.classList.contains("dark-mode");
      setTheme(toDarkMode ? "dark" : "light");
    });
  }
  saveState();
  refreshTableTotals();
  calculateEmergencyFund();
}

function setTheme(mode) {
  const isDark = mode === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  if (themeToggleButton) {
    themeToggleButton.textContent = isDark ? "Light mode" : "Dark mode";
    themeToggleButton.setAttribute("aria-pressed", String(isDark));
  }
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  if (latestProjectionData) {
    renderChart(latestProjectionData.projections);
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (preferredDark ? "dark" : "light"));
}

initialize();
