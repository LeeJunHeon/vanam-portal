"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToday } from "./TodayProvider";
import { EmptyTasks, TaskRow, TodayBody, TodayHeader } from "./TodayView";

// 첫 화면의 '오늘': 1600px 이상 패널(접기 가능, 위쪽에 붙어 따라옴) · 768px 미만 맨 위 카드

const COLLAPSED_KEY = "portalTodayCollapsed";
const MOBILE_TASKS = 3;
const CARD_STYLE: React.CSSProperties = { border: "0.5px solid #e5e7eb" };

/** 1600px 이상: 가운데 열과 서버 상태 열 사이 320px 패널. 접으면 40px 띠 */
export function TodayPanel() {
  const today = useToday();
  const [collapsed, setCollapsed] = useState(false);
  // 접기·펼치기 뒤 바뀐 버튼으로 포커스를 옮긴다
  const toggleRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    // localStorage 는 마운트 뒤에만 읽는다(서버 렌더와 첫 화면을 맞추기 위해)
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (refocus.current) toggleRef.current?.focus();
    refocus.current = false;
  }, [collapsed]);

  const toggle = () => {
    const next = !collapsed;
    refocus.current = true;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch {}
  };

  if (!today?.data) return null;
  const { data, actions } = today;

  if (collapsed) {
    const n = data.counts.badge;
    return (
      <aside className="hidden min-[1600px]:block flex-shrink-0 sticky top-[72px] self-start" style={{ width: "40px" }} aria-label="오늘">
        <button
          ref={toggleRef}
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-label="오늘 펼치기"
          title="오늘 펼치기"
          className="w-full bg-white rounded-[12px] flex flex-col items-center gap-2 py-3 hover:border-[#93c5fd] transition-colors"
          style={CARD_STYLE}
        >
          <ChevronLeft size={16} color="#6b7280" aria-hidden />
          <span className="font-bold text-gray-900" style={{ fontSize: "13px", writingMode: "vertical-rl" }}>오늘</span>
          {n > 0 && (
            <span
              className="min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
              style={{ backgroundColor: "#0d9488" }}
            >
              {n > 99 ? "99+" : n}
            </span>
          )}
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden min-[1600px]:block flex-shrink-0 sticky top-[72px] self-start" style={{ width: "320px" }} aria-label="오늘">
      <div
        className="bg-white rounded-[12px] p-4 flex flex-col gap-4 overflow-y-auto"
        style={{ ...CARD_STYLE, maxHeight: "calc(100vh - 88px)" }}
      >
        <TodayHeader
          data={data}
          action={
            <button
              ref={toggleRef}
              type="button"
              onClick={toggle}
              aria-expanded
              aria-label="오늘 접기"
              title="오늘 접기"
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          }
        />
        <TodayBody data={data} actions={actions} />
      </div>
    </aside>
  );
}

/** 768px 미만: 첫 화면 맨 위 카드 — 할 일 3줄과 건수, [더 보기]는 전체 화면 시트 */
export function TodayMobileCard() {
  const today = useToday();
  if (!today?.data) return null;
  const { data, actions } = today;
  return (
    <section className="md:hidden bg-white rounded-[12px] p-4 flex flex-col gap-2 min-w-0" style={CARD_STYLE} aria-label="오늘">
      <TodayHeader
        data={data}
        action={
          <span className="tabular-nums" style={{ fontSize: "11px", color: "#6b7280" }}>
            할 일 {data.counts.active} · 일정 {data.events.length}
          </span>
        }
      />
      {data.tasks.length === 0 ? (
        <EmptyTasks />
      ) : (
        <ul className="flex flex-col -mx-1">
          {data.tasks.slice(0, MOBILE_TASKS).map((t) => <TaskRow key={t.id} task={t} actions={actions} />)}
        </ul>
      )}
      <button
        type="button"
        onClick={(e) => today.openSheet(e.currentTarget)}
        aria-haspopup="dialog"
        className="self-stretch rounded-lg hover:bg-gray-100 transition-colors font-medium"
        style={{ fontSize: "12px", color: "#374151", backgroundColor: "#f9fafb", height: "34px" }}
      >
        더 보기
      </button>
    </section>
  );
}
