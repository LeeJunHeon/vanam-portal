import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToEmployees } from "@/lib/webpush";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const emp = await prisma.employee.findUnique({ where: { email }, select: { id: true } });
  if (!emp) return NextResponse.json({ error: "직원 매핑이 필요합니다." }, { status: 403 });

  const result = await sendPushToEmployees([emp.id], {
    title: "VanaM 테스트 알림",
    body: "포털 푸시가 정상적으로 동작합니다.",
    url: "/",
    tag: "push-test",
  });
  return NextResponse.json({ ok: true, targetEmployeeId: emp.id, ...result });
}
