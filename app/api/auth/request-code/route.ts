import { after, NextRequest } from "next/server";
import { auth } from "@/lib/server";
import { endpoint, input, requestIP, response } from "@/lib/http";
import { DeliveryError } from "@/lib/auth/service";
import { AccessError } from "@/lib/auth/errors";
import { normalizeEmail } from "@/lib/auth/validation";
import { recordCodeRequest, type CodeRequestStatus } from "@/lib/monitor/data";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return endpoint("request_code", async () => {
    const body = await input(request);
    const service = auth();
    let admission: Awaited<ReturnType<typeof service.requestCode>>;
    try {
      admission = await service.requestCode(body.email, requestIP(request));
    } catch (error) {
      if (error instanceof AccessError && error.status === 429) {
        const email = normalizeEmail(body.email);
        if (email)
          after(async () => {
            try {
              await recordCodeRequest(email, "rate_limited");
            } catch {
              console.error(JSON.stringify({ event: "monitor_log_failed" }));
            }
          });
      }
      throw error;
    }
    after(async () => {
      let status: CodeRequestStatus = "suppressed";
      if (admission.deliver) {
        try {
          status = await service.deliverCode(admission.email);
        } catch (error) {
          status = error instanceof DeliveryError
            ? error.stage === "sheet" ? "sheet_failed" : "resend_failed"
            : "store_failed";
          console.error(JSON.stringify({ event: "code_delivery_failed", stage: status }));
        }
      }
      try {
        await recordCodeRequest(admission.email, status);
      } catch {
        console.error(JSON.stringify({ event: "monitor_log_failed" }));
      }
    });
    return response({ success: true });
  });
}
