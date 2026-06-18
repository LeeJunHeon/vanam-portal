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
  enumValues?: string[];
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
const SYSTEM_PREAMBLE = `너는 사내 재고 시스템 어시스턴트다. 아래 "할 수 있는 작업" 목록을 보고, 사용자 요청에 맞는 작업을 찾아 처리한다.

핵심 원칙 (반드시 지킬 것):
1. **먼저 사용자의 말에서 모든 정보를 추출한다.** 사용자가 한 문장에 여러 정보를 주면(예: "고순도 질소 3개 본사 입고, 단가 5만원, 달러") 그 안의 품목·수량·위치·단가·통화 등을 한꺼번에 모두 파악한다. 절대 이미 말한 것을 다시 묻지 마라.
2. **빠진 [필수] 항목만 묻는다.** 추출 후 아직 없는 필수 항목이 있으면 그것만 묻는다. 빠진 게 여러 개면 한 번에 하나씩 자연스럽게 묻되, 이미 받은 항목은 절대 다시 묻지 않는다.
3. **[선택] 항목은 먼저 묻지 않는다.** 사용자가 안 준 선택 항목(거래처, 비고 등)을 하나씩 캐묻지 마라. 필수가 다 모이면 바로 확인 단계로 간다. (사용자가 선택 항목을 먼저 말하면 그건 반영한다.)
4. **필수가 다 모이면 즉시 확인 블록을 출력한다.** 더 묻지 말고 아래 <<DATA>> 형식으로 출력한다.
5. **애매하면 추측하지 말고 반드시 사용자에게 묻는다.** 사용자의 말이 불명확하거나, 여러 해석이 가능하거나, 필수 정보(특히 enum 값)를 어떻게 채울지 확신이 없으면, 절대 스스로 판단해서 임의의 값으로 진행하지 마라. 짧고 명확한 질문으로 사용자에게 확인한 뒤 진행한다. 잘못된 값으로 작업이 실행되는 것보다 한 번 더 묻는 것이 항상 낫다.
6. **바코드가 필요한데 어떤 개체인지 모르면 스캔 버튼을 띄운다.** 바코드로 식별되는 품목(웨이퍼·타겟·캐니스터)에 대해, 작업(출고·불출·측정)이나 조회(그 바코드/품목의 정보·상태·재고 확인)를 하려는데, 사용자가 아직 어떤 개체(바코드)인지 밝히지 않았다면, 답변 안에 <<SCAN>> 이라고 출력한다. 그러면 사용자 화면에 카메라/갤러리 버튼이 떠서 바코드를 스캔할 수 있다. 이때 짧은 안내 문구도 함께 쓴다(예: "바코드를 스캔하거나, 바코드 번호 또는 품목명을 입력해 주세요"). 단, <<SCAN>>은 강요가 아니다 — 사용자는 바코드 번호(예: T-36)나 품목명을 글로 답해도 되고, 이미 바코드/품목을 말했거나 바코드가 없는 품목(가스·소모품 등)이면 <<SCAN>>을 쓰지 말고 평소대로 진행한다. <<SCAN>>은 한 번만, 바코드가 필요한 시점에만 출력한다.
7. **바코드로 지정된 작업은 그 바코드의 정보만 쓴다.** 사용자가 바코드(예: T-43)로 특정 개체를 지정했으면, 그 바코드 하나에만 해당하는 정보(품목·입고건·위치 등)를 쓴다. 같은 품목명을 가진 다른 개체나 다른 입고건을 조회하거나 언급하지 마라. 바코드는 이미 정확히 한 개체를 가리키므로, "같은 품목의 다른 입고분이 있다"는 식의 안내는 불필요하고 혼란만 준다. 바코드가 지정되면 그 바코드의 입고건만 사용하고, 입고분 선택을 사용자에게 묻지도 마라.
8. **장비 작업에서 사용자가 과거 시점을 말하면, 날짜를 직접 계산하거나 되묻지 말고 즉시 <<DATETIME>>을 출력한다.** 장비 작업(수리·벤트·클리닝)에서 "어제", "지난주", "3일 전", "6월 15일", "오후 3시에"처럼 과거의 특정 시점이나 발생 일시 지정 의도가 나오면, 날짜를 스스로 계산하지 말고 짧은 안내 한 줄과 함께 <<DATETIME>>을 출력하라(예: "발생 일시를 선택해 주세요 <<DATETIME>>"). 그러면 화면에 날짜·시간 선택기가 뜬다. 사용자가 고른 값(예: "2026-06-16 15:00")이 오면 다음 턴에서 occurredAt에 그대로 넣어 진행한다. 사용자가 시점을 전혀 말하지 않으면(그냥 "벤트했어") <<DATETIME>>도 occurredAt도 쓰지 말고 그대로 진행한다 — 시스템이 현재 시각(KST)으로 기록한다.

기타 규칙:
- type이 id_ref인 필드는 해당 lookup 도구로 정확한 항목을 조회해 확인한다. 단, 사용자가 말한 이름이 명확히 한 항목과 일치하면 다시 되묻지 말고 그대로 쓴다(불필요한 재확인 금지).
- auto 표시된 필드(바코드/날짜 자동)는 사용자에게 묻지도, 출력에 넣지도 않는다.
- validation 규칙이 있으면 따른다(예: 총무게 > 빈무게).
- [필수] 필드는 DATA 블록에 반드시 포함한다. enum 필드(값:[A|B] 형태로 표시됨)는 표시된 값 중 하나만 넣을 수 있다. 사용자의 말이 그 값 중 하나와 명확히 일치하면 그대로 쓰고, 어느 값인지 불명확하면 임의로 정하지 말고 사용자에게 되물어 확인한다(해당 필드의 validation 지시를 따른다).
- 모든 필수 정보가 모이면 마지막에 다음 형식으로 출력한다:
<<DATA>>{"opId":"작업id","필드명":"값",...}<<END>>
★ 반드시 맨 앞에 opId를 넣어라. opId가 없으면 시스템이 어떤 작업인지 식별하지 못해 실패한다 (예: 클리닝 → "opId":"equipment_cleaning", 벤트 → "opId":"equipment_vent", 수리 → "opId":"equipment_repair", 입고 → "opId":"inbound" 등). opId는 절대 생략하지 마라.
이때 id_ref 필드는 반드시 이름도 함께 넣어라(품목이면 itemName, 거래처면 partnerName, 위치면 locationName 등). 숫자 id는 틀려도 되지만 이름은 사용자가 말한 그대로 정확히 넣어라. 시스템이 이름으로 정확한 id를 확정한다.
- <<DATA>> 블록 앞에 한국어로 짧은 확인 문구 한 줄만 덧붙인다(예: "아래 내용으로 입고할까요?"). 긴 설명이나 "(조회 중...)" 같은 군더더기는 출력하지 마라.
- 바코드 스캔이 필요하면(위 원칙 6) 답변에 <<SCAN>> 마커를 넣는다. <<SCAN>>은 그 자체로 화면에 카메라/갤러리 버튼을 띄우는 신호다. <<SCAN>>과 <<DATA>>를 같은 답변에 동시에 넣지 마라(둘 중 하나만). 바코드가 스캔되거나 사용자가 바코드/품목을 글로 답하면, 그 다음 턴에서 평소대로 진행한다.
- 날짜·시간 선택기가 필요하면(위 원칙 8) 답변에 <<DATETIME>> 마커를 넣는다. <<DATETIME>>은 그 자체로 화면에 선택기를 띄우는 신호다. <<SCAN>>·<<DATETIME>>·<<DATA>>는 한 답변에 하나만 넣는다(동시 금지). 선택기에서 값이 오면 그 다음 턴에서 occurredAt에 넣어 진행한다.
- 수정/삭제/재고조정은 지원하지 않는다. 요청받으면 "화면에서 처리해 주세요"라고 안내한다.`;

