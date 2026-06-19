import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SchemaStep { api: string; body: string[]; returns?: string; }
interface SchemaOp { id: string; label: string; app?: string; fields?: unknown[]; steps?: SchemaStep[]; }

function errName(e: unknown): string {
  return typeof e === "object" && e && "name" in e ? (e as { name: string }).name : "";
}

// POST /api/hr-write — 챗 근태 신청(쓰기) 프록시.
// 세션 이메일을 x-acting-user-email로 주입(본인 명의 보장) + HR_WRITE_TOKEN으로 HR write 호출.
// 스키마 주도: HR /api/internal/schemas에서 opId의 step을 찾아 그대로 실행.
// (id_ref·사진·작업자명 없음 — category는 enum이라 그대로 통과, 신원은 HR이 이메일로 처리)
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.HR_API_URL;
  const writeToken = process.env.HR_WRITE_TOKEN;
  const readToken = process.env.HR_PORTAL_TOKEN; // 스키마 조회용
  if (!apiUrl || !writeToken) {
    return NextResponse.json({ error: "hr_api_not_configured" }, { status: 500 });
  }
  if (!readToken) {
    return NextResponse.json({ error: "HR_PORTAL_TOKEN 미설정" }, { status: 500 });
  }

  let body: { opId?: unknown; values?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const opId = typeof body.opId === "string" ? body.opId : "";
  if (!opId) {
    return NextResponse.json({ error: "opId_required" }, { status: 400 });
  }
  const values: Record<string, unknown> =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : {};

  // 1. HR 스키마에서 opId 작업 찾기 (스키마 조회는 읽기 토큰)
  let schemas: SchemaOp[];
  try {
    const res = await fetch(`${apiUrl}/api/internal/schemas`, {
      method: "GET",
      headers: { Authorization: `Bearer ${readToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "스키마 조회 인증 실패" }, { status: 502 });
    }
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "schema_fetch_failed", detail }, { status: 502 });
    }
    const parsed = await res.json();
    schemas = Array.isArray(parsed) ? parsed : [];
  } catch (e: unknown) {
    const reason = errName(e) === "TimeoutError" ? "timeout" : "schema_unreachable";
    return NextResponse.json({ error: reason }, { status: 504 });
  }

  const op = schemas.find((s) => s?.id === opId);
  if (!op) {
    return NextResponse.json({ error: "알 수 없는 작업" }, { status: 400 });
  }

  // 2. steps 실행 (HR는 단일 step). 신원은 x-acting-user-email로만 주입(본인 명의).
  const steps = Array.isArray(op.steps) ? op.steps : [];
  const stepResults: Record<string, unknown> = {};
  let lastOut: unknown = null;

  for (const step of steps) {
    const parts = String(step.api ?? "").trim().split(/\s+/);
    const path = parts.length > 1 ? parts[1] : parts[0];

    const stepBody: Record<string, unknown> = {};
    const bodyKeys = Array.isArray(step.body) ? step.body : [];
    for (const entry of bodyKeys) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx >= 0) {
        const k = entry.slice(0, eqIdx);
        const raw = entry.slice(eqIdx + 1);
        stepBody[k] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      } else {
        const k = entry;
        if (stepResults[k] !== undefined) {
          stepBody[k] = stepResults[k];
        } else if (values[k] !== undefined) {
          stepBody[k] = values[k];
        }
      }
    }

    try {
      const upstream = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${writeToken}`,
          "x-acting-user-email": email,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stepBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        return NextResponse.json({ error: `${op.label} 실패`, detail }, { status: upstream.status });
      }

      const out = await upstream.json().catch(() => ({}));
      lastOut = out;
      if (step.returns) {
        const o = (out ?? {}) as Record<string, unknown>;
        stepResults[step.returns] = o[step.returns] ?? o.id;
      }
    } catch (e: unknown) {
      const reason = errName(e) === "TimeoutError" ? "timeout" : "hr_unreachable";
      return NextResponse.json({ error: reason }, { status: 504 });
    }
  }

  const final = lastOut && typeof lastOut === "object" ? (lastOut as Record<string, unknown>) : {};
  return NextResponse.json({ ok: true, ...final });
}
