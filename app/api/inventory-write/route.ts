import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";        // 재고앱 내부 API 도달 위해 Node 런타임 필수
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.INVENTORY_API_URL;
  const writeToken = process.env.INVENTORY_WRITE_TOKEN;
  if (!apiUrl || !writeToken) {
    return NextResponse.json({ error: "inventory_api_not_configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body?.txType || !body?.itemId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${apiUrl}/api/internal/inventory`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writeToken}`,
        "x-acting-user-email": email,   // ★ 세션 email만 사용 (클라이언트 body의 값은 무시, 신원 위조 방지)
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return NextResponse.json({ error: "inventory_error", detail }, { status: upstream.status });
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const name =
      typeof e === "object" && e && "name" in e ? (e as { name: string }).name : "";
    const reason = name === "TimeoutError" ? "timeout" : "inventory_unreachable";
    return NextResponse.json({ error: reason }, { status: 504 });
  }
}
