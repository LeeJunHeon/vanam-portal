import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";        // LAN(192.168.x) 도달 위해 Node 런타임 필수
export const dynamic = "force-dynamic";

// ── 작업 스키마 타입 (재고앱 /api/internal/schemas 응답) ──────────────────
interface SchemaField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  lookup?: string;
  validation?: string;
  auto?: boolean;
}
interface SchemaOp {
  id: string;
  label: string;
  description?: string;
  triggers?: string[];
  appliesWhen?: { categoryName?: string } | null;
  fields?: SchemaField[];
  steps?: unknown[];
  cardTitle?: string;
  cardShow?: unknown[];
}

// 시스템 프롬프트 머리말(규칙) — 작업 목록은 buildSystemPrompt에서 뒤에 붙인다.
const SYSTEM_PREAMBLE = `너는 사내 재고 시스템 어시스턴트다. 아래 "할 수 있는 작업" 목록을 보고, 사용자 요청에 맞는 작업을 찾아 필요한 정보를 한 번에 하나씩 물어 모은다.

규칙:
- 각 작업의 [필수] 필드를 모두 모아야 한다. [선택] 필드는 사용자가 안 주면 비운다.
- type이 id_ref인 필드는 반드시 해당 lookup 도구로 정확한 항목을 조회해 확인한다(이름만 기억하지 말고 도구 호출).
- auto 표시된 필드(바코드/날짜 자동)는 사용자에게 묻지 않는다.
- 이미 받은 정보는 다시 묻지 않는다. 한 번에 하나씩 자연스럽게 질문한다.
- validation 규칙이 있으면 따른다(예: 총무게 > 빈무게).
- 모든 필수 정보가 모이면 마지막에 다음 형식으로 출력한다:
  <<DATA>>{"opId":"작업id","필드명":"값",...}<<END>>
  이때 id_ref 필드는 이름도 함께 넣어라(예: itemId는 모르면 생략 가능하나 itemName은 반드시 포함). 시스템이 이름으로 정확한 id를 확정한다.
- 수정/삭제/재고조정은 지원하지 않는다. 요청받으면 "화면에서 처리해 주세요"라고 안내한다.`;

// 스키마 배열 → 시스템 프롬프트 문자열
function buildSystemPrompt(schemas: SchemaOp[]): string {
  const lines: string[] = [SYSTEM_PREAMBLE, "", "[할 수 있는 작업]"];
  for (const op of schemas) {
    lines.push(`● ${op.label} (id=${op.id})`);
    if (op.description) lines.push(`  설명: ${op.description}`);
    const triggers = Array.isArray(op.triggers) ? op.triggers.join(", ") : "";
    lines.push(`  부르는 말: ${triggers}`);
    if (op.appliesWhen?.categoryName) {
      lines.push(`  조건: 품목 분류가 ${op.appliesWhen.categoryName}일 때`);
    }
    lines.push("  필요 정보:");
    const fields = Array.isArray(op.fields) ? op.fields : [];
    for (const f of fields) {
      if (f.auto) continue; // auto 필드는 사용자에게 묻지 않으므로 목록에서 제외
      const req = f.required ? "[필수]" : "[선택]";
      const lookupPart = f.lookup ? ` / ${f.lookup}로 조회` : "";
      const validationPart = f.validation ? ` / ${f.validation}` : "";
      lines.push(`    - ${f.name}(${f.label}) ${req}: ${f.type}${lookupPart}${validationPart}`);
    }
  }
  return lines.join("\n");
}

// 재고앱에서 작업 스키마 조회 (best-effort: 실패하면 null → 스키마 없이 진행)
// 조회 토큰은 inventory-write와 동일하게 MCP_API_TOKEN 사용.
async function fetchSchemas(): Promise<SchemaOp[] | null> {
  const apiUrl = process.env.INVENTORY_API_URL;
  const mcpToken = process.env.MCP_API_TOKEN;
  if (!apiUrl || !mcpToken) return null;
  try {
    const res = await fetch(`${apiUrl}/api/internal/schemas`, {
      method: "GET",
      headers: { Authorization: `Bearer ${mcpToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data as SchemaOp[]) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!gatewayUrl || !token) {
    return NextResponse.json({ error: "gateway_not_configured" }, { status: 500 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const messages = Array.isArray((body as { messages?: unknown })?.messages)
    ? (body as { messages: unknown[] }).messages
    : null;
  if (!messages) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }

  // 작업 스키마 기반 시스템 프롬프트 주입 (best-effort: 실패하면 그대로 진행)
  // 이미 system 메시지가 있으면 중복 주입하지 않는다(맨 앞에만).
  let outgoingMessages: unknown[] = messages;
  const hasSystem = messages.some(
    (m) => typeof m === "object" && m !== null && (m as { role?: unknown }).role === "system"
  );
  if (!hasSystem) {
    const schemas = await fetchSchemas();
    if (schemas && schemas.length > 0) {
      const systemMessage = { role: "system", content: buildSystemPrompt(schemas) };
      outgoingMessages = [systemMessage, ...messages];
    }
  }

  try {
    const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "openclaw/default", messages: outgoingMessages, stream: false }),
      signal: AbortSignal.timeout(120000),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      return NextResponse.json({ error: "gateway_error", detail }, { status: 502 });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content });
  } catch (e: unknown) {
    const name =
      typeof e === "object" && e && (e as { name?: string }).name === "TimeoutError"
        ? "timeout"
        : "upstream_unreachable";
    return NextResponse.json({ error: name }, { status: 504 });
  }
}
