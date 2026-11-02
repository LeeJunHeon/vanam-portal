"use client";

import { ArrowRight } from "lucide-react";
import { PORTAL_APPS } from "@/lib/portal-apps";
import {
  CHECK_COL_WIDTH, isPastTimed, type KstNow, ROW_CLASS, TITLE_GAP_CLASS, TITLE_OFFSET, timeColStyle, titleStyle,
} from "./timeColumn";
import type { TodayData, TodayEvent, TodayTask } from "./useAssistantToday";

// 업무 관리 '내 할 일' 카드 조각 — 오른쪽 열 카드(1024px 이상)·맨 위 카드(1024px 미만)가 같이 쓴다
// 모든 목록(할 일·오늘 일정·팀 일정)은 같은 머리글(SectionHeader)·줄 구조(왼쪽 칸 80px + 제목)를 쓴다
// 글자는 모두 React 텍스트로만 넣는다(HTML 로 해석하지 않음)

const BASE = PORTAL_APPS.assistant.base;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const HELP_URL = `${BASE}/?page=help`;
const TROUBLE_URL = `${BASE}/?page=help#help-trouble`; // 업무 관리 사용법의 '문제 해결' 위치
const TASKS_URL = `${BASE}/?page=tasks`;

const BANNER_TEXT = {
  connect: "수집 연결 필요",
  setup: "처음 설정 필요",
} as const;

// 할 일 줄 왼쪽 칸 = 체크박스 36px + 배지 44px(가장 긴 배지 "11-04" 10px 글씨 + 좌우 여백 6px, 실제 약 42px) = 80px
const BADGE_COL_WIDTH = "44px";
const DIVIDER_STYLE: React.CSSProperties = { borderTop: "0.5px solid #f3f4f6", paddingTop: "12px" };

/** 수집 연결·처음 설정이 안 됐고 할 일도 없으면 목록 대신 설정 안내를 보여 준다 */
export function needsSetup(data: TodayData): boolean {
  return (data.status.banner === "connect" || data.status.banner === "setup") && data.tasks.length === 0;
}

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

/**
 * 섹션 머리글 한 줄 — '내 할 일'·'오늘 일정'·'팀 일정'이 같은 모양:
 * 제목 15px bold · 개수 14px 600 · (선택) 작은 날짜 · 오른쪽 [전체 보기 →] 또는 작은 회색 메모. 좁으면 날짜만 말줄임한다.
 */
export function SectionHeader({ title, count, date, href, note, as: Tag = "h2", titleId, extra }: {
  title: string;
  count?: number;
  date?: string;
  href?: string;
  note?: string;
  as?: "h2" | "h3";
  titleId?: string; // 주면 머리글이 포커스를 받을 수 있다(상단바 버튼이 이동한 뒤 포커스)
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 whitespace-nowrap" style={{ height: "22px" }}>
      <Tag
        id={titleId}
        tabIndex={titleId ? -1 : undefined}
        className="font-bold flex-shrink-0 outline-none focus-visible:underline"
        style={{ fontSize: "15px", color: "#111827" }}
      >
        {title}
      </Tag>
      {count !== undefined && (
        <span className="tabular-nums flex-shrink-0" style={{ fontSize: "14px", fontWeight: 600, color: "#374151" }}>
          {count}
        </span>
      )}
      {date && <span className="truncate min-w-0" style={{ fontSize: "11px", color: "#9ca3af" }}>{date}</span>}
      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
        {href ? (
          <a href={href} className="flex items-center gap-0.5 hover:underline" style={{ fontSize: "11px", color: "#2563eb" }}>
            전체 보기 <ArrowRight size={12} aria-hidden />
          </a>
        ) : note ? (
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>{note}</span>
        ) : null}
        {extra}
      </div>
    </div>
  );
}

/** 숨은 개수 줄 "+ 할 일 N개 더" — 제목 시작 위치에 맞춘다. onClick 이면 버튼, href 면 링크 */
export function MoreLine({ text, onClick, href, controls, expanded }: {
  text: string;
  onClick?: () => void;
  href?: string;
  controls?: string;
  expanded?: boolean;
}) {
  const className = `flex items-center w-full text-left rounded-lg hover:bg-gray-50 transition-colors ${ROW_CLASS}`;
  const style: React.CSSProperties = { fontSize: "11px", color: "#6b7280", paddingLeft: TITLE_OFFSET };
  if (href) return <a href={href} className={className} style={{ ...style, textDecoration: "none" }}>{text}</a>;
  return (
    <button type="button" onClick={onClick} aria-controls={controls} aria-expanded={expanded} className={className} style={style}>
      {text}
    </button>
  );
}

/** 섹션 사이 구분선(0.5px #f3f4f6) */
export function Divided({ children, label }: { children: React.ReactNode; label: string }) {
  return <section aria-label={label} className="flex flex-col gap-1.5" style={DIVIDER_STYLE}>{children}</section>;
}

function TaskBadge({ task }: { task: TodayTask }) {
  const badge =
    task.group === "overdue" ? { text: "지남", bg: "#fee2e2", fg: "#dc2626" }
    : task.group === "today" ? { text: "오늘", bg: "#ffedd5", fg: "#ea580c" }
    : task.group === "new" ? { text: "신규", bg: "#dbeafe", fg: "#2563eb" }
    : task.due ? { text: task.due.slice(5, 10), bg: "#f3f4f6", fg: "#6b7280" }
    : null;
  // 배지 자리는 고정 폭 칸(배지가 없어도 빈 칸) — 모든 제목이 같은 위치에서 시작한다
  return (
    <span className="flex-shrink-0 flex items-center" style={{ width: BADGE_COL_WIDTH }}>
      {badge && (
        <span
          className="rounded-full font-semibold tabular-nums whitespace-nowrap"
          style={{ fontSize: "10px", padding: "1px 6px", backgroundColor: badge.bg, color: badge.fg }}
        >
          {badge.text}
        </span>
      )}
    </span>
  );
}

