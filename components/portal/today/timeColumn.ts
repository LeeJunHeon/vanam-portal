"use client";

import { useSyncExternalStore } from "react";

// '내 할 일' 카드의 오늘 일정 줄 · 팀 일정 줄이 같이 쓰는 시간 칸 규칙과 KST 현재 시각

/** 시간 칸 폭 — 가장 긴 표시 "10-30~11-02"(12px, tabular-nums, 실제 약 77px)가 들어가는 값. 모든 줄의 제목 시작 위치가 같다 */
export const TIME_COL_WIDTH = "80px";

export const PAST_COLOR = "#9ca3af"; // 지난 일정: 시간 칸·제목·장소

/** 시간 칸 글자 모양: 종일·여러 날·이어지는 일정은 짙은 회색, 시각(HH:MM)은 회색. 지난 일정은 흐린 회색 */
export function timeColStyle(kind: "span" | "time", past = false): React.CSSProperties {
  return {
    width: TIME_COL_WIDTH,
    color: past ? PAST_COLOR : kind === "span" ? "#374151" : "#6b7280",
    fontWeight: kind === "span" ? 500 : 400,
  };
}

/** KST 현재 날짜·시각 "YYYY-MM-DD HH:MM" (브라우저 시간대와 무관) */
const KST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function kstNowString(): string {
  const p = Object.fromEntries(KST_FORMAT.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function subscribe(onChange: () => void): () => void {
  const id = setInterval(onChange, 60_000); // 1분마다 다시 판단
  return () => clearInterval(id);
}

export interface KstNow {
  date: string; // YYYY-MM-DD
  hm: string;   // HH:MM
}

/**
 * KST 현재 시각(1분마다 갱신). 서버 렌더링·처음 hydration 에서는 null 이라 아무 줄도 흐리게 하지 않는다
 * (서버와 첫 클라이언트 화면이 같아 hydration 경고가 나지 않는다).
 */
export function useNowHm(): KstNow | null {
  const s = useSyncExternalStore(subscribe, kstNowString, () => null);
  return s ? { date: s.slice(0, 10), hm: s.slice(11, 16) } : null;
}

/**
 * 오늘(today, 응답의 KST 날짜) 시각 일정이 지났는지. 끝 시각이 있으면 끝, 없으면 시작으로 본다.
 * 끝이 시작보다 이르면(자정을 넘기는 일정) 오늘 안에는 지나지 않은 것으로 본다. now 가 null(마운트 전)이면 false.
 */
export function isPastTimed(start: string | null, end: string | null, today: string, now: KstNow | null): boolean {
  if (!now || !start) return false;
  if (now.date > today) return true; // 자정을 넘겨 응답이 어제 것이면 오늘 일정은 모두 지남
  if (now.date < today) return false;
  const ref = !end ? start : end >= start ? end : "24:00";
  return ref < now.hm;
}
