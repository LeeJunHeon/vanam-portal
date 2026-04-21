import { NextResponse } from "next/server";
import { execSync } from "child_process";

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 3000, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export async function GET() {
  try {
    // CPU 사용률 (/proc/stat 기반, 1초 간격 2회 읽기)
    let cpuPercent = 0;
    try {
      const stat1 = (await import("fs")).readFileSync("/proc/stat", "utf8").split("\n")[0];
      await new Promise((r) => setTimeout(r, 200));
      const stat2 = (await import("fs")).readFileSync("/proc/stat", "utf8").split("\n")[0];
      const parse = (s: string) => s.split(/\s+/).slice(1).map(Number);
      const s1 = parse(stat1);
      const s2 = parse(stat2);
      const idle1 = s1[3], total1 = s1.reduce((a, b) => a + b, 0);
      const idle2 = s2[3], total2 = s2.reduce((a, b) => a + b, 0);
      const idleDiff = idle2 - idle1;
      const totalDiff = total2 - total1;
      cpuPercent = Math.round((1 - idleDiff / totalDiff) * 100);
    } catch {
      cpuPercent = -1;
    }

    // RAM (/proc/meminfo)
    let ramUsedGb = -1, ramTotalGb = -1;
    try {
      const mem = (await import("fs")).readFileSync("/proc/meminfo", "utf8");
      const getKb = (key: string) => {
        const m = mem.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
        return m ? parseInt(m[1]) : 0;
      };
      const total = getKb("MemTotal");
      const available = getKb("MemAvailable");
      ramTotalGb = Math.round((total / 1024 / 1024) * 10) / 10;
      ramUsedGb = Math.round(((total - available) / 1024 / 1024) * 10) / 10;
    } catch {}

    // Disk (/proc 기반 df 명령)
    let diskUsedGb = -1, diskTotalGb = -1;
    try {
      const df = safeExec("df -BG / --output=size,used | tail -1");
      if (df) {
        const parts = df.trim().split(/\s+/);
        diskTotalGb = parseInt(parts[0]);
        diskUsedGb = parseInt(parts[1]);
      }
    } catch {}

    // Uptime
    let uptimeDays = -1;
    try {
      const upRaw = (await import("fs")).readFileSync("/proc/uptime", "utf8");
      const seconds = parseFloat(upRaw.split(" ")[0]);
      uptimeDays = Math.floor(seconds / 86400);
    } catch {}

    // Docker 컨테이너 상태
    // key: ServerStatus.tsx에서 사용하는 식별자
    // value: 실제 docker container_name (docker ps --format '{{.Names}}' 기준)
    const CONTAINER_MAP: Record<string, string> = {
      "portal": "portal-nextjs",
      "inventory-web-nextjs": "inventory-web-nextjs",
      "equipment-web-nextjs": "equipment-web-nextjs",
      "postgres": "inventory-web-postgres",
    };
    const containerStatus: Record<string, string> = {};
    try {
      const running = safeExec("docker ps --format '{{.Names}}'").split("\n").filter(Boolean);
      for (const [key, containerName] of Object.entries(CONTAINER_MAP)) {
        containerStatus[key] = running.includes(containerName) ? "running" : "stopped";
      }
    } catch {
      for (const key of Object.keys(CONTAINER_MAP)) {
        containerStatus[key] = "unknown";
      }
    }

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
