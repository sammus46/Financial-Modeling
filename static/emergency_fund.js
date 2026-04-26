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
const emergencyNotesInput = document.getElementById("emergency_notes");

let emergencyChart;
let saveTimeoutId;

const DEFAULT_ROWS = [
  { expense_class: "Weekly Necessities", name: "Groceries", weekly_amount: "", monthly_amount: 900, enabled: true, active_period: "monthly" },
  { expense_class: "Weekly Necessities", name: "Gas", weekly_amount: "", monthly_amount: 200, enabled: true, active_period: "monthly" },
  { expense_class: "Transportation", name: "Auto Insurance", weekly_amount: "", monthly_amount: 133.33, enabled: true, active_period: "monthly" },
  { expense_class: "Financial Obligations", name: "Rent + renters insurance", weekly_amount: "", monthly_amount: 2000, enabled: true, active_period: "monthly" },
  { expense_class: "Financial Obligations", name: "Student loan payment", weekly_amount: "", monthly_amount: 61.4, enabled: true, active_period: "monthly" },
];
const DEFAULT_NOTES = "";
const STORAGE_KEY = "emergency-fund-form-v2";
const THEME_KEY = "emergency-theme";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function createCellInput(type, value, className = "") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  if (className) {
    input.className = className;
  }
  if (type === "number") {
    input.step = "0.01";
    input.min = "0";
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
  classTd.appendChild(createCellInput("text", row.expense_class ?? ""));

  const nameTd = document.createElement("td");
  nameTd.appendChild(createCellInput("text", row.name ?? ""));

  const weeklyTd = document.createElement("td");
  const weeklyInput = createCellInput("number", row.weekly_amount ?? "", "weekly");
  weeklyTd.appendChild(weeklyInput);

  const monthlyTd = document.createElement("td");
  const monthlyInput = createCellInput("number", row.monthly_amount ?? "", "monthly");
  monthlyTd.appendChild(monthlyInput);

  const actionsTd = document.createElement("td");
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary-btn row-remove-btn";
  deleteBtn.textContent = "−";
  deleteBtn.ariaLabel = "Remove expense row";
  deleteBtn.addEventListener("click", () => {
    tr.remove();
    saveState();
  });
  actionsTd.appendChild(deleteBtn);

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

  tr.append(enabledTd, classTd, nameTd, weeklyTd, monthlyTd, actionsTd);
  tr.addEventListener("input", debounceSaveState);
  tr.addEventListener("change", saveState);
  emergencyTableBody.appendChild(tr);
}

function collectExpenses() {
  const rows = emergencyTableBody.querySelectorAll("tr");
  return Array.from(rows).map((row) => {
    const cells = row.querySelectorAll("td");
    return {
      enabled: cells[0].querySelector("input").checked,
      expense_class: cells[1].querySelector("input").value.trim(),
      name: cells[2].querySelector("input").value.trim(),
      weekly_amount: cells[3].querySelector("input").value,
      monthly_amount: cells[4].querySelector("input").value,
      active_period: row.dataset.activePeriod || "monthly",
    };
  });
}

function saveState() {
  const payload = {
    current_fund_amount: currentFundInput.value,
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

function renderProjectionRows(projections, currentFund) {
  projectionTableBody.innerHTML = "";
  projections.forEach((item) => {
    const row = document.createElement("tr");
    const gap = currentFund - item.target;
    row.innerHTML = `
      <td>${item.months} months</td>
      <td>${formatCurrency(item.target)}</td>
      <td>${formatCurrency(gap)}</td>
    `;
    projectionTableBody.appendChild(row);
  });
}

function renderChart(projections, currentFund) {
  const chartEl = document.getElementById("emergencyChart");
  const labels = projections.map((item) => `${item.months} months`);
  const targets = projections.map((item) => item.target);
  const currentSeries = projections.map(() => currentFund);

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
      scales: {
        y: {
          ticks: {
            callback: (value) => formatCurrency(value),
          },
        },
      },
    },
  });
}

function renderSummary(result, currentFund) {
  monthlyTotalEl.textContent = formatCurrency(result.total_monthly);
  coverageMonthsEl.textContent = `${result.coverage_months.toFixed(2)} months`;
  healthStatusEl.textContent = result.health_status;
  applySummaryCardStatuses(result);
  renderProjectionRows(result.projections, currentFund);
  renderChart(result.projections, currentFund);
}

async function calculateEmergencyFund() {
  errorEl.textContent = "";
  const currentFund = Number(currentFundInput.value || 0);

  try {
    const response = await fetch("/api/emergency-fund/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_fund_amount: currentFund,
        expenses: collectExpenses(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to calculate emergency fund projections.");
    }

    renderSummary(data, currentFund);
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

function initialize() {
  const state = loadState();
  const rows = state?.expenses?.length ? state.expenses : DEFAULT_ROWS;
  rows.forEach((row) => createRow(row));
  currentFundInput.value = state?.current_fund_amount ?? currentFundInput.value;
  emergencyNotesInput.value = state?.emergency_notes ?? DEFAULT_NOTES;
  addRowButton.addEventListener("click", () => {
    createRow({ enabled: true, active_period: "monthly" });
    saveState();
  });
  calculateButton.addEventListener("click", calculateEmergencyFund);
  [currentFundInput, emergencyNotesInput].forEach((input) => {
    input.addEventListener("input", debounceSaveState);
    input.addEventListener("change", saveState);
  });
  initializeTheme();
  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", () => {
      const toDarkMode = !document.body.classList.contains("dark-mode");
      setTheme(toDarkMode ? "dark" : "light");
    });
  }
  saveState();
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
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (preferredDark ? "dark" : "light"));
}

initialize();