export interface TaskActions {
  pending: ReadonlySet<string>; // 완료 처리 중(체크된) 할 일
  onComplete: (task: TodayTask) => void;
}

// 줄: [체크박스 36px | 배지 44px] = 왼쪽 칸 80px · 제목. 체크박스 label 은 줄 높이 전체 × 36px 을 눌리는 영역으로 갖는다.
// 체크박스와 링크는 형제 요소라 체크해도 이동하지 않는다
export function TaskRow({ task, actions }: { task: TodayTask; actions: TaskActions }) {
  const checked = actions.pending.has(task.id);
  return (
    <li className={`flex items-center min-w-0 rounded-lg hover:bg-gray-50 transition-colors ${ROW_CLASS}`}>
      <label className="flex items-center justify-center flex-shrink-0 cursor-pointer self-stretch" style={{ width: CHECK_COL_WIDTH }}>
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
        className={`flex items-center ${TITLE_GAP_CLASS} flex-1 min-w-0 pr-2 self-stretch`}
        style={{ textDecoration: "none", opacity: checked ? 0.5 : 1 }}
      >
        <TaskBadge task={task} />
        <span
          className="truncate"
          style={{ ...titleStyle(), textDecoration: checked ? "line-through" : undefined }}
          title={task.title}
        >
          {task.title}
        </span>
      </a>
    </li>
  );
}

export function TaskList({ tasks, actions }: { tasks: TodayTask[]; actions: TaskActions }) {
  return (
    <ul className="flex flex-col">
      {tasks.map((t) => <TaskRow key={t.id} task={t} actions={actions} />)}
    </ul>
  );
}

/** 설정 안내(제목·설명·[설정 방법 보기]). compact 는 좁은 화면 맨 위 카드용 짧은 모양 */
export function SetupGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-start ${compact ? "gap-2" : "gap-3"}`} style={{ padding: compact ? "2px 0" : "4px 0" }}>
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

/** 오늘 일정(내 일정)이 지났는지 — 응답에 끝 시각이 없어 시작 시각으로 판단. now 가 null(마운트 전)이면 false */
export function isPastEvent(e: TodayEvent, today: string, now: KstNow | null): boolean {
  return !e.allDay && isPastTimed(e.start, null, today, now);
}

// 오늘 일정 줄: 시간 칸(왼쪽 칸) · 제목. 지난 일정은 흐리게
export function TodayEventList({ events, today, now }: { events: TodayEvent[]; today: string; now: KstNow | null }) {
  return (
    <ul className="flex flex-col">
      {events.map((e, i) => {
        const past = isPastEvent(e, today, now);
        return (
          <li key={i} className={`flex items-center ${TITLE_GAP_CLASS} min-w-0 ${ROW_CLASS}`}>
            <span className="flex-shrink-0 tabular-nums whitespace-nowrap" style={timeColStyle(e.allDay ? "span" : "time", past)}>
              {e.allDay ? "종일" : (e.start ?? "")}
            </span>
            <span className="truncate min-w-0" style={titleStyle(past)} title={e.title}>{e.title}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** '오늘 일정' 머리글(내 할 일 카드 안) */
export function TodayEventsHeader({ count }: { count: number }) {
  return <SectionHeader as="h3" title="오늘 일정" count={count} note="04:00 기준" />;
}

export function EmptyTasks() {
  return <p style={{ fontSize: "12px", color: "#9ca3af", padding: "6px 0" }}>오늘 처리할 할 일이 없습니다.</p>;
}

/** 맨 아래 줄: 마지막 분석 · 분석 대기 N건 (설정이 덜 됐으면 주황 안내, 오래됐으면 해결 방법) */
export function StatusLine({ data }: { data: TodayData }) {
  const { status } = data;
  return (
    <div
      className="flex items-center gap-1.5 flex-wrap"
      style={{ fontSize: "11px", color: "#9ca3af", borderTop: "0.5px solid #f3f4f6", paddingTop: "10px" }}
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

/** 1024px 이상 카드 본문: 할 일 전부 · 오늘 일정 · 분석 상태 (머리글은 TodayHeader) */
export function TodayBody({ data, actions, now }: { data: TodayData; actions: TaskActions; now: KstNow | null }) {
  if (needsSetup(data)) return <SetupGuide />;
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="할 일 목록">
        {data.tasks.length === 0 ? <EmptyTasks /> : <TaskList tasks={data.tasks} actions={actions} />}
      </section>
      {data.events.length > 0 && (
        <Divided label="오늘 일정">
          <TodayEventsHeader count={data.events.length} />
          <TodayEventList events={data.events} today={data.date} now={now} />
        </Divided>
      )}
      <StatusLine data={data} />
    </div>
  );
}

/** '내 할 일' 머리글: 건수 · 작은 날짜 · [전체 보기 →]. 설정 안내 상태면 건수·[전체 보기]를 숨긴다 */
export function TodayHeader({ data, titleId }: { data: TodayData; titleId?: string }) {
  const setup = needsSetup(data);
  return (
    <SectionHeader
      title="내 할 일"
      count={setup ? undefined : data.counts.active}
      date={formatTodayDate(data.date)}
      href={setup ? undefined : TASKS_URL}
      titleId={titleId}
    />
  );
}
