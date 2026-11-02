"use client";

import { COMPACT_CARD_ID, COMPACT_TITLE_ID, scrollToCompactCard, useToday } from "./TodayProvider";
import {
  Divided, EmptyTasks, isPastEvent, MoreLine, needsSetup, SetupGuide, StatusLine, TaskList, TodayBody,
  TodayEventList, TodayEventsHeader, TodayHeader,
} from "./TodayView";
import { isTeamEventPast, TeamEventList, TeamEventsHeader } from "./TeamEvents";
import { CHECK_COL_WIDTH, ROW_CLASS, TITLE_GAP_CLASS, useNowHm } from "./timeColumn";

// 첫 화면의 업무 관리 '내 할 일': 1024px 이상 오른쪽 열 맨 위 카드 · 1024px 미만 맨 위 카드(접기·펼치기)
// 응답·저장분을 기다리는 동안은 같은 모양의 자리표시를 두어 아래 카드가 밀리지 않게 하고,
// 401·403·오류로 확정되면 자리표시도 없앤다.

const COMPACT_ROWS = 3; // 접힌 상태에서 섹션마다 보이는 줄 수
const COMPACT_BODY_ID = "today-compact-body";
const CARD_CLASS = "bg-white rounded-[12px] p-4 min-w-0";
const CARD_STYLE: React.CSSProperties = { border: "0.5px solid #e5e7eb" };
const TOP_BAR_HEIGHT = "56px"; // 고정 상단바 — 접을 때 카드 머리글이 가리지 않게
const SKELETON_BG = "#f3f4f6";

function Bar({ width, height = 12 }: { width: number | string; height?: number }) {
  return <div style={{ width, height, borderRadius: "4px", backgroundColor: SKELETON_BG }} />;
}

// 머리글 자리표시(제목 + 개수, 높이 22px)
function SkeletonHeader() {
  return (
    <div className="flex items-center gap-2" style={{ height: 22 }}>
      <Bar width={52} height={16} />
      <Bar width={84} />
    </div>
  );
}

// 줄 자리표시(왼쪽 칸 + 제목 막대). 줄 높이는 실제 줄과 같다(1024px 이상 32px, 미만 36px)
function SkeletonRows({ count, task = false }: { count: number; task?: boolean }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`flex items-center ${TITLE_GAP_CLASS} ${ROW_CLASS}`}>
          <div className="flex items-center flex-shrink-0" style={{ width: "80px" }}>
            {task ? (
              <div className="flex justify-center" style={{ width: CHECK_COL_WIDTH }}><Bar width={16} height={16} /></div>
            ) : (
              <Bar width={40} />
            )}
          </div>
          <Bar width={`${60 - (i % 3) * 12}%`} />
        </div>
      ))}
    </div>
  );
}

/** 1024px 이상: 오른쪽 열 맨 위 '내 할 일' 카드(알림·서버 상태와 같은 폭) — 할 일 전부 · 오늘 일정 · 분석 상태 */
export function TodayCard() {
  const today = useToday();
  const now = useNowHm();
  if (!today) return null;
  if (today.loading) {
    return (
      <div className={`hidden lg:flex flex-col gap-3 ${CARD_CLASS}`} style={CARD_STYLE} aria-hidden>
        <SkeletonHeader />
        {/* 높이는 보통 경우(할 일 4줄 + 오늘 일정 2줄)에 맞춘다 */}
        <SkeletonRows count={4} task />
        <div className="flex flex-col gap-1.5" style={{ borderTop: "0.5px solid #f3f4f6", paddingTop: "12px" }}>
          <SkeletonHeader />
          <SkeletonRows count={2} />
        </div>
        <div style={{ borderTop: "0.5px solid #f3f4f6", paddingTop: "10px" }}>
          <Bar width="60%" height={16} />
        </div>
      </div>
    );
  }
  if (!today.data) return null;
  return (
    <section className={`hidden lg:flex flex-col gap-3 ${CARD_CLASS}`} style={CARD_STYLE} aria-label="내 할 일">
      <TodayHeader data={today.data} />
      <TodayBody data={today.data} actions={today.actions} now={now} />
    </section>
  );
}

/**
 * 1024px 미만: 첫 화면 맨 위 카드. 접힘(처음 열 때 항상) — 할 일·오늘 일정·팀 일정을 섹션마다 앞 3개(지난 일정 빼고)와 "+ N개 더".
 * 펼침 — 그 자리에서 아래로 늘어나 전부(지난 일정은 흐리게)와 분석 상태. 팝업·오버레이·스크롤 잠금 없음.
 */
