import { vi } from "vitest";

export function installFailClosedFetch(handler) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });

    if (typeof handler === "function") {
      return handler(url, init, calls);
    }

    throw new Error(`Unexpected network request blocked: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

export function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

export function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}
