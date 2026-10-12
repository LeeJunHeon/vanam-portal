import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildMenuKey, isValidMenuKey, parseUsageBody } from "@/lib/launcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 런처·각 앱이 메뉴를 열 때 보내는 사용 기록 (sendBeacon 대응: 본문을 text 로 읽음)
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 2000) throw new Error("too_large");
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const usage = parseUsageBody(body);
  if (!usage) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const key = buildMenuKey(usage.app, usage.page, usage.id);

  // 한 문장 원자적 upsert, 날짜는 DB 에서 KST 로 계산
  await prisma.$executeRaw`
    INSERT INTO portal.launcher_usage_daily (user_email, menu_key, used_on, cnt, last_used_at)
    VALUES (${email}, ${key}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1, now())
    ON CONFLICT (user_email, menu_key, used_on)
    DO UPDATE SET cnt = portal.launcher_usage_daily.cnt + 1, last_used_at = now()
  `;

  return new NextResponse(null, { status: 204 });
}

// 자주 쓰는 메뉴 편집: 본인의 한 메뉴 사용 기록 지우기 (다시 쓰면 새로 쌓인다)
export async function DELETE(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 2000) throw new Error("too_large");
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const key = body && typeof body === "object" ? (body as Record<string, unknown>).key : undefined;
  if (!isValidMenuKey(key)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // 본인 기록만 (user_email 조건), 지운 행 수와 상관없이 204
  await prisma.$executeRaw`
    DELETE FROM portal.launcher_usage_daily WHERE user_email = ${email} AND menu_key = ${key}
  `;

  return new NextResponse(null, { status: 204 });
}
