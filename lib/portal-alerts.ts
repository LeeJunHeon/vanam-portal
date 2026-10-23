// 포털 홈 알림 칸 — 순수 계산 (React·fetch 없음, 화면 AlertPanel 이 쓴다)
// 앱 API 응답은 형식을 믿지 않고 하나씩 확인한다(구버전·실패 응답이어도 깨지지 않게).
import { menuHref, type AppKey } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";

export type AlertType = "error" | "warn" | "info";

export interface PortalAlert {
  id: string;
  type: AlertType;
  text: string;
  sub: string;
  href?: string;
}

/** /api/nas-status 응답 중 알림에 쓰는 부분 (못 읽은 값은 -1) */
export interface ServerSample {
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  uptimeSec?: number;
  containers: Record<string, string>;
}

/** 서버 조건별 연속 감지 상태: 몇 번 연속인지, 처음 감지한 시각(ms) */
export type ServerStreak = Record<string, { count: number; since: number }>;

export const SERVER_CONFIRM_COUNT = 2; // 같은 조건이 연속 2회(약 20초) 이상일 때만 띄운다
export const DISK_WARN_PCT = 80;
export const DISK_ERROR_PCT = 90;
export const RAM_WARN_PCT = 95;        // 평소 80% 대라 95% 미만은 띄우지 않는다
export const RESTART_INFO_SEC = 24 * 3600;
export const PROCESS_LIST_CAP = 20;    // 공정 대시보드 overdue/upcoming 은 서버에서 20건으로 잘린다
export const DUE_LIST_CAP = 15;        // 공정 대시보드 dueSoon 은 서버에서 15건으로 잘린다
const DUE_SOON_DAYS = 7;

const TYPE_RANK: Record<AlertType, number> = { error: 0, warn: 1, info: 2 };

// 포털 앱 목록(PORTAL_APPS)에 없는 서비스의 사람이 읽는 이름
const EXTRA_SERVICE_NAMES: Record<string, string> = {
  portal: "포털",
  postgres: "데이터베이스",
};

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function href(app: AppKey, page: string): string {
  return menuHref(PORTAL_APPS[app].base, { page });
}

export function serviceName(key: string): string {
  for (const app of Object.values(PORTAL_APPS)) if (app.container === key) return app.name;
  return Object.hasOwn(EXTRA_SERVICE_NAMES, key) ? EXTRA_SERVICE_NAMES[key] : key;
}

/** used/total → 반올림 % (서버 상태 막대와 같은 계산). 못 읽은 값(-1)·0 이면 null */
export function usagePct(m: { used: number; total: number } | undefined): number | null {
  const used = num(m?.used);
  const total = num(m?.total);
  if (used === null || total === null || used < 0 || total <= 0) return null;
  return Math.round((used / total) * 100);
}

/** 지금 표본에서 성립하는 서버 조건 키 목록 */
function activeServerConditions(s: ServerSample): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(s.containers ?? {})) if (v === "stopped") keys.push(`svc:${k}`);
  const disk = usagePct(s.disk);
  if (disk !== null && disk >= DISK_WARN_PCT) keys.push("disk:warn");
  if (disk !== null && disk >= DISK_ERROR_PCT) keys.push("disk:error");
  const ram = usagePct(s.ram);
  if (ram !== null && ram >= RAM_WARN_PCT) keys.push("ram:warn");
  return keys;
}

/**
 * 새 서버 표본을 받았을 때 연속 감지 상태를 갱신한다.
 * stale 이거나 표본이 없으면 전부 초기화, 성립하지 않는 조건은 바로 지운다.
 * now 는 표본 시각(ms) — "N분째" 계산의 기준.
 */
export function advanceServerStreak(
  prev: ServerStreak, sample: ServerSample | null, stale: boolean, now: number,
): ServerStreak {
  if (!sample || stale) return {};
  const next: ServerStreak = {};
  for (const k of activeServerConditions(sample)) {
    const p = Object.hasOwn(prev, k) ? prev[k] : undefined;
    next[k] = p ? { count: p.count + 1, since: p.since } : { count: 1, since: now };
  }
  return next;
}

