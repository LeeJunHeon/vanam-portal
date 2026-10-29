"use client";

import { ArrowRight } from "lucide-react";
import { PORTAL_APPS } from "@/lib/portal-apps";
import { formatTodayDate } from "./TodayView";
import type { TeamEvent, TodayData } from "./useAssistantToday";

// 업무 관리 '팀 일정'(today.team_events): 1024px 이상 오른쪽 열 '내 할 일' 아래 카드 · 1024px 미만은 '내 할 일' 시트 안 칸
// 오늘 일정을 먼저, 그 아래 앞으로 며칠을 날짜 제목으로 묶는다. 목록이 비면 카드·칸을 숨긴다(오류 문구 없음).
// 글자는 모두 React 텍스트로만 넣는다(HTML 로 해석하지 않음)

const TEAM_URL = `${PORTAL_APPS.assistant.base}/?page=team`;
const CARD_MAX_ROWS = 8;
const COMPANY = "회사"; // 주인이 없는 일정 — 업무 관리가 owners ["회사"]로 준다

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "11px", fontWeight: 500, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em",
};

interface DayGroup {
  date: string;
  today: boolean;
  events: TeamEvent[];
}

/** 날짜별 묶음(오늘 먼저). 오늘 전에 시작해 이어지는 일정은 오늘 묶음에 둔다. max 는 줄 수 상한 */
export function groupTeamEvents(events: TeamEvent[], today: string, max = Infinity): DayGroup[] {
  const groups: DayGroup[] = [];
  let rows = 0;
  for (const e of events) {
    if (rows >= max) break;
    const date = e.date < today ? today : e.date;
    let g = groups.find((x) => x.date === date);
    if (!g) {
      g = { date, today: date === today, events: [] };
      groups.push(g);
    }
    g.events.push(e);
    rows++;
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

/** 주인 칩 글자: 여러 명이면 "A·B", 없거나 회사 일정이면 "회사" */
export function ownerLabel(e: TeamEvent): { text: string; company: boolean } {
  const names = e.owners.filter((n) => n !== COMPANY);
  return names.length === 0 ? { text: COMPANY, company: true } : { text: names.join("·"), company: false };
}

function TeamEventRow({ event, today }: { event: TeamEvent; today: string }) {
  const owner = ownerLabel(event);
  const time = teamEventTime(event, today);
  return (
    <li className="flex items-center gap-1.5 min-w-0" style={{ fontSize: "12px", minHeight: "24px" }}>
      <span
        className="flex-shrink-0 tabular-nums whitespace-nowrap"
        style={{ minWidth: "38px", color: event.allDay || event.endDate ? "#0f766e" : "#6b7280", fontWeight: 500 }}
      >
        {time}
      </span>
      <span
        className="flex-shrink-0 truncate rounded-full font-semibold"
        style={{
          maxWidth: "96px", fontSize: "10px", padding: "1px 6px",
          backgroundColor: owner.company ? "#f3f4f6" : "#ccfbf1",
          color: owner.company ? "#6b7280" : "#0f766e",
        }}
        title={owner.text}
      >
        {owner.text}
      </span>
      <span
        className="truncate min-w-0"
        style={{ color: event.private ? "#9ca3af" : "#1f2937" }}
        title={event.title}
      >
        {event.title}
      </span>
      {event.location && (
        <span className="truncate flex-shrink min-w-0" style={{ fontSize: "11px", color: "#9ca3af", maxWidth: "35%" }} title={event.location}>
          {event.location}
        </span>
      )}
    </li>
  );
}

/** 날짜 제목으로 묶은 목록 (카드·시트가 같이 쓴다) */
function TeamEventList({ events, today, max }: { events: TeamEvent[]; today: string; max?: number }) {
  const groups = groupTeamEvents(events, today, max);
  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((g) => (
        <div key={g.date} className="flex flex-col gap-0.5">
          <h4 style={{ fontSize: "11px", fontWeight: 600, color: g.today ? "#0f766e" : "#6b7280" }}>
            {g.today ? "오늘" : formatTodayDate(g.date)}
          </h4>
          <ul className="flex flex-col">
            {g.events.map((e, i) => <TeamEventRow key={i} event={e} today={today} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AllLink() {
  return (
    <a href={TEAM_URL} className="ml-auto flex items-center gap-0.5 hover:underline flex-shrink-0" style={{ fontSize: "11px", color: "#2563eb" }}>
      전체 보기 <ArrowRight size={12} aria-hidden />
    </a>
  );
}

/** 1024px 이상: 오른쪽 열 '내 할 일' 아래 '팀 일정' 카드 (최대 8줄). data 는 PortalHome 이 useToday() 로 넘긴다(시트가 이 파일을 쓰므로 TodayProvider 를 import 하지 않음) */
export function TeamEventsCard({ data }: { data: TodayData | null | undefined }) {
  if (!data || data.teamEvents.length === 0) return null;
  return (
    <section
      className="hidden lg:flex flex-col gap-3 bg-white rounded-[12px] p-4 min-w-0"
      style={{ border: "0.5px solid #e5e7eb" }}
      aria-label="팀 일정"
    >
      <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
        <h2 className="font-bold text-gray-900" style={{ fontSize: "15px" }}>팀 일정</h2>
        <span className="tabular-nums" style={{ fontSize: "14px", fontWeight: 600, color: "#374151" }}>
          {data.teamEvents.length}
        </span>
        <AllLink />
      </div>
      <TeamEventList events={data.teamEvents} today={data.date} max={CARD_MAX_ROWS} />
    </section>
  );
}

/** 1024px 미만 '내 할 일' 시트 안의 팀 일정 칸 (할 일·내 일정 아래, 전부) */
export function TeamEventsSection({ events, today }: { events: TeamEvent[]; today: string }) {
  if (events.length === 0) return null;
  return (
    <section aria-label="팀 일정">
      <div className="flex items-center gap-1.5" style={{ marginBottom: "6px" }}>
        <h3 style={LABEL_STYLE}>팀 일정</h3>
        <span className="tabular-nums" style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>{events.length}</span>
        <AllLink />
      </div>
      <TeamEventList events={events} today={today} />
    </section>
  );
}
