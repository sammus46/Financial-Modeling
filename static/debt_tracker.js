const debtTableBody = document.querySelector("#debt-table tbody");
const addDebtRowButton = document.getElementById("add-debt-row-btn");
const calculateDebtButton = document.getElementById("calculate-debt-btn");
const debtThemeToggle = document.getElementById("debt-theme-toggle");
const errorEl = document.getElementById("debt-error");
const strategySelect = document.getElementById("debt_strategy");
const monthlyBudgetInput = document.getElementById("monthly_debt_budget");
const horizonSlider = document.getElementById("horizon_slider");
const horizonLabel = document.getElementById("horizon_label");
const monthsToFreeEl = document.getElementById("months-to-free");
const totalInterestEl = document.getElementById("total-interest");
const recommendedOrderEl = document.getElementById("recommended-order");
const monthsCardEl = document.getElementById("debt-months-card");
const interestCardEl = document.getElementById("debt-interest-card");
const orderCardEl = document.getElementById("debt-order-card");
const rankedTableBody = document.querySelector("#debt-ranked-table tbody");

let debtChart;
let latestResult = null;
const THEME_KEY = "financial-modeling-theme";
const STORAGE_KEY = "debt-tracker-form-v1";

const currency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

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

function createInput(type, value = "", className = "") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  if (className) {
    input.className = className;
  }
  return input;
}

function createDebtRow(row = {}) {
  const tr = document.createElement("tr");
  const nameInput = createInput("text", row.name || "Debt");
  const balanceInput = createInput("text", formatCurrencyInput(row.balance || "0"), "currency-field");
  const aprInput = createInput("number", row.annual_interest_rate || "19.99");
  aprInput.step = "0.01";
  aprInput.min = "0";
  const minPaymentInput = createInput("text", formatCurrencyInput(row.minimum_payment || "35"), "currency-field");
  const deferredEnabled = createInput("checkbox", "");
  deferredEnabled.checked = Boolean(row.deferred_interest_enabled);
  const deferredDate = createInput("date", row.deferred_interest_date || "");
  deferredDate.disabled = !deferredEnabled.checked;
  const deferredRate = createInput("number", row.deferred_interest_rate || row.annual_interest_rate || "19.99");
  deferredRate.step = "0.01";
  deferredRate.min = "0";
  deferredRate.disabled = !deferredEnabled.checked;

  deferredEnabled.addEventListener("change", () => {
    deferredDate.disabled = !deferredEnabled.checked;
    deferredRate.disabled = !deferredEnabled.checked;
    saveState();
  });

  [balanceInput, minPaymentInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = formatCurrencyInput(input.value);
      saveState();
    });
  });
  [nameInput, aprInput, deferredDate, deferredRate].forEach((input) => input.addEventListener("change", saveState));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary-btn row-remove-btn";
  deleteBtn.textContent = "−";
  deleteBtn.addEventListener("click", () => {
    tr.remove();
    saveState();
  });

  const cells = [nameInput, balanceInput, aprInput, minPaymentInput, deferredEnabled, deferredDate, deferredRate];
  cells.forEach((el) => {
    const td = document.createElement("td");
    td.appendChild(el);
    tr.appendChild(td);
  });
  const actions = document.createElement("td");
  actions.appendChild(deleteBtn);
  tr.appendChild(actions);
  debtTableBody.appendChild(tr);
}

function collectDebts() {
  return Array.from(debtTableBody.querySelectorAll("tr")).map((row) => {
    const cells = row.querySelectorAll("td");
    return {
      name: cells[0].querySelector("input").value,
      balance: parseCurrencyInput(cells[1].querySelector("input").value),
      annual_interest_rate: Number(cells[2].querySelector("input").value || 0),
      minimum_payment: parseCurrencyInput(cells[3].querySelector("input").value),
      deferred_interest_enabled: cells[4].querySelector("input").checked,
      deferred_interest_date: cells[5].querySelector("input").value,
      deferred_interest_rate: Number(cells[6].querySelector("input").value || 0),
    };
  });
}