export function TodayCompactCard() {
  const today = useToday();
  const now = useNowHm(); // 마운트 전(null)에는 아무것도 지난 것으로 보지 않는다(hydration 경고 없음)
  if (!today) return null;
  if (today.loading) {
    return (
      <div className={`lg:hidden flex flex-col gap-3 ${CARD_CLASS}`} style={CARD_STYLE} aria-hidden>
        <SkeletonHeader />
        <SkeletonRows count={COMPACT_ROWS} task />
        <div style={{ height: 34, borderRadius: "8px", backgroundColor: "#f9fafb" }} />
      </div>
    );
  }
  if (!today.data) return null;
  const { data, actions, compactExpanded: open, setCompactExpanded } = today;
  const setup = needsSetup(data);

  // 접힌 상태: 지난 일정을 뺀 것 중 앞 3개, 숨은 개수에는 지난 것도 넣는다. 펼치면 전부(숨은 줄 없음).
  // folded 는 접힌 상태 기준 숨은 개수 — [더 보기]·[접기] 버튼을 둘지 정한다
  const pick = <T,>(all: T[], past: (x: T) => boolean) => {
    const few = all.filter((x) => !past(x)).slice(0, COMPACT_ROWS);
    const folded = all.length - few.length;
    return open ? { shown: all, hidden: 0, folded } : { shown: few, hidden: folded, folded };
  };
  const tasks = pick(data.tasks, () => false);
  const events = pick(data.events, (e) => isPastEvent(e, data.date, now));
  const team = pick(data.teamEvents, (e) => isTeamEventPast(e, data.date, now));
  const showTasks = !setup;
  const showEvents = !setup && data.events.length > 0;
  const hasHidden = (showTasks && tasks.folded > 0) || (showEvents && events.folded > 0) || team.folded > 0;

  const expand = () => setCompactExpanded(true);
  const collapse = () => {
    setCompactExpanded(false);
    requestAnimationFrame(scrollToCompactCard); // 접은 뒤 카드 머리글이 화면 위에 오도록
  };
  const more = (text: string) => <MoreLine text={text} onClick={expand} controls={COMPACT_BODY_ID} expanded={false} />;

  return (
    <section
      id={COMPACT_CARD_ID}
      className={`lg:hidden flex flex-col gap-3 ${CARD_CLASS}`}
      style={{ ...CARD_STYLE, scrollMarginTop: TOP_BAR_HEIGHT }}
      aria-labelledby={COMPACT_TITLE_ID}
    >
      <TodayHeader data={data} titleId={COMPACT_TITLE_ID} />
      <div id={COMPACT_BODY_ID} className="flex flex-col gap-3">
        {setup ? (
          <SetupGuide compact />
        ) : (
          <section aria-label="할 일 목록">
            {data.tasks.length === 0 ? <EmptyTasks /> : <TaskList tasks={tasks.shown} actions={actions} />}
            {tasks.hidden > 0 && more(`+ 할 일 ${tasks.hidden}개 더`)}
          </section>
        )}
        {showEvents && (
          <Divided label="오늘 일정">
            <TodayEventsHeader count={data.events.length} />
            <div>
              <TodayEventList events={events.shown} today={data.date} now={now} />
              {events.hidden > 0 && more(`+ 일정 ${events.hidden}개 더`)}
            </div>
          </Divided>
        )}
        {data.teamEvents.length > 0 && (
          <Divided label="팀 일정">
            <TeamEventsHeader as="h3" count={data.teamEvents.length} />
            <div>
              <TeamEventList events={team.shown} today={data.date} now={now} />
              {team.hidden > 0 && more(`+ 일정 ${team.hidden}개 더`)}
            </div>
          </Divided>
        )}
        {open && !setup && <StatusLine data={data} />}
      </div>
      {hasHidden && (
        <button
          type="button"
          onClick={open ? collapse : expand}
          aria-expanded={open}
          aria-controls={COMPACT_BODY_ID}
          className="self-stretch rounded-lg hover:bg-gray-100 transition-colors font-medium"
          style={{ fontSize: "12px", color: "#374151", backgroundColor: "#f9fafb", height: "34px" }}
        >
          {open ? "접기 ▴" : "더 보기 ▾"}
        </button>
      )}
    </section>
  );
}
