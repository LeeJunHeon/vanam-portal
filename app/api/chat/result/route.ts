import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJob } from "@/lib/chat-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId_required" }, { status: 400 });
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ status: "not_found" }, { status: 404 });
  return NextResponse.json({ status: job.status, content: job.content ?? null, error: job.error ?? null });
}
