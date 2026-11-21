import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const MONITOR_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-idsw-monitor"
    : "idsw-monitor";
const SESSION_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.MONITOR_SECRET_CODE?.trim();
  if (!value || value.length < 32)
    throw new Error("MONITOR_SECRET_CODE must contain at least 32 characters");
  return value;
}

function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function verifyMonitorCode(value: unknown) {
  if (typeof value !== "string" || value.length > 256) return false;
  const expected = createHash("sha256").update(secret()).digest();
  const actual = createHash("sha256").update(value).digest();
  return timingSafeEqual(expected, actual);
}

export function newMonitorSession(now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(payload)}`;
}

export function validMonitorSession(value: string | undefined, now = Date.now()) {
  if (!value || !/^\d{10,11}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value))
    return false;
  const parts = value.split(".");
  const expiresAt = Number(parts[0]);
  if (expiresAt <= Math.floor(now / 1000) || expiresAt > Math.floor(now / 1000) + SESSION_SECONDS)
    return false;
  const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`), "hex");
  const actual = Buffer.from(parts[2], "hex");
  return timingSafeEqual(expected, actual);
}

export function setMonitorCookie(result: NextResponse, value: string, clear = false) {
  result.cookies.set(MONITOR_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: clear ? 0 : SESSION_SECONDS,
  });
  return result;
}
