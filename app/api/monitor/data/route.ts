import { NextRequest } from "next/server";
import { input, response } from "@/lib/http";
import { MONITOR_COOKIE, validMonitorSession } from "@/lib/monitor/auth";
import { monitorData } from "@/lib/monitor/data";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  return validMonitorSession(request.cookies.get(MONITOR_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return response({ error: "Monitor access required." }, 401);
  return response(await monitorData(false));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return response({ error: "Monitor access required." }, 401);
  try {
    await input(request);
    return response(await monitorData(true));
  } catch {
    return response({ error: "Could not sync the monitor." }, 503);
  }
}
