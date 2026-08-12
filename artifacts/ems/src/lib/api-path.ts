const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const appBasePath = trimTrailingSlashes(import.meta.env.BASE_URL || "/");

/**
 * Optional cPanel API app prefix, for example `/hrmslive-api`.
 * When it is not set, the API is served under the same frontend prefix:
 * `/hrmslive/api` (or `/api` at the domain root).
 */
export const apiBasePath = trimTrailingSlashes(
  import.meta.env.VITE_API_BASE_PATH || appBasePath,
);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBasePath}/api${normalizedPath}` || `/api${normalizedPath}`;
}