function confirmed(streak: ServerStreak, key: string): boolean {
  return Object.hasOwn(streak, key) && streak[key].count >= SERVER_CONFIRM_COUNT;
}

function elapsedLabel(ms: number): string {
  const min = Math.floor(ms / 60_000);
  return min < 1 ? "1분 미만" : `${min}분째`;
}

/** "YYYY-MM-DD" + n일 → "YYYY-MM-DD" (UTC 로 계산해 TZ 무관). 형식이 틀리면 null */
function addDays(day: string, n: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

function countLabel(n: number, capped: boolean): string {
  return capped ? `${n}건 이상` : `${n}건`;
}

export interface AlertInputs {
  cert: unknown;       // /api/cert-status (직전 성공 값, 없으면 null)
  equipment: unknown;  // /equipment/api/dashboard
  process: unknown;    // /process/api/dashboard
  inventory: unknown;  // /inventory/api/dashboard
  nas: ServerSample | null;
  nasStale: boolean;
  streak: ServerStreak;
  now: number;         // 서버 표본 시각(ms)
}

/** 알림 목록. error → warn → info 순, 같은 등급은 아래 추가 순서. */
export function buildPortalAlerts(input: AlertInputs): PortalAlert[] {
  const items: PortalAlert[] = [];

  // HTTPS 인증서 (서버가 실제 인증서를 읽어 판정, ok 면 알림 없음)
  const c = rec(input.cert);
  if (c && (c.status === "warn" || c.status === "error" || c.status === "unknown")) {
    items.push({
      id: "cert",
      type: c.status === "error" ? "error" : "warn",
      text: String(c.title ?? ""),
      sub: String(c.detail ?? ""),
    });
  }

  // 장비 관리
  const eq = rec(input.equipment);
  if (eq) {
    const inProgress = num(eq.totalInProgress);
    const needsRepair = num(eq.totalNeedsRepair);
    if (inProgress !== null && needsRepair !== null) {
      if (inProgress > 0) {
        items.push({ id: "repair-stopped", type: "error", text: `정지 중 수리 ${inProgress}건`,
          sub: "장비 관리 · 처리 필요", href: href("equipment", "history-repair") });
      }
      if (needsRepair > 0) {
        items.push({ id: "repair-needed", type: "warn", text: `가동 중 수리 필요 ${needsRepair}건`,
          sub: "장비 관리 · 확인 필요", href: href("equipment", "history-repair") });
      }
    } else {
      // 구버전 응답(정지중/가동중 구분 없음) — 기존 한 줄
      const unresolved = num(eq.totalUnresolved);
      if (unresolved !== null && unresolved > 0) {
        items.push({ id: "repair", type: "error", text: `미해결 수리 ${unresolved}건`,
          sub: "장비 관리 · 처리 필요", href: href("equipment", "history-repair") });
      }
    }
    const pm = num(eq.pmIssueCount);
    if (pm !== null && pm > 0) {
      items.push({ id: "pm", type: "warn", text: `정기 점검 필요 장비 ${pm}대`,
        sub: "장비 관리 · 방금", href: href("equipment", "dashboard") });
    }
  }

  // 공정 관리
  const pr = rec(input.process);
  if (pr) {
    const sub = pr.scope === "mine" ? "공정 관리 · 내 담당" : "공정 관리";
    const overdue = Array.isArray(pr.overdue) ? pr.overdue.length : 0;
    const upcoming = Array.isArray(pr.upcoming) ? pr.upcoming.length : 0;
    if (overdue > 0) {
      items.push({ id: "proc-overdue", type: "error",
        text: `시작 지연 공정 ${countLabel(overdue, overdue >= PROCESS_LIST_CAP)}`,
        sub, href: href("process", "processes") });
    }
    if (upcoming > 0) {
      items.push({ id: "proc-upcoming", type: "warn",
        text: `7일 내 시작 공정 ${countLabel(upcoming, upcoming >= PROCESS_LIST_CAP)}`,
        sub, href: href("process", "processes") });
    }

    // 납기 — 관리자만 dueSoon 이 채워진다(직원은 빈 배열). 기준일은 응답의 today.
    const today = typeof pr.today === "string" ? pr.today : "";
    const limit = addDays(today, DUE_SOON_DAYS);
    const due = Array.isArray(pr.dueSoon) ? pr.dueSoon : [];
    if (limit) {
      let late = 0;
      let soon = 0;
      for (const o of due) {
        const d = rec(o)?.dueAt;
        if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        if (d < today) late++;
        else if (d <= limit) soon++;
      }
      // 서버가 납기순으로 15건에서 자르므로, 꽉 찼으면 뒤쪽(임박)은 더 있을 수 있다
      const capped = due.length >= DUE_LIST_CAP;
      if (late > 0) {
        items.push({ id: "due-late", type: "error",
          text: `납기 초과 발주 ${countLabel(late, capped && soon === 0)}`,
          sub: "공정 관리 · 발주", href: href("process", "orders") });
      }
      if (soon > 0) {
        items.push({ id: "due-soon", type: "warn",
          text: `납기 임박 발주 ${countLabel(soon, capped)}`,
          sub: "공정 관리 · 7일 이내", href: href("process", "orders") });
      }
    }
  }

  // 재고 관리 — 재고 대시보드의 "재고 부족" 카드와 같은 화면(status)
  const inv = rec(input.inventory);
  const shortage = num(inv?.shortageCount);
  if (shortage !== null && shortage > 0) {
    items.push({ id: "shortage", type: "warn", text: `재고 부족 품목 ${shortage}개`,
      sub: "재고 관리 · 확인 필요", href: href("inventory", "status") });
  }

  // 서버 기반 — stale 이면 모두 숨김, 못 읽은 값(-1)은 그 항목만 숨김
  const s = input.nas;
  if (s && !input.nasStale) {
    const streak = input.streak;
    const down = Object.entries(s.containers ?? {})
      .filter(([k, v]) => v === "stopped" && confirmed(streak, `svc:${k}`))
      .map(([k]) => k);
    if (down.length > 0) {
      const since = Math.min(...down.map((k) => streak[`svc:${k}`].since));
      items.push({ id: "svc-down", type: "error",
        text: `서비스 응답 없음: ${down.map(serviceName).join(", ")}`,
        sub: `서버 상태 · ${elapsedLabel(input.now - since)}` });
    }

    const disk = usagePct(s.disk);
    if (disk !== null && disk >= DISK_ERROR_PCT && confirmed(streak, "disk:error")) {
      items.push({ id: "disk", type: "error", text: `디스크 사용량 ${disk}%`,
        sub: `서버 상태 · ${s.disk.used} / ${s.disk.total} GB` });
    } else if (disk !== null && disk >= DISK_WARN_PCT && confirmed(streak, "disk:warn")) {
      items.push({ id: "disk", type: "warn", text: `디스크 사용량 ${disk}%`,
        sub: `서버 상태 · ${s.disk.used} / ${s.disk.total} GB` });
    }

    const ram = usagePct(s.ram);
    if (ram !== null && ram >= RAM_WARN_PCT && confirmed(streak, "ram:warn")) {
      items.push({ id: "ram", type: "warn", text: `RAM 사용량 ${ram}%`,
        sub: `서버 상태 · ${s.ram.used} / ${s.ram.total} GB` });
    }

    const up = num(s.uptimeSec);
    if (up !== null && up >= 0 && up < RESTART_INFO_SEC) {
      const h = Math.floor(up / 3600);
      items.push({ id: "restart", type: "info",
        text: h < 1 ? "NAS가 1시간 이내에 재시작됨" : `NAS가 ${h}시간 전에 재시작됨`,
        sub: "서버 상태 · 정전 여부 확인" });
    }
  }

  // 등급 순 (Array.prototype.sort 는 안정 정렬 — 같은 등급은 추가 순서 유지)
  return items.sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type]);
}
