"use client";

import { Fragment, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { PORTAL_APPS } from "@/lib/portal-apps";
import { useToday, WORK_CARD_ID, type WorkTab } from "./TodayProvider";
import {
  EmptyTasks, formatTodayDate, needsSetup, SetupGuide, StatusLine, type TaskActions, WEEKDAYS, weekdayOf,
} from "./TodayView";
import { CHECK_COL_WIDTH, isPastTimed, type KstNow, PAST_COLOR, ROW_CLASS, TIME_COL_WIDTH, useNowHm } from "./timeColumn";
import { addDays, type ScheduleEvent, type TodayData, type TodayTask } from "./useAssistantToday";

// 첫 화면 업무 관리 '내 업무' 카드: [할 일 N] [일정 M] 탭 + 일정 탭의 7일 날짜 띠.
// 1024px 미만은 맨 위(placement="top"), 1024px 이상은 오른쪽 열 맨 위(placement="side") — 같은 컴포넌트·같은 모양이고
// 화면 폭에 따라 하나만 보인다. 선택 탭은 TodayProvider 가 갖고(상단바 버튼이 '할 일'을 고른다) 저장하지 않는다.
// 응답·저장분을 기다리는 동안은 같은 크기의 자리표시를 두어 아래 카드가 밀리지 않게 하고, 401·403·오류면 카드를 숨긴다.
// 글자는 모두 React 텍스트로만 넣는다(HTML 로 해석하지 않음)

const BASE = PORTAL_APPS.assistant.base;
const TASKS_URL = `${BASE}/?page=tasks`;
const TEAM_URL = `${BASE}/?page=team`;
const MAX_ROWS = 8; // 할 일 탭 전체·일정 탭 한 날 최대 줄 수
const TOP_BAR_HEIGHT = "56px"; // 고정 상단바 — 상단바 버튼으로 이동할 때 카드 머리글이 가리지 않게
const SKELETON_BG = "#f3f4f6";

const CARD_CLASS = "bg-white rounded-[12px] min-w-0 flex-col gap-2";
const CARD_STYLE: React.CSSProperties = { border: "0.5px solid #e5e7eb", padding: "10px 12px 8px" };
const PLACEMENT_CLASS = { top: "flex lg:hidden", side: "hidden lg:flex" } as const;
type Placement = keyof typeof PLACEMENT_CLASS;

/** "2026-11-04" → "11-04" */
const md = (date: string) => date.slice(5, 10);

// ───────── 공통 조각 ─────────

interface BadgeSpec {
  text: string;
  bg: string;
  fg: string;
}

const BADGE = {
  new: { bg: "#dbeafe", fg: "#2563eb" },
  overdue: { bg: "#fee2e2", fg: "#dc2626" },
  today: { bg: "#ffedd5", fg: "#ea580c" },
  gray: { bg: "#f3f4f6", fg: "#6b7280" },
  mine: { bg: "#ede9fe", fg: "#5b21b6" },
} as const;

function Badges({ items }: { items: BadgeSpec[] }) {
  if (items.length === 0) return null;
  return (
    <span className="flex items-center gap-1 flex-shrink-0">
      {items.map((b) => (
        <span
          key={b.text}
          className="rounded-full font-semibold tabular-nums whitespace-nowrap"
          style={{ fontSize: "10px", padding: "1px 6px", backgroundColor: b.bg, color: b.fg }}
        >
          {b.text}
        </span>
      ))}
    </span>
  );
}

/** "할 일 N개 더 · 전체 보기" 같은 마지막 링크 줄 */
function MoreLink({ text, href, indent }: { text: string; href: string; indent: string }) {
  return (
    <a
      href={href}
      className="flex items-center h-9 lg:h-8 hover:underline"
      style={{ fontSize: "11px", color: "#6b7280", paddingLeft: indent, textDecoration: "none" }}
    >
      {text}
    </a>
  );
}

/** 좌우 화살표·Home·End 로 옆 탭으로 옮겨 고르고 포커스한다(끝에서는 반대쪽으로 돈다) */
function onArrowKey(e: React.KeyboardEvent<HTMLButtonElement>, index: number, count: number, select: (i: number) => void) {
  const next =
    e.key === "ArrowRight" ? (index + 1) % count
    : e.key === "ArrowLeft" ? (index - 1 + count) % count
    : e.key === "Home" ? 0
    : e.key === "End" ? count - 1
    : -1;
  if (next < 0) return;
  e.preventDefault();
  select(next);
  (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
}

// ───────── 할 일 탭 ─────────

type Bucket = "upto" | "week" | "later" | "none";
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "upto", label: "오늘까지" },
  { key: "week", label: "이번 주" },
  { key: "later", label: "나중" },
  { key: "none", label: "기한 없음" },
];

