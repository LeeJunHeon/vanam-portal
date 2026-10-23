"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { NasStatus } from "@/components/portal/home/useNasStatus";
import { PORTAL_APPS } from "@/lib/portal-apps";
import { advanceServerStreak, buildPortalAlerts, type ServerStreak } from "@/lib/portal-alerts";

// 앱 API(인증서·장비·공정·재고)는 화면이 보일 때만 60초마다 다시 부르고, 다시 보이면 즉시 1번 부른다.
// 요청마다 따로 처리해 하나가 실패하면 그 앱 알림만 직전 성공 값을 유지한다.
// 서버 기반 알림(서비스·디스크·RAM·재시작)은 PortalHome 의 useNasStatus 결과를 받아 쓴다(여기서 nas-status 를 부르지 않는다).

const REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

const SOURCES = {
  cert: "/api/cert-status",
  equipment: `${PORTAL_APPS.equipment.base}/api/dashboard`,
  process: `${PORTAL_APPS.process.base}/api/dashboard`,
  inventory: `${PORTAL_APPS.inventory.base}/api/dashboard`,
} as const;
type SourceKey = keyof typeof SOURCES;
type SourceData = Record<SourceKey, unknown>;

const EMPTY_SOURCES: SourceData = { cert: null, equipment: null, process: null, inventory: null };

function useAlertSources(): SourceData {
  const [data, setData] = useState<SourceData>(EMPTY_SOURCES);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    const inFlight = new Set<SourceKey>();
    const controllers = new Set<AbortController>();

    const loadOne = (key: SourceKey) => {
      if (inFlight.has(key)) return; // 진행 중이면 겹쳐 보내지 않는다
      inFlight.add(key);
      const ctrl = new AbortController();
      controllers.add(ctrl);
      const abortTimer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      fetch(SOURCES[key], { credentials: "include", cache: "no-store", signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: unknown) => {
          if (!disposed) setData((prev) => ({ ...prev, [key]: d }));
        })
        .catch(() => {}) // 실패하면 직전 성공 값 유지
        .finally(() => {
          clearTimeout(abortTimer);
          controllers.delete(ctrl);
          inFlight.delete(key);
        });
    };
    const load = () => {
      for (const key of Object.keys(SOURCES) as SourceKey[]) loadOne(key);
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(load, REFRESH_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const resume = () => {
      load();
      start();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else resume();
    };
    // 뒤로 가기 캐시(bfcache)에서 복원된 경우
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && document.visibilityState !== "hidden") resume();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    if (document.visibilityState !== "hidden") resume();

    return () => {
      disposed = true;
      stop();
      for (const c of controllers) c.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return data;
}

/** 서버 표본 시각(ms) — 헬스체크 시각, 없으면 CPU 표본 시각 */
function sampleTime(d: NasStatus | null): number {
  const t = Date.parse(d?.containersCheckedAt ?? d?.sampledAt ?? "");
  return Number.isNaN(t) ? 0 : t;
}

export default function AlertPanel({ data: nas, stale }: { data: NasStatus | null; stale: boolean }) {
  const sources = useAlertSources();

  // 서버 조건 연속 감지: 새 헬스체크 결과(containersCheckedAt)가 올 때마다 한 번씩만 센다.
  // (nas-status 는 헬스체크를 8초 재사용하므로 같은 결과를 두 번 세지 않게)
  const sampleKey = nas?.containersCheckedAt ?? null;
  const [track, setTrack] = useState<{ key: string | null; stale: boolean; at: number; streak: ServerStreak }>(
    { key: null, stale: false, at: 0, streak: {} },
  );
  if (track.key !== sampleKey || track.stale !== stale) {
    const at = sampleTime(nas);
    setTrack({ key: sampleKey, stale, at, streak: advanceServerStreak(track.streak, nas, stale, at) });
  }

  const alerts = buildPortalAlerts({
    ...sources,
    nas,
    nasStale: stale,
    streak: track.streak,
    now: track.at,
  });

  const iconBg: Record<string, string> = { warn: "#fef9c3", error: "#fee2e2", info: "#e0f2fe" };
  const iconText: Record<string, string> = { warn: "#854d0e", error: "#991b1b", info: "#0c4a6e" };
  const iconChar: Record<string, string> = { warn: "!", error: "!", info: "i" };

  return (
    <div className="bg-white rounded-[12px] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
      <p style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
        알림
      </p>

      {alerts.length === 0 && (
        <p style={{ fontSize: "12px", color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>새로운 알림이 없습니다</p>
      )}

      {alerts.map((alert, i) => {
        const rowStyle = {
          display: "flex", gap: "8px", alignItems: "flex-start",
          padding: "7px 0",
          borderBottom: i < alerts.length - 1 ? "0.5px solid #f9fafb" : "none",
        } as const;
        const body = (
          <>
            <div style={{
              width: "18px", height: "18px", borderRadius: "5px", flexShrink: 0,
              background: iconBg[alert.type], color: iconText[alert.type],
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "10px", fontWeight: 700,
            }}>
              {iconChar[alert.type]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "11px", color: "#374151", lineHeight: 1.4 }}>{alert.text}</div>
              <div style={{ fontSize: "10px", color: "#9ca3af" }}>{alert.sub}</div>
            </div>
          </>
        );
        // 다른 앱(별도 zone)으로 가는 링크라 next/link 가 아닌 a 태그 (Next 문서: Linking between zones)
        return alert.href ? (
          <a
            key={alert.id}
            href={alert.href}
            className="rounded-[6px] hover:bg-gray-50"
            // hover 배경이 글자에 붙지 않게 좌우로 넓히고 같은 만큼 안쪽 여백을 준다(글자 위치는 그대로)
            style={{ ...rowStyle, padding: "7px 8px", margin: "0 -8px", textDecoration: "none", cursor: "pointer" }}
          >
            {body}
            <ChevronRight size={12} color="#d1d5db" style={{ flexShrink: 0, marginTop: "3px" }} aria-hidden />
          </a>
        ) : (
          <div key={alert.id} style={rowStyle}>{body}</div>
        );
      })}
    </div>
  );
}
