const emergencyTableBody = document.querySelector("#emergency-table tbody");
const addRowButton = document.getElementById("add-row-btn");
const calculateButton = document.getElementById("calculate-emergency-btn");
const errorEl = document.getElementById("emergency-error");
const monthlyTotalEl = document.getElementById("monthly-total");
const coverageMonthsEl = document.getElementById("coverage-months");
const healthStatusEl = document.getElementById("health-status");
const projectionTableBody = document.querySelector("#projection-table tbody");
const currentFundInput = document.getElementById("current_fund_amount");

let emergencyChart;

const DEFAULT_ROWS = [
  { expense_class: "Weekly Necessities", name: "Groceries", weekly_amount: 200, monthly_amount: 900, notes: "", enabled: true },
  { expense_class: "Weekly Necessities", name: "Gas", weekly_amount: 40, monthly_amount: 200, notes: "", enabled: true },
  { expense_class: "Transportation", name: "Auto Insurance", weekly_amount: 31.25, monthly_amount: 133.33, notes: "Paid in full at beginning of year", enabled: true },
  { expense_class: "Financial Obligations", name: "Rent + renters insurance", weekly_amount: 500, monthly_amount: 2000, notes: "", enabled: true },
  { expense_class: "Financial Obligations", name: "Student loan payment", weekly_amount: 15.35, monthly_amount: 61.4, notes: "", enabled: true },
];

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
  weeklyTd.appendChild(createCellInput("number", row.weekly_amount ?? "", "weekly"));

  const monthlyTd = document.createElement("td");
  monthlyTd.appendChild(createCellInput("number", row.monthly_amount ?? "", "monthly"));

  const notesTd = document.createElement("td");
  notesTd.appendChild(createCellInput("text", row.notes ?? ""));

  const actionsTd = document.createElement("td");
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary-btn";
  deleteBtn.textContent = "Remove";
  deleteBtn.addEventListener("click", () => {
    tr.remove();
  });
  actionsTd.appendChild(deleteBtn);

  tr.append(enabledTd, classTd, nameTd, weeklyTd, monthlyTd, notesTd, actionsTd);
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
      notes: cells[5].querySelector("input").value.trim(),
    };
  });
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
  DEFAULT_ROWS.forEach((row) => createRow(row));
  addRowButton.addEventListener("click", () => createRow({ enabled: true }));
  calculateButton.addEventListener("click", calculateEmergencyFund);
  calculateEmergencyFund();
}

initialize();