/** 묶음: 기한 지남·오늘 → 오늘까지. 신규(new)는 기한으로 나눈다(업무 관리와 같은 규칙: 이번 주 = 내일 ~ 이번 주 일요일) */
function bucketOf(t: TodayTask, today: string): Bucket {
  if (t.group === "overdue" || t.group === "today") return "upto";
  if (t.group === "week" || t.group === "later" || t.group === "none") return t.group;
  if (!t.due) return "none";
  if (t.due <= today) return "upto";
  return t.due <= addDays(today, (7 - weekdayOf(today)) % 7) ? "week" : "later";
}

/** 오른쪽 배지: 신규 · 기한(지남 MM-DD / 오늘 / MM-DD 요일) */
function taskBadges(t: TodayTask, today: string): BadgeSpec[] {
  const out: BadgeSpec[] = [];
  if (t.isNew) out.push({ text: "신규", ...BADGE.new });
  if (t.due) {
    if (t.due < today) out.push({ text: `지남 ${md(t.due)}`, ...BADGE.overdue });
    else if (t.due === today) out.push({ text: "오늘", ...BADGE.today });
    else out.push({ text: `${md(t.due)} ${WEEKDAYS[weekdayOf(t.due)]}`, ...BADGE.gray });
  }
  return out;
}

// 줄: 체크박스(눌리는 영역 36px × 줄 높이) · 제목(누르면 할 일 상세) · 배지. 체크박스와 링크는 형제 요소라 체크해도 이동하지 않는다
function TaskRow({ task, today, actions }: { task: TodayTask; today: string; actions: TaskActions }) {
  const checked = actions.pending.has(task.id);
  return (
    <li className={`flex items-center min-w-0 ${ROW_CLASS}`}>
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
        className="flex items-center gap-2 flex-1 min-w-0 self-stretch rounded-md hover:bg-gray-50 transition-colors pr-1"
        style={{ textDecoration: "none", opacity: checked ? 0.5 : 1 }}
      >
        <span
          className="truncate flex-1 min-w-0"
          style={{ fontSize: "13px", color: "#1f2937", textDecoration: checked ? "line-through" : undefined }}
          title={task.title}
        >
          {task.title}
        </span>
        <Badges items={taskBadges(task, today)} />
      </a>
    </li>
  );
}

function TasksPanel({ data, actions }: { data: TodayData; actions: TaskActions }) {
  if (needsSetup(data)) return <SetupGuide compact />;
  if (data.tasks.length === 0) return <EmptyTasks />;
  // 묶음 순서대로 펼친 뒤 앞 8줄
  const ordered = BUCKETS.flatMap((b) => data.tasks.filter((t) => bucketOf(t, data.date) === b.key));
  const shown = ordered.slice(0, MAX_ROWS);
  const more = Math.max(data.counts.active, data.tasks.length) - shown.length;
  return (
    <div className="flex flex-col">
      {BUCKETS.map((b) => {
        const rows = shown.filter((t) => bucketOf(t, data.date) === b.key);
        if (rows.length === 0) return null;
        return (
          <section key={b.key} aria-label={b.label}>
            <h3 className="flex items-center" style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", height: "22px" }}>
              {b.label}
            </h3>
            <ul className="flex flex-col">
              {rows.map((t) => <TaskRow key={t.id} task={t} today={data.date} actions={actions} />)}
            </ul>
          </section>
        );
      })}
      {more > 0 && <MoreLink text={`할 일 ${more}개 더 · 전체 보기`} href={TASKS_URL} indent={CHECK_COL_WIDTH} />}
    </div>
  );
}

