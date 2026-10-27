"use client";

import { ArrowRight } from "lucide-react";
import { PORTAL_APPS } from "@/lib/portal-apps";
import type { TodayData, TodayTask } from "./useAssistantToday";

// '오늘' 내용 조각 — 넓은 화면 패널·서랍·모바일 시트·모바일 카드가 같이 쓴다
// 글자는 모두 React 텍스트로만 넣는다(HTML 로 해석하지 않음)

const BASE = PORTAL_APPS.assistant.base;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const BANNER_TEXT = {
  connect: "수집 연결 필요",
  setup: "처음 설정 필요",
  stale: "최근 분석 없음",
} as const;

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em",
};

/** "2026-10-27" → "10월 27일 (화)" */
export function formatTodayDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

// "2026-10-27T09:12+09:00" → 같은 날이면 "09:12", 다른 날이면 "10-26 09:12"
function formatAnalysisTime(iso: string, today: string): string {
  const hm = iso.slice(11, 16);
  return iso.slice(0, 10) === today ? hm : `${iso.slice(5, 10)} ${hm}`;
}

function TaskBadge({ task }: { task: TodayTask }) {
  const badge =
    task.group === "overdue" ? { text: "지남", bg: "#fee2e2", fg: "#dc2626" }
    : task.group === "today" ? { text: "오늘", bg: "#ffedd5", fg: "#ea580c" }
    : task.group === "new" ? { text: "신규", bg: "#dbeafe", fg: "#2563eb" }
    : task.due ? { text: task.due.slice(5, 10), bg: "#f3f4f6", fg: "#6b7280" }
    : null;
  if (!badge) return null;
  return (
    <span
      className="rounded-full font-semibold flex-shrink-0 tabular-nums"
      style={{ fontSize: "10px", padding: "1px 6px", backgroundColor: badge.bg, color: badge.fg }}
    >
      {badge.text}
    </span>
  );
}

export interface TaskActions {
  pending: ReadonlySet<string>; // 완료 처리 중(체크된) 할 일
  onComplete: (task: TodayTask) => void;
}

// 줄: 체크박스(완료) · 배지 · 제목 — 체크박스와 링크는 형제 요소라 체크해도 이동하지 않는다
export function TaskRow({ task, actions }: { task: TodayTask; actions: TaskActions }) {
  const checked = actions.pending.has(task.id);
  return (
    <li className="flex items-center min-w-0 rounded-lg hover:bg-gray-50 transition-colors">
      <label className="flex items-center justify-center flex-shrink-0 cursor-pointer" style={{ width: "30px", height: "32px" }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={checked}
          onChange={() => actions.onComplete(task)}
          aria-label={`${task.title} 완료`}
          className="w-4 h-4 cursor-pointer"
          style={{ accentColor: "#0d9488" }}
        />
      </label>
      <a
        href={task.url}
        className="flex items-center gap-1.5 flex-1 min-w-0 pr-2"
        style={{ height: "32px", textDecoration: "none", opacity: checked ? 0.5 : 1 }}
      >
        <TaskBadge task={task} />
        <span
          className="truncate"
          style={{ fontSize: "13px", color: "#1f2937", textDecoration: checked ? "line-through" : undefined }}
          title={task.title}
        >
          {task.title}
        </span>
      </a>
    </li>
  );
}

export function EmptyTasks() {
  return <p style={{ fontSize: "12px", color: "#9ca3af", padding: "6px 4px" }}>오늘 처리할 할 일이 없습니다.</p>;
}

/** 패널·서랍·시트 본문: 내 할 일 · 오늘 일정 · 분석 상태 */
export function TodayBody({ data, actions }: { data: TodayData; actions: TaskActions }) {
  const { status } = data;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="내 할 일">
        <div className="flex items-center gap-1.5" style={{ marginBottom: "6px" }}>
          <h3 style={LABEL_STYLE}>내 할 일</h3>
          <span className="tabular-nums" style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
            {data.counts.active}
          </span>
          <a
            href={`${BASE}/?page=tasks`}
            className="ml-auto flex items-center gap-0.5 hover:underline"
            style={{ fontSize: "11px", color: "#2563eb" }}
          >
            전체 보기 <ArrowRight size={12} aria-hidden />
          </a>
        </div>
        {data.tasks.length === 0 ? (
          <EmptyTasks />
        ) : (
          <ul className="flex flex-col -mx-1">
            {data.tasks.map((t) => <TaskRow key={t.id} task={t} actions={actions} />)}
          </ul>
        )}
      </section>

      {data.events.length > 0 && (
        <section aria-label="오늘 일정">
          <div className="flex items-center gap-1.5" style={{ marginBottom: "6px" }}>
            <h3 style={LABEL_STYLE}>오늘 일정</h3>
            <span className="tabular-nums" style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
              {data.events.length}
            </span>
            <span className="ml-auto" style={{ fontSize: "10px", color: "#9ca3af" }}>04:00 기준</span>
          </div>
          <ul className="flex flex-col gap-1">
            {data.events.map((e, i) => (
              <li key={i} className="flex items-center gap-2 min-w-0" style={{ fontSize: "12px" }}>
                <span
                  className="flex-shrink-0 tabular-nums"
                  style={{ width: "38px", color: e.allDay ? "#0f766e" : "#6b7280", fontWeight: 500 }}
                >
                  {e.allDay ? "종일" : (e.start ?? "")}
                </span>
                <span className="truncate" style={{ color: "#1f2937" }} title={e.title}>{e.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        className="flex items-center gap-1.5 flex-wrap"
        style={{ fontSize: "11px", color: "#9ca3af", borderTop: "0.5px solid #f3f4f6", paddingTop: "10px" }}
      >
        {status.banner ? (
          <>
            <span style={{ color: "#ea580c", fontWeight: 500 }}>{BANNER_TEXT[status.banner]}</span>
            <a href={`${BASE}/?page=help`} className="hover:underline" style={{ color: "#2563eb" }}>사용법</a>
          </>
        ) : (
          <span className="tabular-nums">
            마지막 분석 {status.lastAnalysis ? formatAnalysisTime(status.lastAnalysis, data.date) : "-"} · 분석 대기{" "}
            {status.pendingItems}건
          </span>
        )}
      </div>
    </div>
  );
}

/** 머리: "오늘" + 날짜 + 오른쪽 버튼(접기·닫기) */
export function TodayHeader({ data, titleId, action }: { data: TodayData; titleId?: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <h2 id={titleId} className="font-bold text-gray-900 flex-shrink-0" style={{ fontSize: "15px" }}>오늘</h2>
      <span className="truncate" style={{ fontSize: "12px", color: "#6b7280" }}>{formatTodayDate(data.date)}</span>
      <div className="ml-auto flex-shrink-0">{action}</div>
    </div>
  );
}
