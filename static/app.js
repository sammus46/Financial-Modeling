/*
 * Legacy compatibility shim.
 * Canonical retirement frontend logic now lives in static/retirement.js.
 * If this file is accidentally referenced, load retirement.js to avoid split-brain behavior.
 */
(function loadCanonicalRetirementBundle() {
  if (window.__retirementBundleBootstrapped) {
    return;
  }
  window.__retirementBundleBootstrapped = true;

  const script = document.createElement("script");
  script.src = "/static/retirement.js";
  script.defer = true;
  document.head.appendChild(script);
})();
