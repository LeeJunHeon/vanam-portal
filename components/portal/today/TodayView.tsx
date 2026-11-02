"use client";

import { PORTAL_APPS } from "@/lib/portal-apps";
import type { TodayData, TodayTask } from "./useAssistantToday";

// '내 업무' 카드가 쓰는 공통 조각 — 설정 안내·빈 목록 문구·맨 아래 분석 상태 줄·날짜 글자
// 글자는 모두 React 텍스트로만 넣는다(HTML 로 해석하지 않음)

const BASE = PORTAL_APPS.assistant.base;
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const HELP_URL = `${BASE}/?page=help`;
const TROUBLE_URL = `${BASE}/?page=help#help-trouble`; // 업무 관리 사용법의 '문제 해결' 위치

const BANNER_TEXT = {
  connect: "수집 연결 필요",
  setup: "처음 설정 필요",
} as const;

export interface TaskActions {
  pending: ReadonlySet<string>; // 완료 처리 중(체크된) 할 일
  onComplete: (task: TodayTask) => void;
}

/** 수집 연결·처음 설정이 안 됐고 할 일도 없으면 목록 대신 설정 안내를 보여 준다 */
export function needsSetup(data: TodayData): boolean {
  return (data.status.banner === "connect" || data.status.banner === "setup") && data.tasks.length === 0;
}

/** "2026-11-02" → 요일 번호(0=일). 시간대와 무관 */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "2026-10-27" → "10월 27일 (화)" */
export function formatTodayDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[weekdayOf(date)]})`;
}

// "2026-10-27T09:12+09:00" → 같은 날이면 "09:12", 다른 날이면 "10-26 09:12"
function formatAnalysisTime(iso: string, today: string): string {
  const hm = iso.slice(11, 16);
  return iso.slice(0, 10) === today ? hm : `${iso.slice(5, 10)} ${hm}`;
}

/** 설정 안내(제목·설명·[설정 방법 보기]). compact 는 카드 안 짧은 모양 */
export function SetupGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-start ${compact ? "gap-2" : "gap-3"}`} style={{ padding: compact ? "6px 0" : "4px 0" }}>
      <div className="flex flex-col gap-1">
        <p className="font-semibold" style={{ fontSize: "13px", color: "#111827" }}>업무 관리를 아직 설정하지 않았습니다.</p>
        {!compact && (
          <p style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5 }}>
            처음 한 번 설정하면 매일 아침 할 일이 여기에 나옵니다.
          </p>
        )}
      </div>
      <a
        href={HELP_URL}
        className="inline-flex items-center rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        style={{ fontSize: "12px", padding: "7px 12px", textDecoration: "none" }}
      >
        설정 방법 보기
      </a>
    </div>
  );
}

export function EmptyTasks() {
  return (
    <p className="flex items-center" style={{ fontSize: "12px", color: "#9ca3af", height: "36px" }}>
      오늘 처리할 할 일이 없습니다.
    </p>
  );
}

/** 맨 아래 줄: 마지막 분석 · 분석 대기 N건 (설정이 덜 됐으면 주황 안내, 오래됐으면 해결 방법) */
export function StatusLine({ data }: { data: TodayData }) {
  const { status } = data;
  return (
    <div
      className="flex items-center gap-1.5 flex-wrap"
      style={{ fontSize: "11px", color: "#9ca3af", borderTop: "0.5px solid #f3f4f6", paddingTop: "8px", minHeight: "25px" }}
    >
      {status.banner === "connect" || status.banner === "setup" ? (
        // 설정이 덜 된 상태는 눈에 띄게(주황 바탕 줄)
        <div
          className="flex items-center gap-2 flex-wrap w-full rounded-lg"
          style={{ backgroundColor: "#fff7ed", padding: "6px 10px" }}
        >
          <span style={{ fontSize: "12px", color: "#ea580c", fontWeight: 600 }}>{BANNER_TEXT[status.banner]}</span>
          <a href={HELP_URL} className="ml-auto font-medium hover:underline" style={{ fontSize: "12px", color: "#2563eb" }}>
            설정 방법 보기
          </a>
        </div>
      ) : status.banner === "stale" ? (
        <>
          <span style={{ color: "#ea580c", fontWeight: 500 }}>최근 분석 없음</span>
          <span aria-hidden>·</span>
          <a href={TROUBLE_URL} className="hover:underline" style={{ color: "#2563eb" }}>해결 방법</a>
        </>
      ) : (
        <span className="tabular-nums">
          마지막 분석 {status.lastAnalysis ? formatAnalysisTime(status.lastAnalysis, data.date) : "-"} · 분석 대기{" "}
          {status.pendingItems}건
        </span>
      )}
    </div>
  );
}
