/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" builds the browser-only portfolio demo (see .env.demo). */
  readonly VITE_DEMO_MODE?: string;
  /** Optional owner-supplied "Request Full Demo" target (mailto: or https URL). */
  readonly VITE_DEMO_CONTACT_URL?: string;
  /** Optional owner-supplied public repository URL. */
  readonly VITE_DEMO_REPO_URL?: string;
}
