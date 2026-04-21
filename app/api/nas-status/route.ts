import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import net from "net";

// ─────────────────────────────────────────────
// 헬퍼: 안전한 shell 실행 (df 명령 용도)
// ─────────────────────────────────────────────
function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 3000, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// 헬퍼: HTTP 헬스체크 (Next.js 앱용)
// 응답 상태코드 200-499 → "running" (서버가 요청을 처리하고 있음)
// 500+ 또는 타임아웃/에러 → "stopped"
// ─────────────────────────────────────────────
async function checkHttp(
  url: string,
  timeoutMs = 2000
): Promise<"running" | "stopped"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      method: "GET",
      cache: "no-store",
    });
    return res.status < 500 ? "running" : "stopped";
  } catch {
    return "stopped";
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
// 헬퍼: TCP 연결 체크 (postgres 용도)
// HTTP 서버가 아닌 DB는 TCP 핸드셰이크 성공 여부만 확인
// ─────────────────────────────────────────────
function checkTcp(
  host: string,
  port: number,
  timeoutMs = 2000
): Promise<"running" | "stopped"> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("stopped");
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve("running");
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve("stopped");
    });
  });
}

// ─────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────
export async function GET() {
  try {
    // 1. CPU 사용률 (/proc/stat, 200ms 간격 2회)
    let cpuPercent = -1;
    try {
      const stat1 = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
      await new Promise((r) => setTimeout(r, 200));
      const stat2 = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
      const parse = (s: string) => s.split(/\s+/).slice(1).map(Number);
      const s1 = parse(stat1);
      const s2 = parse(stat2);
      const idle1 = s1[3];
      const total1 = s1.reduce((a, b) => a + b, 0);
      const idle2 = s2[3];
      const total2 = s2.reduce((a, b) => a + b, 0);
      const idleDiff = idle2 - idle1;
      const totalDiff = total2 - total1;
      cpuPercent = Math.round((1 - idleDiff / totalDiff) * 100);
    } catch {}

    // 2. RAM (/proc/meminfo)
    let ramUsedGb = -1;
    let ramTotalGb = -1;
    try {
      const mem = fs.readFileSync("/proc/meminfo", "utf8");
      const getKb = (key: string) => {
        const m = mem.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
        return m ? parseInt(m[1]) : 0;
      };
      const total = getKb("MemTotal");
      const available = getKb("MemAvailable");
      ramTotalGb = Math.round((total / 1024 / 1024) * 10) / 10;
      ramUsedGb = Math.round(((total - available) / 1024 / 1024) * 10) / 10;
    } catch {}

    // 3. Disk (df 명령)
    let diskUsedGb = -1;
    let diskTotalGb = -1;
    try {
      const df = safeExec("df -BG / --output=size,used | tail -1");
      if (df) {
        const parts = df.trim().split(/\s+/);
        diskTotalGb = parseInt(parts[0]);
        diskUsedGb = parseInt(parts[1]);
      }
    } catch {}

    // 4. Uptime (/proc/uptime)
    let uptimeDays = -1;
    try {
      const upRaw = fs.readFileSync("/proc/uptime", "utf8");
      const seconds = parseFloat(upRaw.split(" ")[0]);
      uptimeDays = Math.floor(seconds / 86400);
    } catch {}

    // 5. 컨테이너 헬스체크 (HTTP + TCP 병렬 실행)
    // 각 헬퍼가 내부에서 try-catch로 에러를 흡수하므로 Promise.all 안전
    const [portal, inventory, equipment, postgres] = await Promise.all([
      checkHttp("http://localhost:3000"),              // 자기 자신
      checkHttp("http://inventory-web-nextjs:3000"),   // 재고관리
      checkHttp("http://equipment-web-nextjs:3000"),   // 장비관리
      checkTcp("inventory-web-postgres", 5432),        // postgres
    ]);

    const containerStatus: Record<string, string> = {
      "portal": portal,
      "inventory-web-nextjs": inventory,
      "equipment-web-nextjs": equipment,
      "postgres": postgres,
    };

    return NextResponse.json({
      cpu: cpuPercent,
      ram: { used: ramUsedGb, total: ramTotalGb },
      disk: { used: diskUsedGb, total: diskTotalGb },
      uptimeDays,
      containers: containerStatus,
    });
  } catch (error) {
    console.error("nas-status error:", error);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
