import { activityHandler } from "@/lib/live-activities/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = activityHandler("session");
export const PUT = POST;
export const DELETE = POST;
