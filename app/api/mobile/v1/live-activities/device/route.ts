import { activityHandler } from "@/lib/live-activities/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = activityHandler("device");
export const PUT = GET;
export const DELETE = GET;
