import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import { response } from "../lib/http";
import {
  newMonitorSession,
  setMonitorCookie,
  validMonitorSession,
  verifyMonitorCode,
} from "../lib/monitor/auth";
import { monitorData, recordCodeRequest } from "../lib/monitor/data";
import { GET } from "../app/api/monitor/data/route";
import { POST as login } from "../app/api/monitor/login/route";

test("monitor code creates a signed, expiring HTTP-only cookie", () => {
  process.env.MONITOR_SECRET_CODE = "a".repeat(64);
  assert.equal(verifyMonitorCode("a".repeat(64)), true);
  assert.equal(verifyMonitorCode("b".repeat(64)), false);
  const now = Date.now();
  const session = newMonitorSession(now);
  assert.equal(validMonitorSession(session, now), true);
  assert.equal(validMonitorSession(session, now + 8 * 60 * 60 * 1000 + 1000), false);
  assert.equal(validMonitorSession(session.slice(0, -1) + (session.endsWith("0") ? "1" : "0"), now), false);
  const cookie = setMonitorCookie(response({}), session).headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=strict/i);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=28800/);
});

test("monitor data requires a valid cookie before accessing providers", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Provider must not be called");
  });
  const result = await GET(new NextRequest("https://stream.example.com/api/monitor/data"));
  assert.equal(result.status, 401);
  assert.match(result.headers.get("cache-control")!, /no-store/);
});

test("monitor login accepts only the configured secret", async () => {
  process.env.APP_URL = "https://stream.example.com";
  process.env.MONITOR_SECRET_CODE = "a".repeat(64);
  const request = (secretCode: string) => new NextRequest("https://stream.example.com/api/monitor/login", {
    method: "POST",
    headers: { origin: "https://stream.example.com", "content-type": "application/json" },
    body: JSON.stringify({ secretCode }),
  });
  const denied = await login(request("b".repeat(64)));
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("set-cookie"), null);
  const accepted = await login(request("a".repeat(64)));
  assert.equal(accepted.status, 200);
  assert.match(accepted.headers.get("set-cookie")!, /HttpOnly/);
});

test("monitor lists every Sheet row and syncs the same eligibility snapshot used by auth", async (t) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  Object.assign(process.env, {
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@serviceaccount.example",
    GOOGLE_SHEET_ID: "test-sheet",
    GOOGLE_SHEET_RANGE: "'Allowlist'!B:E",
    GOOGLE_SHEET_CACHE_SECONDS: "15",
    RESEND_API_KEY: "sending-only-key",
    UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  });
  const commands: unknown[][] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    if (url === "https://redis.example.com") {
      const command = JSON.parse(options.body as string) as unknown[];
      commands.push(command);
      return Response.json({ result: command[0] === "PING" ? "PONG" : command[0] === "ZREVRANGE" ? [] : "OK" });
    }
    if (url === "https://api.resend.com/emails?limit=1") return new Response("", { status: 403 });
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-token", expires_in: 3600 });
    assert.match(url, /^https:\/\/sheets.googleapis.com\//);
    return Response.json({ values: [
      ["email", "name", "enabled"],
      ["one@example.com", "One", "TRUE"],
      ["two@example.com", "Two", "FALSE"],
      ["dupe@example.com", "Dupe", "TRUE"],
      ["dupe@example.com", "Dupe", "FALSE"],
    ] });
  });
  const first = await monitorData(false);
  assert.equal(first.health.redis.ok, true);
  assert.equal(first.health.sheet.ok, true);
  assert.equal(first.health.resend.ok, null);
  assert.deepEqual(first.access?.rows.map((row) => row.eligible), [true, false, false, false]);
  assert.equal(first.access?.rows.length, 4);
  assert.equal(commands.some((command) => command[0] === "SET"), false);
  const synced = await monitorData(true);
  assert.equal(synced.health.cache?.ok, true);
  const cache = commands.find((command) => command[0] === "SET")!;
  const members = JSON.parse(cache[2] as string);
  assert.deepEqual(Object.keys(members), ["one@example.com"]);
});

test("request log stores outcomes, email and timestamp but never a code", async (t) => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const command = JSON.parse(options.body as string);
    assert.equal(command[0], "EVAL");
    assert.equal(command[3], "event-stream:monitor:code-requests");
    const entry = JSON.parse(command[4]);
    assert.equal(entry.email, "viewer@example.com");
    assert.equal(entry.status, "accepted");
    assert.ok(!("code" in entry));
    assert.ok(!("token" in entry));
    assert.ok(!Number.isNaN(Date.parse(entry.at)));
    return Response.json({ result: 1 });
  });
  await recordCodeRequest("viewer@example.com", "accepted");
});
