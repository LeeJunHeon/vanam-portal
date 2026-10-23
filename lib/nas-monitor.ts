// NAS 상태 수집 (서버 전용).
// - CPU: 2초마다 /proc/stat 을 샘플링해 두고, 응답에는 최근 10초 평균을 준다
//   (요청 순간 0.2초만 재면 페이지를 여는 순간의 부하가 그대로 잡혀 값이 튄다).
// - 컨테이너 헬스체크: 8초 동안 결과를 재사용하고, 동시 요청은 진행 중 Promise 를 공유한다.
//   오래된 결과를 먼저 주는 방식(stale-while-revalidate)은 쓰지 않는다 — 한 박자 늦어지는 원인.
// - 상태는 globalThis 싱글턴 (번들이 나뉘거나 개발 모드 재로드로 샘플러가 둘 생기지 않게).
import fs from "node:fs";
import net from "node:net";

const SAMPLE_INTERVAL_MS = 2_000;
const SAMPLE_KEEP_MS = 60_000;
const CPU_WINDOW_MS = 10_000;
const CPU_MIN_WINDOW_MS = 2_000;
const DISK_TTL_MS = 60_000;
const CONTAINERS_TTL_MS = 8_000;

// ─────────────────────────────────────────────
// CPU 계산 (순수 함수)
// ─────────────────────────────────────────────
export interface CpuTimes {
  total: number;
  idle: number;
  iowait: number;
}

export interface CpuSample {
  at: number; // ms
  times: CpuTimes;
}

// /proc/stat 첫 줄: cpu user nice system idle iowait irq softirq steal guest guest_nice
// guest·guest_nice 는 user·nice 에 이미 포함돼 있으므로 total 에 더하지 않는다.
export function parseCpuLine(line: string): CpuTimes | null {
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== "cpu") return null;
  const n = parts.slice(1, 9).map((v) => Number(v) || 0);
  while (n.length < 8) n.push(0);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = n;
  return {
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    idle,
    iowait,
  };
}

// 사용률 = (Δtotal - Δidle - Δiowait) / Δtotal, I/O 대기 = Δiowait / Δtotal (0~100 정수)
export function calcCpu(prev: CpuTimes, cur: CpuTimes): { cpu: number; ioWait: number } | null {
  const dTotal = cur.total - prev.total;
  if (!(dTotal > 0)) return null;
  const dIdle = cur.idle - prev.idle;
  const dIo = cur.iowait - prev.iowait;
  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
  return {
    cpu: clamp(((dTotal - dIdle - dIo) / dTotal) * 100),
    ioWait: clamp((dIo / dTotal) * 100),
  };
}

// 계산 창 고르기: 최신 샘플과, 그보다 10초 이상 앞선 샘플 중 가장 최근 것.
// 10초 전 샘플이 아직 없으면 가장 오래된 샘플 (2초 이상 차이 날 때만). 없으면 null.
export function pickCpuWindow(samples: CpuSample[]): { base: CpuSample; latest: CpuSample } | null {
  if (samples.length < 2) return null;
  const latest = samples[samples.length - 1];
  let base: CpuSample | null = null;
  for (const s of samples) {
    if (s.at <= latest.at - CPU_WINDOW_MS) base = s;
    else break;
  }
  if (!base) {
    const oldest = samples[0];
    if (latest.at - oldest.at >= CPU_MIN_WINDOW_MS) base = oldest;
  }
  return base ? { base, latest } : null;
}

// ─────────────────────────────────────────────
// 싱글턴 상태
// ─────────────────────────────────────────────
interface ContainersResult {
  containers: Record<string, string>;
  at: number;
}

interface MonitorState {
  samples: CpuSample[];
  timer: ReturnType<typeof setInterval> | null;
  cpuUnavailable: boolean;
  disk: { used: number; total: number; at: number } | null;
  containers: ContainersResult | null;
  containersInflight: Promise<ContainersResult> | null;
}

const g = globalThis as typeof globalThis & { __vanamNasMonitor?: MonitorState };
const state: MonitorState = (g.__vanamNasMonitor ??= {
  samples: [],
  timer: null,
  cpuUnavailable: false,
  disk: null,
  containers: null,
  containersInflight: null,
});

function readCpuTimes(): CpuTimes | null {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
    return parseCpuLine(line);
  } catch {
    return null;
  }
}

function takeSample() {
  const times = readCpuTimes();
  if (!times) {
    // /proc/stat 이 없는 환경(개발 PC 등) — 조용히 멈춘다
    state.cpuUnavailable = true;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    return;
  }
  const now = Date.now();
  state.samples.push({ at: now, times });
  while (state.samples.length > 0 && state.samples[0].at < now - SAMPLE_KEEP_MS) state.samples.shift();
}

function ensureSampler() {
  if (state.timer || state.cpuUnavailable) return;
  takeSample();
  if (state.cpuUnavailable) return;
  state.timer = setInterval(takeSample, SAMPLE_INTERVAL_MS);
  state.timer.unref?.();
}

export interface CpuReading {
  cpu: number | null;
  ioWait: number | null;
  cpuWindowSec: number | null;
  sampledAt: string | null;
}

const EMPTY_CPU: CpuReading = { cpu: null, ioWait: null, cpuWindowSec: null, sampledAt: null };

