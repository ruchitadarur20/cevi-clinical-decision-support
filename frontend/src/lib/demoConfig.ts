/**
 * Portfolio-demo switch. `VITE_DEMO_MODE=true` (set by `npm run build:demo` / `.env.demo`) swaps the HTTP
 * transport for an in-browser data provider. When it is not "true", Vite statically removes every demo branch,
 * so the normal full-stack build is unchanged.
 */
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Optional, owner-supplied links. Left empty on purpose: the UI disables the actions until configured. */
export const demoLinks = {
  contact: clean(import.meta.env.VITE_DEMO_CONTACT_URL), // e.g. mailto:you@example.com or a scheduling/profile URL
  source: clean(import.meta.env.VITE_DEMO_REPO_URL), // public repository URL for this project
};
