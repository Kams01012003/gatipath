export function isFrontendMockEnabled(env) {
  return Boolean(env?.DEV) && env?.VITE_GATIPATH_MOCK === "1";
}

export async function localApi(url, options) {
  if (import.meta.env.DEV && import.meta.env.VITE_GATIPATH_MOCK === "1") {
    const { mockLocalRequest } = await import("../api/mockTrains.js");
    return mockLocalRequest(url, options);
  }

  return fetch(url, options);
}
