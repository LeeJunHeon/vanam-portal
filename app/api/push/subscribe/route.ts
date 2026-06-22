import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type IncomingSub = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

async function resolveEmployeeId(): Promise<number | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const emp = await prisma.employee.findUnique({ where: { email }, select: { id: true } });
  return emp?.id ?? null;
}

export async function POST(request: NextRequest) {
  const empId = await resolveEmployeeId();
  if (empId === null) {
    return NextResponse.json({ error: "직원 매핑이 필요합니다." }, { status: 403 });
  }

  let sub: IncomingSub | undefined;
  try {
    const body = (await request.json()) as { subscription?: IncomingSub } & IncomingSub;
    sub = body.subscription ?? body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const userAgent = request.headers.get("user-agent");

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      employeeId: empId,
      endpoint,
      p256dhKey: p256dh,
      authKey,
      userAgent: userAgent ?? null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    update: {
      employeeId: empId,
      p256dhKey: p256dh,
      authKey,
      userAgent: userAgent ?? null,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let endpoint: string | undefined;
  try {
    const body = (await request.json()) as { endpoint?: string; subscription?: { endpoint?: string } };
    endpoint = body.endpoint ?? body.subscription?.endpoint;
  } catch {
    endpoint = undefined;
  }
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint가 필요합니다." }, { status: 400 });
  }
  await prisma.pushSubscription.updateMany({
    where: { endpoint },
    data: { isActive: false },
  });
  return NextResponse.json({ ok: true });
}
