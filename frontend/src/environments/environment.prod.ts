// Production environment — replaced at build time by Angular file replacements
// API_BASE_URL is injected via Docker build arg → window.__env in index.html
export const environment = {
  production: true,
  // Falls back to same-origin /api if the runtime var is not injected
  apiBase: (window as any).__env?.API_BASE_URL ?? '/api',
};
