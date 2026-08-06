import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary } from "@/lib/eligibility/service";

export const runtime = "nodejs";

export async function GET() {
  const appUser = await requireAppUser();
  const account = await getAccountSummary(appUser.id);
  return NextResponse.json({ account });
}
