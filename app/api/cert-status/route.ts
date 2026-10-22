import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCertStatus } from "@/lib/cert-check";

export const runtime = "nodejs";        // node:tls 사용
export const dynamic = "force-dynamic";

// HTTPS 인증서 상태 조회.
// 접속 대상은 서버 환경 변수로만 정한다. 요청에서 호스트·포트 등 어떤 값도 읽지 않는다 (내부망 탐색 방지).
// 서버가 결과를 6시간 캐시하므로 화면은 마운트 때 한 번만 부르면 된다.
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
    const result = await getCertStatus();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.warn("[cert-status] 조회 실패");
    return NextResponse.json(
      { error: "조회 실패" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
