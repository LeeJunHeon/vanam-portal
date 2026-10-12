import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sanitizePrefsInput } from "@/lib/launcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 런처 배치 저장 (즐겨찾기·숨김·앱 순서)
export async function PUT(req: Request) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const prefs = sanitizePrefsInput(body);
  if (!prefs) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await prisma.launcherPrefs.upsert({
    where: { userEmail: email },
    create: { userEmail: email, ...prefs },
    update: { ...prefs, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
