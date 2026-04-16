import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    totalItems: 0,
    todayIn: 0,
    shortageCount: 0,
    recentLogs: [],
  });
}
