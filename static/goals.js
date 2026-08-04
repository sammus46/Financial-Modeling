const GOALS_STORAGE_KEY = "financial-modeling-goals-v1";
const GLOBAL_THEME_KEY = "financial-modeling-theme";
const form = document.getElementById("goal-form");
const list = document.getElementById("goals-list");
const emptyState = document.getElementById("goals-empty");
const themeToggle = document.getElementById("dashboard-theme-toggle");
let goals = loadGoals();
let editingId = null;

function loadGoals() {
  try {
    const saved = JSON.parse(localStorage.getItem(GOALS_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (_error) {
    return [];
  }
}

function saveGoals() {
  localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
}

function formatAmount(value, options = {}) {
  const fractionDigits = Number.isInteger(Number(value)) ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.keepCents ? fractionDigits : 0,
    maximumFractionDigits: options.keepCents ? 2 : 0,
  }).format(value || 0);
}

function normalizeCurrencyValue(value) {
  const sanitized = String(value || "").replace(/[^\d.]/g, "");
  const parts = sanitized.split(".");
  const integerDigits = parts[0].replace(/^0+(?=\d)/, "");
  return {
    integerDigits,
    decimalDigits: parts.slice(1).join("").slice(0, 2),
    hasDecimal: parts.length > 1,
  };
}

function addThousandsSeparators(value) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCurrencyText(value) {
  const { integerDigits, decimalDigits, hasDecimal } = normalizeCurrencyValue(value);
  if (!integerDigits && !hasDecimal) return "";
  const dollars = integerDigits ? addThousandsSeparators(integerDigits) : "0";
  return `$${dollars}${hasDecimal ? `.${decimalDigits}` : ""}`;
}

function parseCurrency(value) {
  const { integerDigits, decimalDigits, hasDecimal } = normalizeCurrencyValue(value);
  if (!integerDigits && !decimalDigits) return Number.NaN;
  return Number(`${integerDigits || "0"}${hasDecimal ? `.${decimalDigits}` : ""}`);
}

function currencyCaretPosition(value, currencyCharacterCount) {
  if (currencyCharacterCount <= 0) return value.startsWith("$") ? 1 : 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/[\d.]/.test(value[index])) {
      seen += 1;
      if (seen >= currencyCharacterCount) return index + 1;
    }
  }
  return value.length;
}

function formatCurrencyInputWhileTyping(input) {
  const previousValue = input.value;
  const selectionStart = input.selectionStart ?? previousValue.length;
  const currencyCharactersBeforeCaret = (previousValue.slice(0, selectionStart).match(/[\d.]/g) || []).length;
  input.value = formatCurrencyText(previousValue);
  if (document.activeElement === input) {
    const nextCaret = currencyCaretPosition(input.value, currencyCharactersBeforeCaret);
    input.setSelectionRange(nextCaret, nextCaret);
  }
}

function formatCurrencyInput(input) {
  const amount = parseCurrency(input.value);
  input.value = Number.isFinite(amount) && amount >= 0 ? formatAmount(amount, { keepCents: true }) : "";
}

function progressFor(goal) {
  return Math.max(0, Math.min(100, (goal.current / goal.target) * 100));
}

function renderGoals() {
  list.replaceChildren();
  emptyState.hidden = goals.length > 0;
  document.getElementById("goal-count").textContent = `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`;
  const average = goals.length ? goals.reduce((sum, goal) => sum + progressFor(goal), 0) / goals.length : 0;
  document.getElementById("goals-average").textContent = `${Math.round(average)}%`;

  goals.forEach((goal) => {
    const progress = progressFor(goal);
    const card = document.createElement("article");
    card.className = "goal-card dashboard-card";
    card.innerHTML = `
      <div class="goal-card-top">
        <div><span class="goal-category"></span><h3></h3></div>
        <strong class="goal-percentage">${Math.round(progress)}%</strong>
      </div>
      <div class="goal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
        <span style="width: ${progress}%"></span>
      </div>
      <div class="goal-card-footer">
        <p><strong>${formatAmount(goal.current)}</strong> <span>of ${formatAmount(goal.target)}</span></p>
        <div><button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button></div>
      </div>`;
    card.querySelector("h3").textContent = goal.name;
    card.querySelector(".goal-category").textContent = goal.category;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => editGoal(goal.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteGoal(goal.id));
    list.append(card);
  });
}

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById("goal-form-title").textContent = "Add a goal";
  document.getElementById("goal-cancel").hidden = true;
}

function editGoal(id) {
  const goal = goals.find((item) => item.id === id);
  if (!goal) return;
  editingId = id;
  document.getElementById("goal-name").value = goal.name;
  document.getElementById("goal-category").value = goal.category;
  document.getElementById("goal-current").value = formatAmount(goal.current, { keepCents: true });
  document.getElementById("goal-target").value = formatAmount(goal.target, { keepCents: true });
  document.getElementById("goal-form-title").textContent = "Update goal";
  document.getElementById("goal-cancel").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteGoal(id) {
  goals = goals.filter((goal) => goal.id !== id);
  saveGoals();
  if (editingId === id) resetForm();
  renderGoals();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const goal = {
    id: editingId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    name: document.getElementById("goal-name").value.trim(),
    category: document.getElementById("goal-category").value,
    current: parseCurrency(document.getElementById("goal-current").value),
    target: parseCurrency(document.getElementById("goal-target").value),
  };
  if (!goal.name || !Number.isFinite(goal.current) || !Number.isFinite(goal.target) || goal.current < 0 || goal.target <= 0) return;
  goals = editingId ? goals.map((item) => item.id === editingId ? goal : item) : [goal, ...goals];
  saveGoals();
  resetForm();
  renderGoals();
});

document.getElementById("goal-cancel").addEventListener("click", resetForm);
["goal-current", "goal-target"].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("input", () => formatCurrencyInputWhileTyping(input));
  input.addEventListener("focus", () => formatCurrencyInputWhileTyping(input));
  input.addEventListener("blur", () => formatCurrencyInput(input));
});

function applyTheme(mode) {
  const dark = mode === "dark";
  document.body.classList.toggle("dark-mode", dark);
  themeToggle.textContent = dark ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(dark));
  localStorage.setItem(GLOBAL_THEME_KEY, dark ? "dark" : "light");
}

themeToggle.addEventListener("click", () => applyTheme(document.body.classList.contains("dark-mode") ? "light" : "dark"));
applyTheme(localStorage.getItem(GLOBAL_THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
renderGoals();
