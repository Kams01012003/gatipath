/**
 * RailDisha public reviews storage adapter (Vercel Blob).
 *
 * Durable path (production): @vercel/blob with private JSON objects.
 * Credentials (never create here — connect in Vercel dashboard after approval):
 *   - Preferred on Vercel: connect a Private Blob store to the project (OIDC).
 *     Env present after connect: BLOB_STORE_ID (+ VERCEL_OIDC_TOKEN at runtime).
 *   - Outside Vercel / explicit token: BLOB_READ_WRITE_TOKEN
 *     (checkbox "Add a read-write token env var to this connection" when linking).
 *
 * Moderation:
 *   - New submissions are written under reviews/pending/ with status "pending".
 *   - Public GET only reads reviews/published/.
 *   - Approve/reject via POST /api/reviews/moderate using REVIEWS_MODERATION_TOKEN.
 *
 * Process memory is used ONLY when GATIPATH_REVIEWS_MEMORY=1 in non-production
 * offline tests. It is never treated as durable storage.
 */

const PENDING_PREFIX = "raildisha/reviews/pending/";
const PUBLISHED_PREFIX = "raildisha/reviews/published/";
const RATE_PREFIX = "raildisha/reviews/rate/";

const MAX_NAME = 60;
const MAX_COMMENT = 500;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 5;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const memory = {
  pending: new Map(),
  published: new Map(),
  rate: new Map(),
};

export function getReviewsLimits() {
  return {
    maxName: MAX_NAME,
    maxComment: MAX_COMMENT,
    rateLimitPerHour: RATE_LIMIT,
    dedupeWindowHours: 24,
  };
}

