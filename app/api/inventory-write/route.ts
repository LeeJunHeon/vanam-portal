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
  const writeToken = process.env.INVENTORY_WRITE_TOKEN; // 쓰기(internal/inventory)용
  const mcpToken = process.env.MCP_API_TOKEN;           // 조회(internal/items)용
  if (!apiUrl || !writeToken) {
    return NextResponse.json({ error: "inventory_api_not_configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // itemName이 있으면 itemId는 시스템이 재확정하므로 필수가 아니다.
  // 둘 다 없으면 그대로 재고앱이 검증하도록 넘긴다(여기서 막지 않음).
  const itemName = typeof body.itemName === "string" ? body.itemName.trim() : "";
  if (!body?.txType) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // ── itemName → itemId 재확정 ───────────────────────────────────────────
  // 배경: gemma(LLM)가 멀티턴에서 제안 JSON의 itemId 숫자를 틀리는 경우가 있다.
  // 원칙 "LLM은 이름, 시스템은 ID": itemName이 있으면 LLM의 itemId를 신뢰하지 않고
  // 재고앱 조회 API로 정확한 itemId를 다시 찾아 확정한다. (입고/출고 공통 경로)
  let resolvedItemId: unknown = body.itemId;
  if (itemName) {
    // 조회 인증 토큰: 재고앱 조회 API(internal/items)는 requireInternalAuth가
    // MCP_API_TOKEN만 받는다(쓰기용 INVENTORY_WRITE_TOKEN은 거부). → 조회엔 mcpToken 사용.
    if (!mcpToken) {
      return NextResponse.json({ error: "MCP_API_TOKEN 미설정" }, { status: 500 });
    }
    let items: Array<{ id: number; name: string }>;
    try {
      const lookup = await fetch(
        `${apiUrl}/api/internal/items?search=${encodeURIComponent(itemName)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${mcpToken}` }, // 조회=MCP_API_TOKEN, 쓰기=INVENTORY_WRITE_TOKEN
          signal: AbortSignal.timeout(15000),
        }
      );
      if (lookup.status === 401 || lookup.status === 403) {
        return NextResponse.json({ error: "품목 조회 인증 실패" }, { status: 502 });
      }
      if (!lookup.ok) {
        const detail = await lookup.text();
        return NextResponse.json({ error: "item_lookup_failed", detail }, { status: 502 });
      }
      const parsed = await lookup.json();
      items = Array.isArray(parsed) ? parsed : [];
    } catch (e: unknown) {
      const name =
        typeof e === "object" && e && "name" in e ? (e as { name: string }).name : "";
      const reason = name === "TimeoutError" ? "timeout" : "item_lookup_unreachable";
      return NextResponse.json({ error: reason }, { status: 504 });
    }

    // 우선순위: ① 정확 일치(trim 후 ===) 1개 → ② 정확일치 없고 검색결과 1개 → ③ 그 외 400
    const exact = items.filter(
      (it) => typeof it?.name === "string" && it.name.trim() === itemName
    );
    if (exact.length === 1) {
      resolvedItemId = exact[0].id;
    } else if (exact.length === 0 && items.length === 1) {
      resolvedItemId = items[0].id;
    } else {
      return NextResponse.json(
        { error: "품목을 특정할 수 없습니다. 품목명을 더 정확히 말씀해 주세요." },
        { status: 400 }
      );
    }
  }

  // txDate 보강: 없으면 오늘 날짜(KST, YYYY-MM-DD)로 채움 (sv-SE 로케일이 YYYY-MM-DD 형식)
  // itemId는 항상 시스템이 확정한 값으로 덮어쓴다(LLM이 보낸 itemId는 무시).
  const bodyWithDate = {
    ...body,
    itemId: resolvedItemId,
    txDate: body.txDate ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  };

  try {
    const upstream = await fetch(`${apiUrl}/api/internal/inventory`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writeToken}`,
        "x-acting-user-email": email,   // ★ 세션 email만 사용 (클라이언트 body의 값은 무시, 신원 위조 방지)
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyWithDate),
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
