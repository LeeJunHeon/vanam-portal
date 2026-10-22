"use client";

import { useEffect, useState } from "react";
import type { AppKey } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";

// 앱 카드 데이터 (이전 AppCardGrid 의 데이터 로직 그대로):
// 역할(/hr/api/me + sessionStorage 캐시), 앱별 요약, 근태 연결 상태
// 앱 운영 상태는 넘겨받은 containers(useNasStatus 결과)로 계산한다 — nas-status 는 여기서 부르지 않는다

export type AppRunStatus = "online" | "offline";

export interface AppSummary {
  status: AppRunStatus;
  stat1?: string;
  stat2?: string;
  connState?: "online" | "offline"; // 근태만
}

export interface AppSummaries {
  role: string | null;
  isAdmin: boolean;
  apps: Record<AppKey, AppSummary>;
}

export function useAppSummaries(containers: Record<string, string> | null): AppSummaries {
  const [invStat1, setInvStat1] = useState<string | undefined>(undefined);
  const [invStat2, setInvStat2] = useState<string | undefined>(undefined);
  const [eqStat1, setEqStat1] = useState<string | undefined>(undefined);
  const [eqStat2, setEqStat2] = useState<string | undefined>(undefined);
  const [officeStat1, setOfficeStat1] = useState<string | undefined>(undefined);
  const [hrStat1, setHrStat1] = useState<string | undefined>(undefined);
  const [hrStat2, setHrStat2] = useState<string | undefined>(undefined);
  const [hrConnState, setHrConnState] = useState<"online" | "offline" | undefined>(undefined);
  const [role, setRole] = useState<string | null>(null); // 역할 필터용

  useEffect(() => {
    // [역할 필터용] 로그인 사용자 role 조회
    // 새로고침 깜빡임 방지: 캐시된 role로 먼저 즉시 판단
    try {
      const cached = sessionStorage.getItem("portalUserRole");
      // sessionStorage 는 마운트 뒤에만 읽을 수 있다(서버 렌더와 첫 화면을 맞추기 위해)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cached) setRole(cached);
    } catch {}
    // 최신 role 재확인 (근태앱 /hr/api/me = ceo/admin/employee)
    fetch("/hr/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rr = d?.role ?? null;
        setRole(rr);
        try { if (rr) sessionStorage.setItem("portalUserRole", rr); } catch {}
      })
      .catch(() => {});

    // 재고관리 요약
    fetch(`${PORTAL_APPS.inventory.base}/api/portal-summary`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setInvStat1(`품목 ${d.totalItems ?? "--"}개`);
        setInvStat2(`오늘 입고 ${d.todayIn ?? 0} · 불출 ${d.todayUse ?? 0} · 출고 ${d.todayOut ?? 0}`);
      })
      .catch(() => {});

    // 장비관리 요약
    fetch(`${PORTAL_APPS.equipment.base}/api/dashboard`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        const total = d.equipments?.length ?? "--";
        const unresolved = d.totalUnresolved ?? 0;
        setEqStat1(`장비 ${total}대`);
        setEqStat2(`미해결 수리 ${unresolved}건`);
      })
      .catch(() => {});

    // 근태 요약 (본인 연결상태 + 이번주 집계)
    fetch(`${PORTAL_APPS.hr.base}/api/portal-summary`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.hasEmployee) return; // 미로그인/미매핑이면 표시 안 함
        // 연결중 / 연결 끊김 2가지로 단순화 (working = WiFi 연결, 그 외 = 끊김)
        const connected = d.progressStatus === "working";
        setHrConnState(connected ? "online" : "offline");
        setHrStat1(connected ? "연결중" : "연결 끊김");
        const w = d.week ?? {};
        setHrStat2(
          `이번주 정상 ${w.normal ?? 0} · 지각 ${w.late ?? 0} · 조퇴 ${w.earlyLeave ?? 0} · 결근 ${w.absent ?? 0}`
        );
      })
      .catch(() => {});

    // 경영지원 요약
    fetch(`${PORTAL_APPS.office.base}/api/portal-summary`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setOfficeStat1(`지재권 ${d.patents ?? 0} · 장비 ${d.assets ?? 0} · 인사 ${d.personalInfo ?? 0}`);
      })
      .catch(() => {});
  }, []);

  // 컨테이너 상태 → 앱 카드 뱃지 (아직 못 받았으면 online 으로 둔다)
  const st = (app: AppKey): AppRunStatus =>
    !containers || containers[PORTAL_APPS[app].container] === "running" ? "online" : "offline";

  return {
    role,
    isAdmin: role === "admin" || role === "ceo",
    apps: {
      inventory: { status: st("inventory"), stat1: invStat1, stat2: invStat2 },
      equipment: { status: st("equipment"), stat1: eqStat1, stat2: eqStat2 },
      hr: { status: st("hr"), stat1: hrStat1, stat2: hrStat2, connState: hrConnState },
      office: { status: st("office"), stat1: officeStat1 },
      process: { status: st("process") },
      translator: { status: st("translator") },
    },
  };
}
