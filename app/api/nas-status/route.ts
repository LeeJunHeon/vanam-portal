import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getContainers, getCpu, getDisk, getRam, getUptimeDays } from "@/lib/nas-monitor";

export const runtime = "nodejs";        // /proc·statfs·TCP 체크 사용
export const dynamic = "force-dynamic";

// NAS 리소스 + 컨테이너 상태.
// 수집·캐시는 lib/nas-monitor.ts 가 맡는다 (CPU 는 최근 10초 평균, 헬스체크는 8초 재사용).
// 화면에서는 useNasStatus 훅 한 곳만 이 API 를 부른다.
export async function GET() {
  // 앞단(proxy) 검사가 우회되는 경우 대비 — 로그인 사용자만
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [cpu, disk, containers] = await Promise.all([getCpu(), getDisk(), getContainers()]);

    return NextResponse.json(
      {
        cpu: cpu.cpu,                       // 계산 불가면 null
        ioWait: cpu.ioWait,
        cpuWindowSec: cpu.cpuWindowSec,
        sampledAt: cpu.sampledAt,
        ram: getRam(),
        disk,
        uptimeDays: getUptimeDays(),
        containers: containers.containers,
        containersCheckedAt: new Date(containers.at).toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("nas-status error:", error);
    return NextResponse.json(
      { error: "조회 실패" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
