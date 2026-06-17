import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SchemaField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  lookup?: string;
  validation?: string;
  auto?: boolean | string;
}
interface SchemaStep {
  api: string;
  body: string[];
  returns?: string;
}
interface SchemaOp {
  id: string;
  label: string;
  fields?: SchemaField[];
  steps?: SchemaStep[];
}

function todayKst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
function errName(e: unknown): string {
  return typeof e === "object" && e && "name" in e ? (e as { name: string }).name : "";
}

// 장비는 list_equipment 하나만. /api/internal/equipment(전체)에서 name으로 필터.
function lookupEndpoint(
  lookup: string | undefined
): { kind: "search" | "list"; path: string } | null {
  switch (lookup) {
    case "list_equipment":
      return { kind: "list", path: "/api/internal/equipment" };
    default:
      return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // 작업자 표시명: 세션 이름(UTF-8). 없으면 이메일 앞부분.
  const operatorName = session?.user?.name?.trim() || email.split("@")[0];

  const apiUrl = process.env.EQUIPMENT_API_URL;
  const writeToken = process.env.EQUIP_WRITE_TOKEN;
  const mcpToken = process.env.EQUIP_MCP_TOKEN;
  if (!apiUrl || !writeToken) {
    return NextResponse.json({ error: "equipment_api_not_configured" }, { status: 500 });
  }
  if (!mcpToken) {
    return NextResponse.json({ error: "EQUIP_MCP_TOKEN 미설정" }, { status: 500 });
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

  // 1. 스키마 가져와서 opId 작업 찾기
  let schemas: SchemaOp[];
  try {
    const res = await fetch(`${apiUrl}/api/internal/schemas`, {
      method: "GET",
      headers: { Authorization: `Bearer ${mcpToken}` },
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

  const fields = Array.isArray(op.fields) ? op.fields : [];
  const resolved: Record<string, unknown> = { ...values };

  // 2. id_ref(장비) 이름 → id 확정
  for (const field of fields) {
    if (field.type !== "id_ref") continue;
    const nameKey = field.name.endsWith("Id") ? `${field.name.slice(0, -2)}Name` : null;

    let name = "";
    if (nameKey) {
      const nameVal = values[nameKey];
      if (typeof nameVal === "string" && nameVal.trim()) name = nameVal.trim();
    }
    if (!name) {
      const selfVal = values[field.name];
      if (typeof selfVal === "string" && selfVal.trim() && Number.isNaN(Number(selfVal))) {
        name = selfVal.trim();
      }
    }
    if (!name) continue;

    const ep = lookupEndpoint(field.lookup);
    if (!ep) continue;

    let list: Array<{ id: number; name: string }>;
    try {
      const url =
        ep.kind === "search"
          ? `${apiUrl}${ep.path}?search=${encodeURIComponent(name)}`
          : `${apiUrl}${ep.path}`;
      const lookup = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${mcpToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (lookup.status === 401 || lookup.status === 403) {
        return NextResponse.json({ error: "조회 인증 실패" }, { status: 502 });
      }
      if (!lookup.ok) {
        const detail = await lookup.text();
        return NextResponse.json({ error: "lookup_failed", detail }, { status: 502 });
      }
      const parsed = await lookup.json();
      list = Array.isArray(parsed) ? parsed : [];
    } catch (e: unknown) {
      const reason = errName(e) === "TimeoutError" ? "timeout" : "lookup_unreachable";
      return NextResponse.json({ error: reason }, { status: 504 });
    }

    const exact = list.filter(
      (it) => typeof it?.name === "string" && it.name.trim() === name
    );
    if (ep.kind === "search") {
      if (exact.length === 1) {
        resolved[field.name] = exact[0].id;
      } else if (exact.length === 0 && list.length === 1) {
        resolved[field.name] = list[0].id;
      } else {
        return NextResponse.json(
          { error: `${field.label}을(를) 특정할 수 없습니다. 더 정확히 말씀해 주세요.` },
          { status: 400 }
        );
      }
    } else {
      if (exact.length === 1) {
        resolved[field.name] = exact[0].id;
      } else {
        return NextResponse.json(
          { error: `${field.label}을(를) 특정할 수 없습니다.` },
          { status: 400 }
        );
      }
    }
  }

  // 3. auto 필드 (occurredAt=오늘 KST)
  for (const field of fields) {
    if (!field.auto) continue;
    if (field.auto === "today") {
      resolved[field.name] = todayKst();
    }
  }

  // 4. steps 실행 (장비는 단일 step)
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
        } else if (resolved[k] !== undefined) {
          stepBody[k] = resolved[k];
        }
      }
    }

    // ★ 작업자 표시명을 세션에서 주입 (스키마엔 없는 필드, body 위조 방지)
    stepBody.operatorName = operatorName;

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
        return NextResponse.json(
          { error: `${op.label} 실패`, detail },
          { status: upstream.status }
        );
      }

      const out = await upstream.json().catch(() => ({}));
      lastOut = out;
      if (step.returns) {
        const o = (out ?? {}) as Record<string, unknown>;
        stepResults[step.returns] = o[step.returns] ?? o.id;
      }
    } catch (e: unknown) {
      const reason = errName(e) === "TimeoutError" ? "timeout" : "equipment_unreachable";
      return NextResponse.json({ error: reason }, { status: 504 });
    }
  }

  const final =
    lastOut && typeof lastOut === "object" ? (lastOut as Record<string, unknown>) : {};
  return NextResponse.json({ ok: true, ...final });
}
