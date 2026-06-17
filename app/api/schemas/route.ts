import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 한 앱의 작업 스키마 조회 (실패하면 빈 배열 — best-effort)
async function fetchSchemas(apiUrl?: string, token?: string): Promise<unknown[]> {
  if (!apiUrl || !token) return [];
  try {
    const res = await fetch(`${apiUrl}/api/internal/schemas`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// GET /api/schemas — 로그인 사용자에게 작업 스키마 전달 (재고 + 장비 병합, 카드 렌더링용)
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [inventory, equipment] = await Promise.all([
    fetchSchemas(process.env.INVENTORY_API_URL, process.env.MCP_API_TOKEN),
    fetchSchemas(process.env.EQUIPMENT_API_URL, process.env.EQUIP_MCP_TOKEN),
  ]);
  return NextResponse.json([...inventory, ...equipment]);
}
