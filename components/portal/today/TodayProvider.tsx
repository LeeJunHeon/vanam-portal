"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import Toast from "@/components/portal/home/Toast";
import { completeTask, type TodayData, type TodayTask, undoTask, useAssistantToday } from "./useAssistantToday";
import type { TaskActions } from "./TodayView";

// 업무 관리 '오늘' 공유 상태: 상단바 [내 할 일] 버튼·첫 화면 '내 업무' 카드·업무 관리 타일 요약이 같이 쓴다.
// 카드의 선택 탭(할 일·일정)도 여기 둔다 — 상단바 버튼이 '할 일' 탭을 고르고, 저장하지 않는다.

const TOAST_MS = 2500;
const UNDO_MS = 5000; // "완료했습니다 [되돌리기]" 토스트

/** 1024px 미만 '내 업무' 카드 id (상단바 버튼의 aria-controls·이동 대상) */
export const WORK_CARD_ID = "my-work";

export type WorkTab = "tasks" | "schedule";

interface TodayContextValue {
  data: TodayData | null;
  loading: boolean; // 응답·저장분을 기다리는 중(자리표시)
  actions: TaskActions;
  tab: WorkTab;
  setTab: (tab: WorkTab) => void;
  /** 상단바 버튼: '할 일' 탭을 고르고 카드로 스크롤한 뒤 그 탭에 포커스 */
  showTasks: () => void;
}

const TodayContext = createContext<TodayContextValue | null>(null);

/** 공급자 밖(다른 화면의 상단바 등)에서는 null */
export function useToday(): TodayContextValue | null {
  return useContext(TodayContext);
}


export default function TodayProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, reload, dropTask } = useAssistantToday();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tabChoice, setTab] = useState<WorkTab | null>(null);
  // 처음 여는 탭은 자료가 처음 들어올 때 정한다: 할 일이 있으면 '할 일', 없으면 '일정' (렌더 중 한 번만 바꾼다)
  if (tabChoice === null && data) setTab(data.tasks.length > 0 ? "tasks" : "schedule");
  const tab = tabChoice ?? "tasks";

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  // 예전 접기 기능이 남긴 값 정리(접은 상태는 저장하지 않는다)
  useEffect(() => {
    try { localStorage.removeItem("portalTodayCollapsed"); } catch {}
  }, []);

  const showToast = useCallback((message: string, ms = TOAST_MS, action?: { label: string; onClick: () => void }) => {
    setToast({ message, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // [되돌리기]: 업무 관리 /undo 가 이전 상태로 돌린다 → today 를 다시 부른다(줄이 다시 나타난다)
  const undoComplete = useCallback(async (task: TodayTask) => {
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const { result, authLost } = await undoTask(task.id);
    if (result === "done") {
      reload();
      return;
    }
    if (result === "changed") {
      // 그 사이 다른 변경(AI·다른 화면)·10분 지남·없는 할 일 — 지금 상태로 다시 그린다
      showToast("이미 바뀌어 되돌릴 수 없습니다. 업무 관리에서 확인하세요.");
      reload();
      return;
    }
    if (authLost) reload(); // 로그인 만료 등: 다시 불러 패널이 숨겨지게
    showToast("되돌리지 못했습니다.");
  }, [reload, showToast]);

  const onComplete = useCallback(async (task: TodayTask) => {
    setPending((cur) => new Set(cur).add(task.id));
    const { result, authLost } = await completeTask(task.id);
    setPending((cur) => {
      const next = new Set(cur);
      next.delete(task.id);
      return next;
    });
    // done·gone(이미 처리됐거나 사라진 할 일)은 줄을 지우고 다시 불러온다.
    // done 만 "완료했습니다 [되돌리기]"(5초) — gone 은 다른 화면에서 이미 처리된 것이라 토스트 없음
    if (result !== "failed") {
      dropTask(task.id);
      reload();
      if (result === "done") showToast("완료했습니다", UNDO_MS, { label: "되돌리기", onClick: () => void undoComplete(task) });
      return;
    }
    // 로그인 만료 등(401·403): 다시 불러 패널이 숨겨지게 한다
    if (authLost) reload();
    showToast("완료 처리하지 못했습니다. 업무 관리에서 다시 시도하세요.");
  }, [dropTask, reload, showToast, undoComplete]);

  const showTasks = useCallback(() => {
    setTab("tasks");
    // 탭이 바뀐 화면이 그려진 뒤 이동·포커스(포커스로 다시 스크롤되지 않게 preventScroll). 움직임 줄이기 설정이면 즉시 이동
    requestAnimationFrame(() => {
      const card = document.getElementById(WORK_CARD_ID);
      if (!card) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      card.querySelector<HTMLElement>('[role="tab"][data-tab="tasks"]')?.focus({ preventScroll: true });
    });
  }, []);

  const actions: TaskActions = { pending, onComplete: (t) => void onComplete(t) };

  return (
    <TodayContext.Provider value={{ data, loading, actions, tab, setTab, showTasks }}>
      {children}
      <Toast message={toast?.message ?? null} action={toast?.action} />
    </TodayContext.Provider>
  );
}

/**
 * 상단바 [내 할 일 N] 버튼(1024px 미만) — 첫 화면 '내 업무' 카드로 이동해 '할 일' 탭을 고르고 그 탭에 포커스한다.
 * 1024px 이상에서는 오른쪽 열에 카드가 보이므로 숨긴다. 640px 미만은 글자가 길어 아이콘 + 숫자만 보인다.
 */
export function TodayButton() {
  const today = useToday();
  if (!today?.data) return null;
  const n = today.data.counts.badge;
  return (
    <button
      type="button"
      onClick={today.showTasks}
      aria-controls={WORK_CARD_ID}
      aria-label={n > 0 ? `내 할 일 ${n}건` : "내 할 일"}
      title="내 할 일"
      className="lg:hidden flex items-center gap-1 px-2 sm:px-2.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-semibold whitespace-nowrap"
      style={{ height: "34px", fontSize: "13px" }}
    >
      <ListChecks size={18} className="sm:hidden text-gray-500" aria-hidden />
      <span className="hidden sm:inline">내 할 일</span>
      {n > 0 && (
        <span
          className="min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
          style={{ backgroundColor: "#0d9488" }}
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
    </button>
  );
}
