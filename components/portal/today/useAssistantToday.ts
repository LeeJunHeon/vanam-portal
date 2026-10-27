"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PORTAL_APPS } from "@/lib/portal-apps";

// 업무 비서 '오늘' 자료 (GET /assistant/api/today, 같은 출처·로그인 쿠키 그대로)
// 401·403·네트워크 오류·형식이 틀린 응답이면 data 는 null — 패널·버튼·타일 요약을 모두 숨긴다.
// 페이지를 열 때 한 번, 창이 다시 보일 때 마지막으로 부른 지 5분이 넘었으면 다시 부른다.

const BASE = PORTAL_APPS.assistant.base;
const TODAY_URL = `${BASE}/api/today`;
const STALE_MS = 5 * 60_000;

export type TodayGroup = "overdue" | "today" | "new" | "week" | "later" | "none";
export type TodayBanner = "connect" | "setup" | "stale";

export interface TodayTask {
  id: string;
  title: string;
  group: TodayGroup;
  due: string | null; // YYYY-MM-DD
  isNew: boolean;
  url: string;
}

export interface TodayEvent {
  start: string | null; // HH:MM, 종일이면 null
  allDay: boolean;
  title: string;
}

export interface TodayData {
  date: string; // YYYY-MM-DD (KST)
  counts: { new: number; overdue: number; today: number; week: number; active: number; badge: number };
  tasks: TodayTask[];
  events: TodayEvent[];
  status: { lastAnalysis: string | null; lastCollected: string | null; pendingItems: number; banner: TodayBanner | null };
}

const GROUPS: readonly TodayGroup[] = ["overdue", "today", "new", "week", "later", "none"];
const BANNERS: readonly TodayBanner[] = ["connect", "setup", "stale"];

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// 업무 비서 안의 경로만 링크로 쓴다(javascript: 등 다른 주소는 할 일 목록으로)
function safeTaskUrl(v: unknown): string {
  return typeof v === "string" && v.startsWith(`${BASE}/`) ? v : `${BASE}/?page=tasks`;
}

function parseToday(raw: unknown): TodayData | null {
  const d = obj(raw);
  const date = str(d.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(d.tasks)) return null;
  const c = obj(d.counts);
  const s = obj(d.status);
  const tasks: TodayTask[] = [];
  for (const t of d.tasks) {
    const o = obj(t);
    const id = typeof o.id === "number" ? String(o.id) : str(o.id);
    if (!id) continue;
    tasks.push({
      id,
      title: str(o.title) ?? "(제목 없음)",
      group: GROUPS.includes(o.group as TodayGroup) ? (o.group as TodayGroup) : "none",
      due: str(o.due),
      isNew: o.is_new === true,
      url: safeTaskUrl(o.url),
    });
  }
  const events: TodayEvent[] = (Array.isArray(d.events) ? d.events : []).map((e) => {
    const o = obj(e);
    return { start: str(o.start), allDay: o.all_day === true, title: str(o.title) ?? "(제목 없음)" };
  });
  return {
    date,
    counts: {
      new: num(c.new), overdue: num(c.overdue), today: num(c.today),
      week: num(c.week), active: num(c.active), badge: num(c.badge),
    },
    tasks,
    events,
    status: {
      lastAnalysis: str(s.last_analysis),
      lastCollected: str(s.last_collected),
      pendingItems: num(s.pending_items),
      banner: BANNERS.includes(s.banner as TodayBanner) ? (s.banner as TodayBanner) : null,
    },
  };
}

export interface AssistantToday {
  data: TodayData | null;
  reload: () => void;
  /** 화면에서 그 할 일 줄만 바로 지운다(완료 처리 성공 직후, 다시 불러오기 전) */
  dropTask: (id: string) => void;
}

export function useAssistantToday(): AssistantToday {
  const [data, setData] = useState<TodayData | null>(null);
  const lastLoaded = useRef(0);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const mine = ++seq.current;
    lastLoaded.current = Date.now();
    fetch(TODAY_URL, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (mine === seq.current) setData(d ? parseToday(d) : null);
      })
      .catch(() => {
        if (mine === seq.current) setData(null);
      });
  }, []);

  useEffect(() => {
    reload();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoaded.current > STALE_MS) reload();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [reload]);

  const dropTask = useCallback((id: string) => {
    setData((cur) => (cur ? { ...cur, tasks: cur.tasks.filter((t) => t.id !== id) } : cur));
  }, []);

  return { data, reload, dropTask };
}

/**
 * 완료 처리 결과
 * - done: 완료됨(2xx)
 * - gone: 이미 그 상태(409)·없는 할 일(404) — 다른 화면에서 이미 처리됐거나 사라진 경우
 * - failed: 그 밖의 상태 코드·네트워크 오류
 */
export type CompleteResult = "done" | "gone" | "failed";

export interface CompleteOutcome {
  result: CompleteResult;
  authLost: boolean; // 401·403(로그인 만료 등) — today 를 다시 불러 패널을 숨긴다
}

export async function completeTask(id: string): Promise<CompleteOutcome> {
  try {
    const r = await fetch(`${BASE}/api/tasks/${encodeURIComponent(id)}/status`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    if (r.ok) return { result: "done", authLost: false };
    if (r.status === 404 || r.status === 409) return { result: "gone", authLost: false };
    return { result: "failed", authLost: r.status === 401 || r.status === 403 };
  } catch {
    return { result: "failed", authLost: false };
  }
}
