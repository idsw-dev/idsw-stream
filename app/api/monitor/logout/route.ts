import { NextRequest } from "next/server";
import { input, response } from "@/lib/http";
import { setMonitorCookie } from "@/lib/monitor/auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await input(request);
    return setMonitorCookie(response({ success: true }), "", true);
  } catch {
    return response({ error: "Could not sign out." }, 403);
  }
}
