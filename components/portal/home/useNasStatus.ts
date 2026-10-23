"use client";

import { useEffect, useRef, useState } from "react";

// /api/nas-status 를 부르는 유일한 곳.
// 화면이 보일 때만 10초마다 갱신하고, 다시 보이게 되면 즉시 1번 갱신한다.
// 실패해도 마지막 값을 유지하고, 마지막 성공이 25초보다 오래되면 stale.

const REFRESH_MS = 10_000;
const REQUEST_TIMEOUT_MS = 8_000;
const STALE_AFTER_MS = 25_000;

export interface NasStatus {
  cpu: number | null;
  ioWait: number | null;
  cpuWindowSec: number | null;
  sampledAt: string | null;
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  uptimeDays: number;
  uptimeSec?: number; // 정수 초, 못 읽으면 -1 (구버전 서버 응답엔 없음)
  containers: Record<string, string>;
  containersCheckedAt: string;
}

export function useNasStatus(): { data: NasStatus | null; stale: boolean } {
  const [data, setData] = useState<NasStatus | null>(null);
  const [stale, setStale] = useState(false);
  const lastOkAt = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let controller: AbortController | null = null;
    let inFlight = false;
    let disposed = false;

    const load = () => {
      if (inFlight) return; // 진행 중이면 겹쳐 보내지 않는다
      inFlight = true;
      const ctrl = new AbortController();
      controller = ctrl;
      const abortTimer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      fetch("/api/nas-status", { cache: "no-store", signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: NasStatus) => {
          if (disposed) return;
          lastOkAt.current = Date.now();
          setData(d);
        })
        .catch(() => {})
        .finally(() => {
          clearTimeout(abortTimer);
          inFlight = false;
          if (controller === ctrl) controller = null;
          if (!disposed) {
            setStale(lastOkAt.current > 0 && Date.now() - lastOkAt.current > STALE_AFTER_MS);
          }
        });
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
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return { data, stale };
}