// ───────── 일정 탭 ─────────

const isSpan = (e: ScheduleEvent) => e.allDay || e.endDate !== null; // 종일·여러 날
const onDay = (e: ScheduleEvent, day: string) => e.date <= day && day <= (e.endDate ?? e.date);

/** 그날에 걸치는 일정: 종일·여러 날 먼저, 그다음 시작 시각 순(같으면 응답 순) */
function eventsOn(events: ScheduleEvent[], day: string): ScheduleEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => onDay(e, day))
    .sort((a, b) =>
      Number(isSpan(b.e)) - Number(isSpan(a.e)) || (a.e.start ?? "").localeCompare(b.e.start ?? "") || a.i - b.i)
    .map(({ e }) => e);
}

/** 날짜 띠 7칸: 첫 칸 '오늘', 나머지 '화 3'. 아래 줄에 그날 일정 수 */
function DateStrip({ days, counts, selected, onSelect, panelId }: {
  days: string[];
  counts: number[];
  selected: number;
  onSelect: (i: number) => void;
  panelId: string;
}) {
  return (
    <div role="tablist" aria-label="날짜" className="grid grid-cols-7" style={{ height: "40px", gap: "4px" }}>
      {days.map((d, i) => {
        const sel = i === selected;
        const wd = weekdayOf(d);
        const weekend = wd === 0 || wd === 6;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={sel}
            aria-controls={panelId}
            aria-label={`${i === 0 ? "오늘, " : ""}${formatTodayDate(d)}, 일정 ${counts[i]}개`}
            tabIndex={sel ? 0 : -1}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => onArrowKey(e, i, days.length, onSelect)}
            className={`flex flex-col items-center justify-center rounded-lg min-w-0 transition-colors ${sel ? "" : "hover:bg-gray-50"}`}
            style={{
              border: `1px solid ${sel ? "#0f766e" : "transparent"}`,
              backgroundColor: sel ? "#f0fdfa" : undefined,
              color: sel ? "#0f766e" : weekend ? "#9ca3af" : "#374151",
              fontWeight: sel ? 600 : 500,
              lineHeight: 1.2,
            }}
          >
            <span className="whitespace-nowrap" style={{ fontSize: "11px" }}>{i === 0 ? "오늘" : `${WEEKDAYS[wd]} ${Number(d.slice(8, 10))}`}</span>
            <span
              className="tabular-nums"
              style={{ fontSize: "10px", color: counts[i] === 0 ? "#d1d5db" : sel ? "#0f766e" : "#6b7280" }}
            >
              {counts[i]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// 줄: 시간 칸 48px(종일·여러 날은 "종일") · 제목(title 속성에 제목 · 장소) · 표시(~MM-DD, 내 일정)
function EventRow({ event, past }: { event: ScheduleEvent; past: boolean }) {
  const span = isSpan(event);
  const badges: BadgeSpec[] = [];
  if (event.endDate) badges.push({ text: `~${md(event.endDate)}`, ...BADGE.gray });
  if (event.mine) badges.push({ text: "내 일정", ...BADGE.mine });
  return (
    <li className={`flex items-center gap-2 min-w-0 ${ROW_CLASS}`}>
      <span
        className="flex-shrink-0 tabular-nums whitespace-nowrap"
        style={{
          width: TIME_COL_WIDTH, fontSize: "12px",
          color: past ? PAST_COLOR : span ? "#374151" : "#6b7280", fontWeight: span ? 500 : 400,
        }}
      >
        {span ? "종일" : (event.start ?? "")}
      </span>
      <span
        className="truncate flex-1 min-w-0"
        style={{ fontSize: "13px", color: past ? PAST_COLOR : "#1f2937" }}
        title={event.location ? `${event.title} · ${event.location}` : event.title}
      >
        {event.title}
      </span>
      <Badges items={badges} />
    </li>
  );
}

/** 현재 시각 선(오늘 칸, 지난 일정과 남은 일정 사이) — 빨강 1px 선 + 왼쪽 HH:MM. 화면 읽기 프로그램에는 숨긴다 */
function NowLine({ hm }: { hm: string }) {
  return (
    <li aria-hidden className="flex items-center gap-2" style={{ height: "14px" }} data-now-line>
      <span className="flex-shrink-0 tabular-nums font-semibold" style={{ width: TIME_COL_WIDTH, fontSize: "10px", color: "#dc2626" }}>
        {hm}
      </span>
      <span className="flex-1" style={{ height: "1px", backgroundColor: "#dc2626" }} />
    </li>
  );
}

function SchedulePanel({ data, now }: { data: TodayData; now: KstNow | null }) {
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const { days, events } = data.schedule;
  const counts = days.map((d) => events.filter((e) => onDay(e, d)).length);
  const index = Math.min(selected, days.length - 1);
  const day = days[index];
  const isToday = index === 0;
  const all = eventsOn(events, day);
  // 오늘 칸에서만: 지난 시각 일정 흐림(끝 시각, 없으면 시작 시각 기준) · 현재 시각 선(시각 일정이 있을 때만)
  const past = all.map((e) => isToday && !isSpan(e) && isPastTimed(e.start, e.end, data.date, now));
  const shown = all.slice(0, MAX_ROWS);
  const more = all.length - shown.length;
  let lineAt = -1;
  if (isToday && now && all.some((e) => !isSpan(e))) {
    const lastPast = past.lastIndexOf(true);
    lineAt = lastPast >= 0 ? lastPast + 1 : all.findIndex((e) => !isSpan(e));
    if (lineAt > shown.length || (lineAt === shown.length && more > 0)) lineAt = -1; // 숨은 줄 사이면 그리지 않는다
  }
  return (
    <div className="flex flex-col gap-1.5">
      <DateStrip days={days} counts={counts} selected={index} onSelect={setSelected} panelId={listId} />
      <div id={listId} role="tabpanel" aria-label={`${formatTodayDate(day)} 일정`}>
        {all.length === 0 ? (
          <p className="flex items-center" style={{ fontSize: "12px", color: "#9ca3af", height: "36px" }}>일정이 없습니다</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {shown.map((e, i) => (
                <Fragment key={i}>
                  {i === lineAt && now && <NowLine hm={now.hm} />}
                  <EventRow event={e} past={past[i]} />
                </Fragment>
              ))}
              {lineAt === shown.length && now && <NowLine hm={now.hm} />}
            </ul>
            {more > 0 && <MoreLink text={`일정 ${more}개 더 · 전체 보기`} href={TEAM_URL} indent="0px" />}
          </>
        )}
      </div>
    </div>
  );
}

// ───────── 카드 ─────────

const TABS: { key: WorkTab; label: string }[] = [
  { key: "tasks", label: "할 일" },
  { key: "schedule", label: "일정" },
];

function Bar({ width, height = 12 }: { width: number | string; height?: number }) {
  return <div style={{ width, height, borderRadius: "4px", backgroundColor: SKELETON_BG }} />;
}

// 자리표시: 머리글·탭·줄 4개·아래 줄 크기 그대로
function WorkCardSkeleton({ placement }: { placement: Placement }) {
  return (
    <div className={`${PLACEMENT_CLASS[placement]} ${CARD_CLASS}`} style={CARD_STYLE} aria-hidden>
      <div className="flex items-center gap-2" style={{ height: "28px" }}>
        <Bar width={52} height={16} />
        <Bar width={84} />
      </div>
      <div className="rounded-lg" style={{ height: "32px", backgroundColor: SKELETON_BG }} />
      <div className="flex flex-col">
        <div style={{ height: "22px" }} />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center h-9 lg:h-8">
            <div className="flex justify-center flex-shrink-0" style={{ width: CHECK_COL_WIDTH }}><Bar width={16} height={16} /></div>
            <Bar width={`${60 - (i % 3) * 12}%`} />
          </div>
        ))}
      </div>
      <div className="flex items-center" style={{ borderTop: "0.5px solid #f3f4f6", paddingTop: "8px", minHeight: "25px" }}>
        <Bar width="55%" height={11} />
      </div>
    </div>
  );
}

/** 첫 화면 '내 업무' 카드. placement: top = 1024px 미만 맨 위, side = 1024px 이상 오른쪽 열 맨 위 */
export default function WorkCard({ placement }: { placement: Placement }) {
  const today = useToday();
  const now = useNowHm(); // 마운트 전(null)에는 흐림·현재 시각 선 없음(hydration 경고 없음)
  const ids = useId();
  if (!today) return null;
  if (today.loading) return <WorkCardSkeleton placement={placement} />;
  if (!today.data) return null;
  const { data, actions, tab, setTab } = today;
  const titleId = `${ids}-title`;
  const panelId = `${ids}-panel`;
  const tabId = (t: WorkTab) => `${ids}-tab-${t}`;
  const todayCount = data.schedule.events.filter((e) => onDay(e, data.schedule.days[0])).length;
  const count = { tasks: data.counts.active, schedule: todayCount };

  return (
    <section
      id={placement === "top" ? WORK_CARD_ID : undefined}
      className={`${PLACEMENT_CLASS[placement]} ${CARD_CLASS}`}
      style={{ ...CARD_STYLE, scrollMarginTop: TOP_BAR_HEIGHT }}
      aria-labelledby={titleId}
    >
      <div className="flex items-center gap-2 min-w-0 whitespace-nowrap" style={{ height: "28px" }}>
        <h2 id={titleId} className="font-bold flex-shrink-0" style={{ fontSize: "15px", color: "#111827" }}>내 업무</h2>
        <span className="truncate min-w-0" style={{ fontSize: "11px", color: "#9ca3af" }}>{formatTodayDate(data.date)}</span>
        <a
          href={tab === "tasks" ? TASKS_URL : TEAM_URL}
          className="ml-auto flex items-center gap-0.5 hover:underline flex-shrink-0"
          style={{ fontSize: "11px", color: "#2563eb" }}
        >
          전체 보기 <ArrowRight size={12} aria-hidden />
        </a>
      </div>

      <div
        role="tablist"
        aria-label="내 업무"
        className="grid grid-cols-2 rounded-lg"
        style={{ height: "32px", backgroundColor: "#f3f4f6", padding: "2px", gap: "2px" }}
      >
        {TABS.map((t, i) => {
          const sel = tab === t.key;
          return (
            <button
              key={t.key}
              id={tabId(t.key)}
              type="button"
              role="tab"
              data-tab={t.key}
              aria-selected={sel}
              aria-controls={panelId}
              tabIndex={sel ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onArrowKey(e, i, TABS.length, (j) => setTab(TABS[j].key))}
              className="flex items-center justify-center gap-1 rounded-md transition-colors"
              style={{
                fontSize: "12px",
                fontWeight: sel ? 600 : 500,
                color: sel ? "#111827" : "#6b7280",
                backgroundColor: sel ? "#ffffff" : "transparent",
                border: `0.5px solid ${sel ? "#e5e7eb" : "transparent"}`,
              }}
            >
              {t.label}
              <span className="tabular-nums">{count[t.key]}</span>
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="min-w-0">
        {tab === "tasks" ? <TasksPanel data={data} actions={actions} /> : <SchedulePanel data={data} now={now} />}
      </div>

      <StatusLine data={data} />
    </section>
  );
}
