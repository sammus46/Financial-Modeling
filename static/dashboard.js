const dashboardThemeToggle = document.getElementById("dashboard-theme-toggle");
const GLOBAL_THEME_KEY = "financial-modeling-theme";

function applyDashboardTheme(mode) {
  const isDark = mode === "dark";
  document.body.classList.toggle("dark-mode", isDark);

  if (dashboardThemeToggle) {
    dashboardThemeToggle.textContent = isDark ? "Light mode" : "Dark mode";
    dashboardThemeToggle.setAttribute("aria-pressed", String(isDark));
  }

  localStorage.setItem(GLOBAL_THEME_KEY, isDark ? "dark" : "light");
}

function initializeDashboardTheme() {
  const savedTheme = localStorage.getItem(GLOBAL_THEME_KEY);
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyDashboardTheme(savedTheme || (preferredDark ? "dark" : "light"));
}

if (dashboardThemeToggle) {
  dashboardThemeToggle.addEventListener("click", () => {
    const nextMode = document.body.classList.contains("dark-mode") ? "light" : "dark";
    applyDashboardTheme(nextMode);
  });
}

initializeDashboardTheme();