export async function getCpu(): Promise<CpuReading> {
  ensureSampler();
  if (state.cpuUnavailable) return EMPTY_CPU;

  let win = pickCpuWindow(state.samples);
  if (!win) {
    // 서버 시작 직후(기록 2초 미만): 그 자리에서 1초 간격으로 두 번 읽는다
    const t1 = readCpuTimes();
    const at1 = Date.now();
    await new Promise((r) => setTimeout(r, 1_000));
    const t2 = readCpuTimes();
    const at2 = Date.now();
    if (!t1 || !t2) return EMPTY_CPU;
    win = { base: { at: at1, times: t1 }, latest: { at: at2, times: t2 } };
  }

  const r = calcCpu(win.base.times, win.latest.times);
  if (!r) return EMPTY_CPU;
  return {
    cpu: r.cpu,
    ioWait: r.ioWait,
    cpuWindowSec: Math.round((win.latest.at - win.base.at) / 1000),
    sampledAt: new Date(win.latest.at).toISOString(),
  };
}

// ─────────────────────────────────────────────
// RAM (/proc/meminfo, 요청 때 읽음)
// ─────────────────────────────────────────────
export function getRam(): { used: number; total: number } {
  try {
    const mem = fs.readFileSync("/proc/meminfo", "utf8");
    const getKb = (key: string) => {
      const m = mem.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return m ? parseInt(m[1]) : 0;
    };
    const total = getKb("MemTotal");
    const available = getKb("MemAvailable");
    return {
      total: Math.round((total / 1024 / 1024) * 10) / 10,
      used: Math.round(((total - available) / 1024 / 1024) * 10) / 10,
    };
  } catch {
    return { used: -1, total: -1 };
  }
}

// ─────────────────────────────────────────────
// 디스크 (statfs, 60초 캐시) — 셸 실행 없이 이벤트 루프를 막지 않게
// ─────────────────────────────────────────────
export async function getDisk(): Promise<{ used: number; total: number }> {
  const now = Date.now();
  if (state.disk && now - state.disk.at < DISK_TTL_MS) {
    return { used: state.disk.used, total: state.disk.total };
  }
  try {
    const s = await fs.promises.statfs("/");
    const gb = (bytes: number) => Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
    const total = gb(s.blocks * s.bsize);
    const used = gb((s.blocks - s.bfree) * s.bsize);
    state.disk = { used, total, at: now };
    return { used, total };
  } catch {
    return { used: -1, total: -1 };
  }
}

// ─────────────────────────────────────────────
// 업타임 (/proc/uptime)
// ─────────────────────────────────────────────
export function getUptimeDays(): number {
  try {
    const upRaw = fs.readFileSync("/proc/uptime", "utf8");
    return Math.floor(parseFloat(upRaw.split(" ")[0]) / 86400);
  } catch {
    return -1;
  }
}

/** 가동 시간(정수 초). 포털 알림의 재시작 감지용. 못 읽으면 -1 */
export function getUptimeSec(): number {
  try {
    const upRaw = fs.readFileSync("/proc/uptime", "utf8");
    const sec = Math.floor(parseFloat(upRaw.split(" ")[0]));
    return Number.isFinite(sec) ? sec : -1;
  } catch {
    return -1;
  }
}

// ─────────────────────────────────────────────
// 컨테이너 헬스체크
// ─────────────────────────────────────────────

// HTTP 헬스체크 (Next.js 앱용)
// 응답 상태코드 200-499 → "running" (서버가 요청을 처리하고 있음)
// 500+ 또는 타임아웃/에러 → "stopped"
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

// TCP 연결 체크 (postgres 용도)
// HTTP 서버가 아닌 DB는 TCP 핸드셰이크 성공 여부만 확인
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

async function runHealthChecks(): Promise<ContainersResult> {
  // 각 헬퍼가 내부에서 try-catch로 에러를 흡수하므로 Promise.all 안전
  const translatorHealthUrl =
    process.env.TRANSLATOR_HEALTH_URL || "http://192.168.0.83:8790/translator/healthz";
  const [portal, inventory, equipment, hr, office, processApp, translator, postgres] = await Promise.all([
    checkHttp("http://localhost:3000"),              // 자기 자신
    checkHttp("http://inventory-web-nextjs:3000"),   // 재고관리
    checkHttp("http://equipment-web-nextjs:3003"),   // 장비관리 (내부 포트 3003)
    checkHttp("http://hr-nextjs:3000"),              // 인사관리
    checkHttp("http://office-web-nextjs:3000"),      // 경영지원
    checkHttp("http://process-web-nextjs:3000"),     // 공정관리
    checkHttp(translatorHealthUrl),                  // 실시간 통역 (jensen Mac mini)
    checkTcp("inventory-web-postgres", 5432),        // postgres
  ]);

  return {
    containers: {
      "portal": portal,
      "inventory-web-nextjs": inventory,
      "equipment-web-nextjs": equipment,
      "hr-nextjs": hr,
      "office-web-nextjs": office,
      "process-web-nextjs": processApp,
      "translator": translator,
      "postgres": postgres,
    },
    at: Date.now(),
  };
}

// 8초 안의 결과는 재사용, 지났으면 새로 돌린 결과를 기다려서 준다
export async function getContainers(): Promise<ContainersResult> {
  if (state.containers && Date.now() - state.containers.at < CONTAINERS_TTL_MS) {
    return state.containers;
  }
  if (!state.containersInflight) {
    state.containersInflight = runHealthChecks()
      .then((r) => {
        state.containers = r;
        return r;
      })
      .finally(() => {
        state.containersInflight = null;
      });
  }
  return state.containersInflight;
}
