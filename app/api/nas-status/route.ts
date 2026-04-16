import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    nas: "unknown",
    db: "unknown",
    inventory: "unknown",
    chamber: "unknown",
  });
}
