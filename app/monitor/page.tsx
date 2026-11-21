import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MONITOR_COOKIE, validMonitorSession } from "@/lib/monitor/auth";
import MonitorClient from "./MonitorClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Access monitor | IDSW 2026",
  robots: { index: false, follow: false },
};

export default async function MonitorPage() {
  const cookieStore = await cookies();
  const authorized = validMonitorSession(cookieStore.get(MONITOR_COOKIE)?.value);
  return <MonitorClient initialAuthorized={authorized} />;
}
