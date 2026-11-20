/**
 * Build-time switch between the two ways this app can run.
 *
 * - live (default): reads and writes through the Convex deployment.
 * - static (`VITE_DATA_MODE=static`): backend-free build used by the GitHub
 *   Pages deployment. Reads the checked-in snapshots in `src/data` only.
 *
 * The value is baked in by Vite, so it never changes at runtime.
 */
export const LIVE_MODE = import.meta.env.VITE_DATA_MODE !== "static";
