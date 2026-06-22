import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// 서브앱(HR/재고/장비)이 /api/internal/push 호출 시 머신 토큰(PUSH_INTERNAL_TOKEN) 검증.
export type InternalAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function requireInternalPushAuth(request: Request): InternalAuthResult {
  const token = process.env.PUSH_INTERNAL_TOKEN;
  if (!token || token.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "PUSH_INTERNAL_TOKEN 미설정" }, { status: 500 }) };
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1]?.trim() ?? "";
  if (provided && safeStringEqual(provided, token)) return { ok: true };
  return { ok: false, response: NextResponse.json({ error: "인증 실패" }, { status: 401 }) };
}
