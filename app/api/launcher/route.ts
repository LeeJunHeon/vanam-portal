import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { prefsFromStored } from "@/lib/launcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 런처 배치 + 메뉴별 사용 점수 (최근 60일, 반감기 14일)
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [row, rows] = await Promise.all([
    prisma.launcherPrefs.findUnique({ where: { userEmail: email } }),
    prisma.$queryRaw<Array<{ menu_key: string; score: number | null }>>`
      SELECT menu_key,
             SUM(cnt * power(0.5, (((now() AT TIME ZONE 'Asia/Seoul')::date - used_on)::float8 / 14))) AS score
        FROM portal.launcher_usage_daily
       WHERE user_email = ${email}
         AND used_on >= (now() AT TIME ZONE 'Asia/Seoul')::date - 60
       GROUP BY menu_key
    `,
  ]);

  const prefs = row
    ? prefsFromStored(row.pinned, row.hidden, row.appOrder)
    : { pinned: [], hidden: [], appOrder: [] };
  const scores: Record<string, number> = {};
  for (const r of rows) {
    const s = Number(r.score);
    if (Number.isFinite(s) && s > 0) scores[r.menu_key] = Math.round(s * 1000) / 1000;
  }

  return NextResponse.json(
    { prefs, scores },
    { headers: { "Cache-Control": "no-store" } },
  );
}
