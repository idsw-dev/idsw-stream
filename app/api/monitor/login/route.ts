import { NextRequest } from "next/server";
import { input, response } from "@/lib/http";
import { newMonitorSession, setMonitorCookie, verifyMonitorCode } from "@/lib/monitor/auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const body = await input(request);
    if (!verifyMonitorCode(body.secretCode))
      return response({ error: "Invalid monitor code." }, 401);
    return setMonitorCookie(response({ success: true }), newMonitorSession());
  } catch {
    return response({ error: "Monitor login unavailable." }, 503);
  }
}