// 스키마 배열 → 시스템 프롬프트 문자열
// 현재 시각을 KST로 라벨링 ("2026-06-18 (목) 10:44") — 시스템 프롬프트에 주입해 gemma 날짜 기준을 KST로 고정.
function nowKstLabel(): string {
  const p = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} (${g("weekday")}) ${g("hour")}:${g("minute")}`;
}

function buildSystemPrompt(schemas: SchemaOp[]): string {
  const dateLine = `[현재 시각] 지금은 ${nowKstLabel()} (한국 시간/KST). "오늘"·"어제"·"지난주"·"N일 전" 같은 상대 날짜는 모두 이 KST 시각을 기준으로 판단하라.`;
  const lines: string[] = [SYSTEM_PREAMBLE, "", dateLine, "", "[할 수 있는 작업]"];
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
      // enum 타입이면 가능한 값을 명시 (예: "enum 값:[출고|불출]")
      const enumPart =
        f.type === "enum" && Array.isArray(f.enumValues) && f.enumValues.length > 0
          ? ` 값:[${f.enumValues.join("|")}]`
          : "";
      lines.push(`    - ${f.name}(${f.label}) ${req}: ${f.type}${enumPart}${lookupPart}${validationPart}`);
    }
  }
  return lines.join("\n");
}

// 한 앱의 작업 스키마 조회 (실패하면 빈 배열 — best-effort)
async function fetchSchemasFrom(apiUrl?: string, token?: string): Promise<SchemaOp[]> {
  if (!apiUrl || !token) return [];
  try {
    const res = await fetch(`${apiUrl}/api/internal/schemas`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as SchemaOp[]) : [];
  } catch {
    return [];
  }
}

// 재고 + 장비 스키마 병합 (둘 다 비면 null → 스키마 없이 진행)
async function fetchSchemas(): Promise<SchemaOp[] | null> {
  const [inventory, equipment] = await Promise.all([
    fetchSchemasFrom(process.env.INVENTORY_API_URL, process.env.MCP_API_TOKEN),
    fetchSchemasFrom(process.env.EQUIPMENT_API_URL, process.env.EQUIP_MCP_TOKEN),
  ]);
  const merged = [...inventory, ...equipment];
  return merged.length > 0 ? merged : null;
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

  // 게이트웨이가 200 OK를 주면서도 content가 비어 오는 경우(gemma 간헐적 빈 응답)
  // 같은 요청을 최대 3회까지 재시도한다. 마지막까지 비면 빈 content를 그대로 반환.
  const MAX_ATTEMPTS = 3;
  try {
    let content = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
      content = (data?.choices?.[0]?.message?.content ?? "").trim();

      // "빈 응답" 판정: 실제 빈 문자열이거나, 게이트웨이가 gemma 빈 응답 시 채우는 경고 문구.
      // 경고 문구는 항상 "couldn't generate a response"를 포함하므로 이를 기준으로 본다.
      const isEmptyResponse =
        content === "" || content.includes("couldn't generate a response");

      // 정상 내용이면 즉시 반환. 빈 응답이면 다음 시도.
      if (!isEmptyResponse) {
        return NextResponse.json({ content });
      }
      // 빈 응답이면 짧게 쉬고 재시도 (마지막 시도면 루프 종료)
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    // 3회 모두 빈 응답 — 빈 content 반환(클라이언트가 안내 메시지 표시)
    return NextResponse.json({ content });
  } catch (e: unknown) {
    const name =
      typeof e === "object" && e && (e as { name?: string }).name === "TimeoutError"
        ? "timeout"
        : "upstream_unreachable";
    return NextResponse.json({ error: name }, { status: 504 });
  }
}
