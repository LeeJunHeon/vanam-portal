import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 챗봇 "스코프 조회" 프록시.
// 포털 세션 email을 x-acting-user-email로 주입해 HR 스코프 엔드포인트를 호출.
// 신원은 세션에서만(LLM/body 아님) → 위조 방지. MCP는 이 경로를 안 거친다.
// 인증 토큰 = HR_PORTAL_TOKEN (MCP의 HR_MCP_TOKEN과 별개, 포털만 보유).

// queryId → HR 내부 엔드포인트 매핑. 새 스코프 조회는 여기에만 추가한다.
const QUERY_ROUTES: Record<string, { path: string }> = {
  my_annual_leave: { path: "/api/internal/my-annual-leave" },
};

function errName(e: unknown): string {
  return typeof e === "object" && e && "name" in e ? (e as { name: string }).name : "";
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.HR_API_URL;
  const token = process.env.HR_PORTAL_TOKEN;
  if (!apiUrl || !token) {
    return NextResponse.json({ error: "hr_api_not_configured" }, { status: 500 });
  }

  let body: { queryId?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const queryId = typeof body.queryId === "string" ? body.queryId : "";
  const route = QUERY_ROUTES[queryId];
  if (!route) {
    return NextResponse.json({ error: "unknown_query" }, { status: 400 });
  }

  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};

  // 쿼리스트링은 화이트리스트로만 구성 — 임의 키 전달 금지.
  const qs = new URLSearchParams();
  if (queryId === "my_annual_leave") {
    const year = params.year;
    if (typeof year === "number" && Number.isInteger(year)) {
      qs.set("year", String(year));
    } else if (typeof year === "string" && /^\d{4}$/.test(year)) {
      qs.set("year", year);
    }
  }
  const url = qs.toString() ? `${apiUrl}${route.path}?${qs}` : `${apiUrl}${route.path}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-acting-user-email": email, // 세션 신원 주입(위조 방지)
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "hr_query_failed", status: upstream.status, detail: data },
        { status: upstream.status }
      );
    }
    return NextResponse.json({ ok: true, queryId, data });
  } catch (e: unknown) {
    const reason = errName(e) === "TimeoutError" ? "timeout" : "hr_unreachable";
    return NextResponse.json({ error: reason }, { status: 504 });
  }
}
