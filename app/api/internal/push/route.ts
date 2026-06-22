import { NextRequest, NextResponse } from "next/server";
import { sendPushToEmployees } from "@/lib/webpush";
import { requireInternalPushAuth } from "@/lib/internal-auth";

export async function POST(request: NextRequest) {
  const authR = requireInternalPushAuth(request);
  if (!authR.ok) return authR.response;

  let body: {
    employeeIds?: number[];
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    icon?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds : [];
  if (!body.title || employeeIds.length === 0) {
    return NextResponse.json({ error: "employeeIds와 title이 필요합니다." }, { status: 400 });
  }

  const result = await sendPushToEmployees(employeeIds, {
    title: body.title,
    body: body.body,
    url: body.url,
    tag: body.tag,
    icon: body.icon,
  });
  return NextResponse.json({ ok: true, ...result });
}
