import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";        // LAN(192.168.x) 도달 위해 Node 런타임 필수
export const dynamic = "force-dynamic";

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

  try {
    const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "openclaw/default", messages, stream: false }),
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