export function isBlobStorageConfigured(env = process.env) {
  // Official SDK auth (docs.vercel.com/vercel-blob/using-blob-sdk):
  // 1) BLOB_READ_WRITE_TOKEN — long-lived token (optional; for non-Vercel / CI)
  // 2) BLOB_STORE_ID + runtime VERCEL_OIDC_TOKEN — default when a Blob store
  //    is connected to the Vercel project. OIDC is injected at runtime and is
  //    not a durable dashboard secret, so "configured" means store id or RW token.
  const token = String(env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (token) return true;
  return Boolean(String(env.BLOB_STORE_ID || "").trim());
}

export function isMemoryTestStoreEnabled(env = process.env) {
  if (env.GATIPATH_REVIEWS_MEMORY !== "1") return false;
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") return false;
  return true;
}

export function getStorageCapability(env = process.env) {
  if (isBlobStorageConfigured(env)) {
    return {
      storageConfigured: true,
      submissionEnabled: true,
      backend: "vercel-blob",
      message: "",
    };
  }
  if (isMemoryTestStoreEnabled(env)) {
    return {
      storageConfigured: true,
      submissionEnabled: true,
      backend: "memory-test-only",
      message: "",
    };
  }
  return {
    storageConfigured: false,
    submissionEnabled: false,
    backend: "none",
    message: "Reviews are temporarily unavailable. Please try again later.",
  };
}

export function validateReviewInput({ rating, name, comment }) {
  const errors = [];
  const numeric = typeof rating === "number" ? rating : Number(rating);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    errors.push("Rating must be a whole number from 1 to 5.");
  }

  const displayName = typeof name === "string" ? name.trim() : "";
  if (!displayName) errors.push("A display name is required.");
  if (displayName.length > MAX_NAME) {
    errors.push(`Display name must be ${MAX_NAME} characters or fewer.`);
  }

  const text = typeof comment === "string" ? comment.trim() : "";
  if (text.length > MAX_COMMENT) {
    errors.push(`Review text must be ${MAX_COMMENT} characters or fewer.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      rating: numeric,
      name: displayName,
      comment: text,
    },
  };
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function publicReviewView(record) {
  return {
    id: record.id,
    rating: record.rating,
    name: escapeText(record.name),
    comment: record.comment ? escapeText(record.comment) : "",
    createdAt: record.createdAt,
  };
}

export function aggregatePublished(reviews) {
  if (!reviews.length) {
    return { average: null, count: 0 };
  }
  const total = reviews.reduce((sum, item) => sum + item.rating, 0);
  const average = Math.round((total / reviews.length) * 10) / 10;
  return { average, count: reviews.length };
}

function createId() {
  return `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function fingerprint({ name, rating, comment, clientKey }) {
  const raw = `${clientKey}|${name}|${rating}|${comment}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

async function loadBlobSdk() {
  return import("@vercel/blob");
}

async function listAll(prefix) {
  const blob = await loadBlobSdk();
  const items = [];
  let cursor;
  do {
    const page = await blob.list({ prefix, cursor, limit: 100 });
    items.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return items;
}

async function readJsonBlob(urlOrPathname) {
  const blob = await loadBlobSdk();
  // Prefer get() for private blobs when available; fall back to fetch of download URL.
  if (typeof blob.get === "function") {
    try {
      const result = await blob.get(urlOrPathname, { access: "private" });
      if (result?.stream) {
        const text = await new Response(result.stream).text();
        return JSON.parse(text);
      }
    } catch {
      // Fall through to fetch for SDK variants that return downloadUrl on list/head.
    }
  }
  const response = await fetch(urlOrPathname);
  if (!response.ok) {
    throw new Error("Unable to read review record from Blob storage.");
  }
  return response.json();
}

async function putJson(pathname, data) {
  const blob = await loadBlobSdk();
  return blob.put(pathname, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function deleteBlob(urlOrPathname) {
  const blob = await loadBlobSdk();
  await blob.del(urlOrPathname);
}

function memoryListPublished() {
  return [...memory.published.values()].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

export async function listPublishedReviews(env = process.env) {
  if (isMemoryTestStoreEnabled(env)) {
    return memoryListPublished();
  }
  if (!isBlobStorageConfigured(env)) {
    return [];
  }

  const listed = await listAll(PUBLISHED_PREFIX);
  const reviews = [];
  for (const item of listed) {
    try {
      const record = await readJsonBlob(item.url || item.pathname);
      if (record?.status === "published" && Number.isInteger(record.rating)) {
        reviews.push(record);
      }
    } catch {
      // Skip unreadable objects rather than failing the public page.
    }
  }
  return reviews.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function countRecentByFingerprint(fp, env) {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  if (isMemoryTestStoreEnabled(env)) {
    let count = 0;
    for (const [key, ts] of memory.rate.entries()) {
      if (key.startsWith(`${fp}:`) && ts >= cutoff) count += 1;
    }
    return count;
  }

  const listed = await listAll(`${RATE_PREFIX}${fp}/`);
  let count = 0;
  for (const item of listed) {
    const uploaded = item.uploadedAt ? new Date(item.uploadedAt).getTime() : 0;
    if (uploaded >= cutoff) count += 1;
  }
  return count;
}

async function hasRecentDuplicate(fp, env) {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  if (isMemoryTestStoreEnabled(env)) {
    for (const record of [...memory.pending.values(), ...memory.published.values()]) {
      if (record.fingerprint === fp && Date.parse(record.createdAt) >= cutoff) {
        return true;
      }
    }
    return false;
  }

  for (const prefix of [PENDING_PREFIX, PUBLISHED_PREFIX]) {
    const listed = await listAll(prefix);
    for (const item of listed) {
      try {
        const record = await readJsonBlob(item.url || item.pathname);
        if (record?.fingerprint === fp && Date.parse(record.createdAt) >= cutoff) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }
  return false;
}

export async function submitReview(
  { rating, name, comment, clientKey },
  env = process.env
) {
  const capability = getStorageCapability(env);
  if (!capability.submissionEnabled) {
    const error = new Error(capability.message);
    error.status = 503;
    error.code = "storage_unconfigured";
    throw error;
  }

  const validated = validateReviewInput({ rating, name, comment });
  if (!validated.ok) {
    const error = new Error(validated.errors.join(" "));
    error.status = 400;
    error.code = "validation_error";
    error.details = validated.errors;
    throw error;
  }

  const key = String(clientKey || "anonymous").slice(0, 128);
  const fp = fingerprint({ ...validated.value, clientKey: key });
  const rateFp = fingerprint({ name: "rate", rating: 0, comment: "", clientKey: key });

  if (await hasRecentDuplicate(fp, env)) {
    const error = new Error(
      "A similar review was already submitted recently. Please wait before submitting again."
    );
    error.status = 409;
    error.code = "duplicate_submission";
    throw error;
  }

  // Rate limit by client key bucket (not by review body).
  const rateCount = await countRecentByFingerprint(rateFp, env);
  if (rateCount >= RATE_LIMIT) {
    const error = new Error(
      "Too many review submissions from this browser recently. Please try again later."
    );
    error.status = 429;
    error.code = "rate_limited";
    throw error;
  }

  const record = {
    id: createId(),
    rating: validated.value.rating,
    name: validated.value.name,
    comment: validated.value.comment,
    status: "pending",
    createdAt: new Date().toISOString(),
    fingerprint: fp,
  };

  try {
    if (isMemoryTestStoreEnabled(env)) {
      memory.pending.set(record.id, record);
      memory.rate.set(`${rateFp}:${record.id}`, Date.now());
    } else {
      await putJson(`${PENDING_PREFIX}${record.id}.json`, record);
      await putJson(
        `${RATE_PREFIX}${rateFp}/${record.id}.json`,
        { id: record.id, createdAt: record.createdAt }
      );
    }
  } catch (storageError) {
    const error = new Error(
      "Reviews are temporarily unavailable. Please try again later."
    );
    error.status = 503;
    error.code = "storage_failure";
    error.cause = storageError;
    throw error;
  }

  return {
    id: record.id,
    status: "pending",
    message: "Thanks. Your review was received.",
  };
}

export async function moderateReview({ id, action }, env = process.env) {
  const token = String(env.REVIEWS_MODERATION_TOKEN || "").trim();
  if (!token) {
    const error = new Error(
      "Moderation is not configured. Set REVIEWS_MODERATION_TOKEN after Blob storage is connected."
    );
    error.status = 503;
    error.code = "moderation_unconfigured";
    throw error;
  }

  if (!id || !["publish", "reject"].includes(action)) {
    const error = new Error('Provide a review id and action "publish" or "reject".');
    error.status = 400;
    error.code = "validation_error";
    throw error;
  }

  if (isMemoryTestStoreEnabled(env)) {
    const pending = memory.pending.get(id);
    if (!pending) {
      const error = new Error("Pending review not found.");
      error.status = 404;
      throw error;
    }
    memory.pending.delete(id);
    if (action === "publish") {
      memory.published.set(id, { ...pending, status: "published" });
    }
    return { id, status: action === "publish" ? "published" : "rejected" };
  }

  if (!isBlobStorageConfigured(env)) {
    const error = new Error("Blob storage is not configured.");
    error.status = 503;
    throw error;
  }

  const pathname = `${PENDING_PREFIX}${id}.json`;
  let record;
  try {
    const listed = await listAll(PENDING_PREFIX);
    const match = listed.find(
      (item) => item.pathname === pathname || item.pathname?.endsWith(`${id}.json`)
    );
    if (!match) {
      const error = new Error("Pending review not found.");
      error.status = 404;
      throw error;
    }
    record = await readJsonBlob(match.url || match.pathname);
    if (action === "publish") {
      const published = { ...record, status: "published" };
      await putJson(`${PUBLISHED_PREFIX}${id}.json`, published);
    }
    await deleteBlob(match.url || match.pathname);
  } catch (err) {
    if (err.status) throw err;
    const error = new Error("Unable to moderate review due to a storage error.");
    error.status = 503;
    error.code = "storage_failure";
    throw error;
  }

  return { id, status: action === "publish" ? "published" : "rejected" };
}

/** Test-only helper to reset the in-memory store between offline cases. */
export function resetMemoryReviewStore() {
  memory.pending.clear();
  memory.published.clear();
  memory.rate.clear();
}

/** Test-only helper to seed a published review in memory. */
export function seedMemoryPublishedReview(record) {
  memory.published.set(record.id, { ...record, status: "published" });
}
