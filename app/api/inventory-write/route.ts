import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";        // 재고앱 내부 API 도달 위해 Node 런타임 필수
export const dynamic = "force-dynamic";

// ── 작업 스키마 타입 (재고앱 /api/internal/schemas 응답) ──────────────────
interface SchemaField {
  name: string;
  label: string;
  type: string;          // "id_ref" | "number" | "text" | ...
  required?: boolean;
  lookup?: string;       // "search_items" | "list_locations" | "list_categories" | ...
  validation?: string;
  auto?: boolean | string; // "today" | "system_generate" | true
}
interface SchemaStep {
  api: string;           // "POST /api/internal/inventory"
  body: string[];        // ["txType=입고", "itemId", "qty", ...]  ("key=고정값" 또는 "필드명")
  returns?: string;      // 다음 step에 넘길 결과 키 (예: "barcodeId")
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

// lookup 키 → 조회 엔드포인트 매핑. 매핑 없으면 null(이름교정 건너뜀).
// kind: "search" = ?search=name 으로 부분검색 / "list" = 전체 목록 받아 name으로 필터
function lookupEndpoint(
  lookup: string | undefined
): { kind: "search" | "list"; path: string } | null {
  switch (lookup) {
    case "search_items":
      return { kind: "search", path: "/api/internal/items" };
    case "list_locations":
      return { kind: "list", path: "/api/internal/locations" };
    case "list_categories":
      return { kind: "list", path: "/api/internal/categories" };
    default:
      return null; // search_partners, search_users 등 아직 조회 API 없음 → id 그대로 사용
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.INVENTORY_API_URL;
  const writeToken = process.env.INVENTORY_WRITE_TOKEN; // 쓰기(internal/*)용
  const mcpToken = process.env.MCP_API_TOKEN;           // 조회(schemas/items/...)용
  if (!apiUrl || !writeToken) {
    return NextResponse.json({ error: "inventory_api_not_configured" }, { status: 500 });
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

  // 조회는 모두 MCP_API_TOKEN 필요 (스키마 조회부터 사용)
  if (!mcpToken) {
    return NextResponse.json({ error: "MCP_API_TOKEN 미설정" }, { status: 500 });
  }

  // ── 1. 스키마 가져와서 opId에 해당하는 작업 찾기 ─────────────────────────
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

  // ── 2. id_ref 필드를 이름으로 확정 (범용 resolveIdByName) ────────────────
  // 원칙 "LLM은 이름, 시스템은 ID": 이름 값이 있으면 조회로 정확한 id를 다시 확정.
  for (const field of fields) {
    if (field.type !== "id_ref") continue;
    // id 필드명("...Id") → 이름 키("...Name")
    const nameKey = field.name.endsWith("Id")
      ? `${field.name.slice(0, -2)}Name`
      : null;
    if (!nameKey) continue;
    const nameVal = values[nameKey];
    const name = typeof nameVal === "string" ? nameVal.trim() : "";
    if (!name) continue; // 이름 없음 → values의 id 그대로 사용

    const ep = lookupEndpoint(field.lookup);
    if (!ep) continue; // 매핑 없는 lookup → 이름교정 건너뜀(values의 id 그대로)

    let list: Array<{ id: number; name: string }>;
    try {
      const url =
        ep.kind === "search"
          ? `${apiUrl}${ep.path}?search=${encodeURIComponent(name)}`
          : `${apiUrl}${ep.path}`;
      const lookup = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${mcpToken}` }, // 조회=MCP_API_TOKEN
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

    // 3단계 우선순위 (기존 itemName 로직과 동일)
    const exact = list.filter(
      (it) => typeof it?.name === "string" && it.name.trim() === name
    );
    if (ep.kind === "search") {
      // 검색형: 정확일치 1개 → / 정확일치 없고 결과 1개 → / 그 외 400
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
      // 목록형: 전체 목록에서 정확일치 1개만 허용
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

  // ── 3. auto 필드 채우기 ─────────────────────────────────────────────────
  // "today" → 오늘 KST 날짜 / "system_generate"(바코드 등) 및 그 외 truthy → step 결과로 채워짐(건너뜀)
  for (const field of fields) {
    if (!field.auto) continue;
    if (field.auto === "today") {
      resolved[field.name] = todayKst();
    }
  }

  // ── 4. steps 순서대로 실행 ──────────────────────────────────────────────
  const steps = Array.isArray(op.steps) ? op.steps : [];
  const stepResults: Record<string, unknown> = {}; // step.returns 누적 (예: barcodeId)
  let lastOut: unknown = null;

  for (const step of steps) {
    // "POST /api/internal/inventory" → 경로만 추출
    const parts = String(step.api ?? "").trim().split(/\s+/);
    const path = parts.length > 1 ? parts[1] : parts[0];

    const stepBody: Record<string, unknown> = {};
    const bodyKeys = Array.isArray(step.body) ? step.body : [];
    for (const entry of bodyKeys) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx >= 0) {
        // "key=고정값" — 숫자처럼 보이면 숫자로
        const k = entry.slice(0, eqIdx);
        const raw = entry.slice(eqIdx + 1);
        stepBody[k] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      } else {
        // 필드명: 이전 step 결과 우선, 없으면 확정/수집된 값
        const k = entry;
        if (stepResults[k] !== undefined) {
          stepBody[k] = stepResults[k];
        } else if (resolved[k] !== undefined) {
          stepBody[k] = resolved[k];
        }
        // 둘 다 없으면 생략(선택 필드 → 재고앱이 검증)
      }
    }

    try {
      const upstream = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${writeToken}`,   // 쓰기=INVENTORY_WRITE_TOKEN
          "x-acting-user-email": email,             // ★ 세션 email만 사용 (body 값 무시, 위조방지)
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stepBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        // 다단계 중단: 실패한 step의 status 그대로 반환
        return NextResponse.json(
          { error: `${op.label} 실패`, detail },
          { status: upstream.status }
        );
      }

      const out = await upstream.json().catch(() => ({}));
      lastOut = out;
      if (step.returns) {
        const o = (out ?? {}) as Record<string, unknown>;
        const barcode = o.barcode as { id?: unknown } | undefined;
        stepResults[step.returns] = o[step.returns] ?? o.id ?? barcode?.id;
      }
    } catch (e: unknown) {
      const reason = errName(e) === "TimeoutError" ? "timeout" : "inventory_unreachable";
      return NextResponse.json({ error: reason }, { status: 504 });
    }
  }

  // ── 5. 최종 반환 (마지막 step 응답을 ok와 함께) ─────────────────────────
  const final =
    lastOut && typeof lastOut === "object" ? (lastOut as Record<string, unknown>) : {};
  return NextResponse.json({ ok: true, ...final });
}
