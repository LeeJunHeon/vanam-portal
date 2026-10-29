"use client";

import { ChevronRight } from "lucide-react";
import { useToday } from "./TodayProvider";
import { EmptyTasks, needsSetup, SetupGuide, TaskRow, TodayBody, TodayHeader } from "./TodayView";

// 첫 화면의 업무 관리 '내 할 일': 1024px 이상 오른쪽 열 맨 위 카드 · 1024px 미만 맨 위 카드(할 일 3줄 + 더 보기)
// 응답·저장분을 기다리는 동안은 같은 모양의 자리표시를 두어 아래 카드가 밀리지 않게 하고,
// 401·403·오류로 확정되면 자리표시도 없앤다.

const COMPACT_TASKS = 3;
const CARD_CLASS = "bg-white rounded-[12px] p-4 min-w-0";
const CARD_STYLE: React.CSSProperties = { border: "0.5px solid #e5e7eb" };
const SKELETON_BG = "#f3f4f6";
const ROW_HEIGHT = 32; // TaskRow 높이

function Bar({ width, height = 12 }: { width: number | string; height?: number }) {
  return <div style={{ width, height, borderRadius: "4px", backgroundColor: SKELETON_BG }} />;
}

// 할 일 줄 자리표시(체크박스 + 제목 막대)
function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
          <Bar width={16} height={16} />
          <Bar width={`${70 - (i % 3) * 12}%`} />
        </div>
      ))}
    </div>
  );
}

/** 1024px 이상: 오른쪽 열 맨 위 '내 할 일' 카드(알림·서버 상태와 같은 폭) */
export function TodayCard() {
  const today = useToday();
  if (!today) return null;
  if (today.loading) {
    return (
      <div className={`hidden lg:flex flex-col gap-4 ${CARD_CLASS}`} style={CARD_STYLE} aria-hidden>
        <div className="flex items-center gap-2" style={{ height: 22 }}>
          <Bar width={36} height={16} />
          <Bar width={84} />
        </div>
        {/* 높이는 보통 경우(할 일 4줄 + 일정 2줄)에 맞춘다 */}
        <SkeletonRows count={4} />
        <div className="flex flex-col gap-2.5">
          <Bar width={72} height={11} />
          <Bar width="75%" />
          <Bar width="55%" />
        </div>
        <div style={{ borderTop: "0.5px solid #f3f4f6", paddingTop: "10px" }}>
          <Bar width="60%" height={11} />
        </div>
      </div>
    );
  }
  if (!today.data) return null;
  return (
    <section className={`hidden lg:flex flex-col gap-4 ${CARD_CLASS}`} style={CARD_STYLE} aria-label="내 할 일">
      <TodayHeader data={today.data} />
      <TodayBody data={today.data} actions={today.actions} />
    </section>
  );
}

/** 1024px 미만: 첫 화면 맨 위 카드 — 할 일 3줄과 건수, 팀 일정이 있으면 "팀 일정 N" 한 줄, [더 보기]는 시트 */
export function TodayCompactCard() {
  const today = useToday();
  if (!today) return null;
  if (today.loading) {
    return (
      <div className={`lg:hidden flex flex-col gap-2 ${CARD_CLASS}`} style={CARD_STYLE} aria-hidden>
        <div className="flex items-center gap-2" style={{ height: 22 }}>
          <Bar width={36} height={16} />
          <Bar width={84} />
        </div>
        <SkeletonRows count={COMPACT_TASKS} />
        <div style={{ height: 34, borderRadius: "8px", backgroundColor: "#f9fafb" }} />
      </div>
    );
  }
  if (!today.data) return null;
  const { data, actions } = today;
  const setup = needsSetup(data);
  return (
    <section className={`lg:hidden flex flex-col gap-2 ${CARD_CLASS}`} style={CARD_STYLE} aria-label="내 할 일">
      <TodayHeader data={data} />
      {setup ? (
        <SetupGuide compact />
      ) : data.tasks.length === 0 ? (
        <EmptyTasks />
      ) : (
        <ul className="flex flex-col -mx-1">
          {data.tasks.slice(0, COMPACT_TASKS).map((t) => <TaskRow key={t.id} task={t} actions={actions} />)}
        </ul>
      )}
      {data.teamEvents.length > 0 && (
        // 팀 일정은 시트 안 칸에서 본다(할 일·내 일정 아래)
        <button
          type="button"
          onClick={(e) => today.openSheet(e.currentTarget)}
          aria-haspopup="dialog"
          className="flex items-center gap-1.5 rounded-lg hover:bg-gray-50 transition-colors -mx-1 px-1"
          style={{ height: "32px", fontSize: "13px", color: "#374151" }}
        >
          <span className="font-medium">팀 일정</span>
          <span className="tabular-nums font-semibold" style={{ color: "#0f766e" }}>{data.teamEvents.length}</span>
          <ChevronRight size={14} className="ml-auto" style={{ color: "#9ca3af" }} aria-hidden />
        </button>
      )}
      {!setup && (
        <button
          type="button"
          onClick={(e) => today.openSheet(e.currentTarget)}
          aria-haspopup="dialog"
          className="self-stretch rounded-lg hover:bg-gray-100 transition-colors font-medium"
          style={{ fontSize: "12px", color: "#374151", backgroundColor: "#f9fafb", height: "34px" }}
        >
          더 보기
        </button>
      )}
    </section>
  );
}
