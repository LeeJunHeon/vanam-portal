import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/schemas — 로그인한 사용자에게 작업 스키마 목록 전달 (카드 렌더링용)
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiUrl = process.env.INVENTORY_API_URL;
  const mcpToken = process.env.MCP_API_TOKEN;
  if (!apiUrl || !mcpToken) {
    return NextResponse.json([], { status: 200 }); // 스키마 못 받아도 빈 배열(카드 최소 동작)
  }
  try {
    const res = await fetch(`${apiUrl}/api/internal/schemas`, {
      headers: { Authorization: `Bearer ${mcpToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