function renderRankedOrder(rankedOrder) {
  rankedTableBody.innerHTML = "";
  rankedOrder.forEach((item, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.name}</td>
      <td>${item.apr.toFixed(2)}%</td>
      <td>${currency(item.minimum_payment)}</td>
      <td>${item.deferred_interest_enabled ? item.deferred_interest_date || "Required" : "—"}</td>
    `;
    rankedTableBody.appendChild(row);
  });
}

function getSummaryStatus(result) {
  const payoffMonths = Number(result.months_to_debt_free || 0);
  const interest = Number(result.total_interest_paid || 0);
  const principal = Array.isArray(result.ranked_order)
    ? result.ranked_order.reduce((sum, item) => sum + Number(item.starting_balance || 0), 0)
    : 0;
  const interestRatio = principal > 0 ? interest / principal : 0;

  if (payoffMonths <= 24 && interestRatio <= 0.12) {
    return "status-good";
  }
  if (payoffMonths <= 60 && interestRatio <= 0.3) {
    return "status-mid";
  }
  return "status-low";
}

function applySummaryCardStatus(result) {
  const status = getSummaryStatus(result);
  [monthsCardEl, interestCardEl, orderCardEl].forEach((card) => {
    card.classList.remove("status-good", "status-mid", "status-low");
    card.classList.add(status);
  });
}

function renderTopThreeRecommendations(rankedOrder) {
  recommendedOrderEl.innerHTML = "";
  const top = rankedOrder.slice(0, 3);
  if (!top.length) {
    recommendedOrderEl.innerHTML = "<li>—</li>";
    return;
  }
  top.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item.name;
    recommendedOrderEl.appendChild(listItem);
  });
}

function renderChart(monthlyTotals, interestPaidOverTime, horizon) {
  const labels = monthlyTotals.slice(0, horizon).map((_, index) => index + 1);
  const values = monthlyTotals.slice(0, horizon);
  const interestSeries = interestPaidOverTime.slice(0, horizon);
  if (debtChart) {
    debtChart.destroy();
  }
  debtChart = new Chart(document.getElementById("debtChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Total Payments",
          data: values,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: "y",
        },
        {
          label: "Cumulative Interest Paid",
          data: interestSeries,
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.12)",
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y",
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
    },
  });
}

function renderResult(result) {
  latestResult = result;
  applySummaryCardStatus(result);
  const maxHorizon = Math.max(result.max_horizon_months, 1);
  horizonSlider.max = String(maxHorizon);
  horizonSlider.value = String(maxHorizon);
  horizonLabel.textContent = `Showing full max horizon (${maxHorizon} months).`;
  monthsToFreeEl.textContent = `${result.months_to_debt_free} months`;
  totalInterestEl.textContent = currency(result.total_interest_paid);
  renderTopThreeRecommendations(result.ranked_order);
  renderRankedOrder(result.ranked_order);
  renderChart(result.monthly_totals, result.interest_paid_over_time || [], maxHorizon);
}

async function calculateDebt() {
  errorEl.textContent = "";
  try {
    const response = await fetch("/api/debt-tracker/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: strategySelect.value,
        monthly_budget: parseCurrencyInput(monthlyBudgetInput.value),
        debts: collectDebts(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to calculate debt payoff.");
    }
    renderResult(data);
    saveState();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

function saveState() {
  const payload = {
    strategy: strategySelect.value,
    monthly_budget: parseCurrencyInput(monthlyBudgetInput.value),
    debts: collectDebts(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return null;
  }
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function setTheme(mode) {
  const isDark = mode === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  debtThemeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  debtThemeToggle.setAttribute("aria-pressed", String(isDark));
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (preferredDark ? "dark" : "light"));
}

function initialize() {
  const state = loadState();
  const rows = state?.debts?.length
    ? state.debts
    : [
        { name: "Credit Card A", balance: 4500, annual_interest_rate: 24.99, minimum_payment: 120, deferred_interest_enabled: false },
        { name: "Store Card Promo", balance: 2200, annual_interest_rate: 22.99, minimum_payment: 70, deferred_interest_enabled: true, deferred_interest_date: "2026-12-01", deferred_interest_rate: 29.99 },
      ];
  rows.forEach((row) => createDebtRow(row));
  strategySelect.value = state?.strategy || "avalanche";
  monthlyBudgetInput.value = formatCurrencyInput(state?.monthly_budget || monthlyBudgetInput.value);

  addDebtRowButton.addEventListener("click", () => createDebtRow({}));
  calculateDebtButton.addEventListener("click", calculateDebt);
  strategySelect.addEventListener("change", saveState);
  monthlyBudgetInput.addEventListener("input", () => {
    monthlyBudgetInput.value = formatCurrencyInput(monthlyBudgetInput.value);
    saveState();
  });
  horizonSlider.addEventListener("input", () => {
    if (!latestResult) {
      return;
    }
    const horizon = Number(horizonSlider.value || latestResult.max_horizon_months);
    horizonLabel.textContent = `Showing first ${horizon} months (${(horizon / 12).toFixed(1)} years).`;
    renderChart(latestResult.monthly_totals, latestResult.interest_paid_over_time || [], horizon);
  });
  debtThemeToggle.addEventListener("click", () => {
    const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
    setTheme(next);
  });
  initializeTheme();
  calculateDebt();
}

initialize();
