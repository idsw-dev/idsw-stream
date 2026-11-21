import "server-only";
import { randomUUID } from "node:crypto";
import { integer, required } from "../config/server";
import { allowlistCacheKey, fetchSheetValues } from "../google-sheets/client";
import { parseAllowlist } from "../google-sheets/parse";
import { restCommand } from "../store/redis";

export type CodeRequestStatus =
  | "accepted"
  | "not_allowed"
  | "resend_failed"
  | "sheet_failed"
  | "store_failed"
  | "rate_limited"
  | "suppressed";
export type CodeRequestLog = {
  id: string;
  at: string;
  email: string;
  status: CodeRequestStatus;
};

const LOG_KEY = "event-stream:monitor:code-requests";
const LOG_LIMIT = 500;
const LOG_SECONDS = 7 * 24 * 60 * 60;

function redis() {
  return restCommand(
    required("UPSTASH_REDIS_REST_URL"),
    required("UPSTASH_REDIS_REST_TOKEN"),
  );
}

export async function recordCodeRequest(email: string, status: CodeRequestStatus) {
  const now = Date.now();
  const event: CodeRequestLog = { id: randomUUID(), at: new Date(now).toISOString(), email, status };
  await redis()<number>([
    "EVAL",
    "redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3]); local n = redis.call('ZCARD', KEYS[1]); if n > tonumber(ARGV[4]) then redis.call('ZREMRANGEBYRANK', KEYS[1], 0, n - tonumber(ARGV[4]) - 1) end; redis.call('EXPIRE', KEYS[1], ARGV[5]); return 1",
    1,
    LOG_KEY,
    JSON.stringify(event),
    now,
    now - LOG_SECONDS * 1000,
    LOG_LIMIT,
    LOG_SECONDS,
  ]);
}

async function redisHealth() {
  const reply = await redis()<string>(["PING"]);
  if (reply !== "PONG") throw new Error("Redis ping failed");
}

async function resendHealth() {
  const response = await fetch("https://api.resend.com/emails?limit=1", {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${process.env.RESEND_MONITOR_API_KEY?.trim() || required("RESEND_API_KEY")}` },
  });
  if (response.status === 403)
    return { ok: null, detail: "This API key cannot run the read check. It may have Sending access only. Use a full-access monitor key to verify this connection." };
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  return { ok: true, detail: "API read check passed" };
}

async function sheetData() {
  const values = await fetchSheetValues();
  const allowed = parseAllowlist(values);
  const headers = values[0].map((value) => String(value ?? ""));
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const emailIndex = normalizedHeaders.indexOf("email");
  const rows = values.slice(1).map((row, index) => {
    const cells = headers.map((_, column) => String(row?.[column] ?? ""));
    const email = cells[emailIndex].trim().toLowerCase();
    return { number: index + 2, cells, eligible: Boolean(allowed[email]) };
  });
  return { headers, rows, allowed };
}

async function readLogs() {
  const values = await redis()<string[]>(["ZREVRANGE", LOG_KEY, 0, LOG_LIMIT - 1]);
  return values.map((value) => JSON.parse(value) as CodeRequestLog);
}

function health(result: PromiseSettledResult<unknown>, label: string) {
  return result.status === "fulfilled"
    ? { ok: true, detail: "Connected" }
    : { ok: false, detail: `${label} check failed` };
}

export async function monitorData(sync: boolean) {
  const [redisResult, resendResult, sheetResult, logResult] = await Promise.allSettled([
    redisHealth(),
    resendHealth(),
    sheetData(),
    readLogs(),
  ]);
  let cache: { ok: boolean; detail: string } | undefined;
  if (sync && sheetResult.status === "fulfilled") {
    try {
      const seconds = integer("GOOGLE_SHEET_CACHE_SECONDS", 15, 0, 60);
      if (seconds > 0)
        await redis()(["SET", `event-stream:cache:${allowlistCacheKey()}`, JSON.stringify(sheetResult.value.allowed), "EX", seconds]);
      cache = { ok: true, detail: "App access cache refreshed" };
    } catch {
      cache = { ok: false, detail: "App access cache refresh failed" };
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    health: {
      redis: health(redisResult, "Redis"),
      resend: resendResult.status === "fulfilled" ? resendResult.value : health(resendResult, "Resend"),
      sheet: health(sheetResult, "Google Sheet"),
      ...(cache ? { cache } : {}),
    },
    access: sheetResult.status === "fulfilled"
      ? { headers: sheetResult.value.headers, rows: sheetResult.value.rows }
      : null,
    logs: logResult.status === "fulfilled" ? logResult.value : null,
  };
}
