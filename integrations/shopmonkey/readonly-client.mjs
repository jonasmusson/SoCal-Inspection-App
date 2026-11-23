/**
 * SoCal Hub — Shopmonkey read-only server connector.
 *
 * Design gate: NOT used by the live Inspection App and NOT a browser module.
 * Authentication is an operator-controlled secret stored on the server.
 * The only methods exported below issue GET requests. Never allow arbitrary
 * relative paths, methods or URLs from technician/browser input.
 *
 * Docs: https://shopmonkey.dev/quickstart
 */
export const SHOPMONKEY_API_ORIGIN = "https://api.shopmonkey.cloud";

export class ShopmonkeyReadError extends Error {
  constructor(status, retryAfterSeconds = null) {
    super(`Shopmonkey read request failed (HTTP ${status}).`);
    this.name = "ShopmonkeyReadError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function requiredId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new TypeError("Expected a nonempty Shopmonkey ID.");
  return encodeURIComponent(id);
}
function paging({ limit = 25, skip = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Limit must be between 1 and 100.");
  if (!Number.isSafeInteger(skip) || skip < 0)
    throw new RangeError("Skip must be a nonnegative integer.");
  return new URLSearchParams({ limit: String(limit), skip: String(skip) });
}

export function createShopmonkeyReadClient({
  token,
  fetchImpl = fetch,
  timeoutMs = 10000,
} = {}) {
  if (typeof window !== "undefined")
    throw new Error("Shopmonkey API client must run server-side only.");
  if (!token || typeof token !== "string")
    throw new Error("Shopmonkey server API credential has not been configured.");
  if (typeof fetchImpl !== "function") throw new TypeError("Invalid fetch function.");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000)
    throw new RangeError("Invalid timeout.");

  async function get(path, params) {
    // Only internal fixed paths reach here. Never accept arbitrary client URLs.
    const url = new URL(path, SHOPMONKEY_API_ORIGIN);
    if (params) url.search = params.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        const raw = Number(response.headers?.get?.("Retry-After"));
        const wait = response.status === 429 && Number.isFinite(raw) && raw > 0
          ? Math.min(raw, 3600) : null;
        // Do not echo response body: it may contain customer data or secrets.
        throw new ShopmonkeyReadError(response.status, wait);
      }
      const body = await response.json();
      if (!body || typeof body !== "object" || body.success === false)
        throw new Error("Shopmonkey returned an invalid read response.");
      return body;
    } finally { clearTimeout(timeout); }
  }

  return Object.freeze({
    /** Verifies the key without downloading customer data. */
    apiKeyStatus: () => get("/v3/auth/api_key/status"),
    /** Paginated orders; customer and vehicle IDs are mapped separately. */
    orders: (page) => get("/v3/order", paging(page)),
    order: (id) => get(`/v3/order/${requiredId(id)}`),
    customer: (id) => get(`/v3/customer/${requiredId(id)}`),
    customerVehicles: (id) => get(`/v3/customer/${requiredId(id)}/vehicle`),
    vehicle: (id) => get(`/v3/vehicle/${requiredId(id)}`),
    /** Keep payroll attendance distinct from worksheet/project billing hours. */
    timesheets: (page) => get("/v3/timesheet", paging(page)),
    timesheet: (id) => get(`/v3/timesheet/${requiredId(id)}`),
  });
}

/**
 * Read a bounded page into a provider-independent ID handoff.
 * Never silently match on VIN, customer name or descriptive text alone.
 */
export function orderLinkCandidates(response) {
  if (!response || !Array.isArray(response.data))
    throw new TypeError("Expected Shopmonkey order list data.");
  return response.data.map(order => ({
    source: "shopmonkey",
    orderId: String(order.id ?? ""),
    customerId: order.customerId ? String(order.customerId) : null,
    vehicleId: order.vehicleId ? String(order.vehicleId) : null,
    locationId: order.locationId ? String(order.locationId) : null,
    orderNumber: order.number == null ? null : String(order.number),
    reviewRequired: !order.id || !order.vehicleId,
  }));
}
