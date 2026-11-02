"use client";

import { PORTAL_APPS } from "@/lib/portal-apps";
import {
  type KstNow, isPastTimed, PAST_COLOR, ROW_CLASS, TITLE_GAP_CLASS, timeColStyle, titleStyle, useNowHm,
} from "./timeColumn";
import { formatTodayDate, MoreLine, SectionHeader } from "./TodayView";
import type { TeamEvent, TodayData } from "./useAssistantToday";

// 업무 관리 '팀 일정'(today.team_events): 1024px 이상 오른쪽 열 '내 할 일' 아래 카드 · 1024px 미만 맨 위 카드 안 섹션
// 오늘 일정을 먼저, 그 아래 앞으로 며칠을 날짜 제목으로 묶는다. 목록이 비면 카드·섹션을 숨긴다(오류 문구 없음).
// 줄은 '내 할 일'과 같은 구조(왼쪽 칸 = 시간 80px · 제목 · 장소)
// 글자는 모두 React 텍스트로만 넣는다(HTML 로 해석하지 않음)

export const TEAM_URL = `${PORTAL_APPS.assistant.base}/?page=team`;
const CARD_MAX_ROWS = 8;

interface DayGroup {
  date: string;
  today: boolean;
  events: TeamEvent[];
}

/** 날짜별 묶음(오늘 먼저). 오늘 전에 시작해 이어지는 일정은 오늘 묶음에 둔다 */
export function groupTeamEvents(events: TeamEvent[], today: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of events) {
    const date = e.date < today ? today : e.date;
    let g = groups.find((x) => x.date === date);
    if (!g) {
      g = { date, today: date === today, events: [] };
      groups.push(g);
    }
    g.events.push(e);
  }
  // 응답은 시작 순이지만 이어지는 일정을 오늘로 옮겼으므로 날짜 순으로 다시 정렬
  return groups.sort((a, b) => a.date.localeCompare(b.date));
}

/** "2026-10-30" → "10-30" */
const md = (date: string) => date.slice(5, 10);

/**
 * 시각 칸: 여러 날이면 "10-30~31"(달이 다르면 "10-30~11-02"), 오늘 전에 시작해 이어지면 "10-27~",
 * 종일이면 "종일", 아니면 시작 시각
 */
export function teamEventTime(e: TeamEvent, today: string): string {
  if (e.endDate) {
    const end = e.endDate.slice(0, 7) === e.date.slice(0, 7) ? e.endDate.slice(8, 10) : md(e.endDate);
    return `${md(e.date)}~${end}`;
  }
  if (e.date < today) return `${md(e.date)}~`;
  if (e.allDay) return "종일";
  return e.start ?? "";
}

/** 오늘 시작·끝나는 시각 일정이 이미 지났는지(여러 날·종일·다음 날 일정은 지나지 않은 것으로 본다). now 가 null 이면 false */
export function isTeamEventPast(e: TeamEvent, today: string, now: KstNow | null): boolean {
  const timed = !e.allDay && !e.endDate && e.date === today;
  return timed && isPastTimed(e.start, e.end, today, now);
}

// 줄: 시간 칸(왼쪽 칸) · 제목 · 장소. 오늘 시각 일정이 지났으면 모두 흐린 회색
function TeamEventRow({ event, today, now }: { event: TeamEvent; today: string; now: KstNow | null }) {
  const past = isTeamEventPast(event, today, now);
  const kind = event.allDay || event.endDate || event.date < today ? "span" : "time";
  return (
    <li className={`flex items-center ${TITLE_GAP_CLASS} min-w-0 ${ROW_CLASS}`}>
      <span className="flex-shrink-0 tabular-nums whitespace-nowrap" style={timeColStyle(kind, past)}>
        {teamEventTime(event, today)}
      </span>
      <span className="truncate min-w-0" style={titleStyle(past || event.private)} title={event.title}>
        {event.title}
      </span>
      {event.location && (
        <span className="truncate flex-shrink min-w-0" style={{ fontSize: "11px", color: PAST_COLOR, maxWidth: "35%" }} title={event.location}>
          {event.location}
        </span>
      )}
    </li>
  );
}

/** 날짜 제목으로 묶은 목록 */
export function TeamEventList({ events, today, now }: { events: TeamEvent[]; today: string; now: KstNow | null }) {
  return (
    <div className="flex flex-col gap-1">
      {groupTeamEvents(events, today).map((g) => (
        <div key={g.date} className="flex flex-col">
          <h4 style={{ fontSize: "11px", fontWeight: 600, color: g.today ? "#0f766e" : "#6b7280" }}>
            {g.today ? "오늘" : formatTodayDate(g.date)}
          </h4>
          <ul className="flex flex-col">
            {g.events.map((e, i) => <TeamEventRow key={i} event={e} today={today} now={now} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 팀 일정 머리글: 전체 개수 · [전체 보기 →] */
export function TeamEventsHeader({ count, as }: { count: number; as?: "h2" | "h3" }) {
  return <SectionHeader as={as} title="팀 일정" count={count} href={TEAM_URL} />;
}

/** 1024px 이상: 오른쪽 열 '내 할 일' 아래 '팀 일정' 카드 (최대 8줄, 넘치면 "+ 일정 N개 더" → 팀 일정 화면). data 는 PortalHome 이 넘긴다 */
export function TeamEventsCard({ data }: { data: TodayData | null | undefined }) {
  const now = useNowHm();
  if (!data || data.teamEvents.length === 0) return null;
  const shown = data.teamEvents.slice(0, CARD_MAX_ROWS);
  const hidden = data.teamEvents.length - shown.length;
  return (
    <section
      className="hidden lg:flex flex-col gap-1.5 bg-white rounded-[12px] p-4 min-w-0"
      style={{ border: "0.5px solid #e5e7eb" }}
      aria-label="팀 일정"
    >
      <TeamEventsHeader count={data.teamEvents.length} />
      <TeamEventList events={shown} today={data.date} now={now} />
      {hidden > 0 && <MoreLine text={`+ 일정 ${hidden}개 더`} href={TEAM_URL} />}
    </section>
  );
}
