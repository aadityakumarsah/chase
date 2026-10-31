import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import { settingsDashboard } from "@/lib/dashboard/queries";
import { sharedPromptSyncAvailable } from "@/lib/promptprs/actions";
import { hasAtLeast } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    {
      ...(await settingsDashboard(auth.businessId)),
      syncAvailable: await sharedPromptSyncAvailable(auth.businessId),
      canManage: hasAtLeast(auth.role, "admin"),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
