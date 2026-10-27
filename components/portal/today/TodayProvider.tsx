"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import Toast from "@/components/portal/home/Toast";
import { completeTask, type TodayData, type TodayTask, useAssistantToday } from "./useAssistantToday";
import { type TaskActions, TodayBody, TodayHeader } from "./TodayView";

// 업무 비서 '오늘' 공유 상태: 상단바 [오늘] 버튼·첫 화면 패널·모바일 카드·업무 비서 타일 요약이 같이 쓴다.
// 서랍(768~1599px, 오른쪽 380px)과 전체 화면 시트(768px 미만)는 같은 대화 상자를 폭에 따라 다르게 그린다.

const TOAST_MS = 2500;
const WIDE_QUERY = "(min-width: 1600px)"; // 이 폭부터는 첫 화면 패널이 보여 서랍을 닫는다

interface TodayContextValue {
  data: TodayData | null;
  actions: TaskActions;
  openSheet: (opener?: HTMLElement | null) => void;
  sheetOpen: boolean;
}

const TodayContext = createContext<TodayContextValue | null>(null);

/** 공급자 밖(다른 화면의 상단바 등)에서는 null */
export function useToday(): TodayContextValue | null {
  return useContext(TodayContext);
}

export default function TodayProvider({ children }: { children: React.ReactNode }) {
  const { data, reload, dropTask } = useAssistantToday();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const onComplete = useCallback(async (task: TodayTask) => {
    setPending((cur) => new Set(cur).add(task.id));
    const ok = await completeTask(task.id);
    setPending((cur) => {
      const next = new Set(cur);
      next.delete(task.id);
      return next;
    });
    if (ok) {
      dropTask(task.id);
      reload();
      return;
    }
    setToast("완료 처리하지 못했습니다. 업무 비서에서 다시 시도하세요.");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, [dropTask, reload]);

  const openSheet = useCallback((el?: HTMLElement | null) => {
    opener.current = el ?? (document.activeElement as HTMLElement | null);
    setSheetOpen(true);
  }, []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const actions: TaskActions = { pending, onComplete: (t) => void onComplete(t) };

  return (
    <TodayContext.Provider value={{ data, actions, openSheet, sheetOpen }}>
      {children}
      {sheetOpen && data && <TodaySheet data={data} actions={actions} onClose={closeSheet} returnTo={opener} />}
      <Toast message={toast} />
    </TodayContext.Provider>
  );
}

function TodaySheet({ data, actions, onClose, returnTo }: {
  data: TodayData;
  actions: TaskActions;
  onClose: () => void;
  returnTo: React.RefObject<HTMLElement | null>; // 닫힐 때 포커스를 돌려줄 요소(연 버튼)
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnEl = returnTo.current;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // 포커스를 대화 상자 안에서만 돈다
      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    const mq = window.matchMedia(WIDE_QUERY);
    const onWide = () => { if (mq.matches) onClose(); };
    mq.addEventListener("change", onWide);

    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
      document.body.style.overflow = prevOverflow;
      if (returnEl && document.contains(returnEl)) returnEl.focus();
    };
  }, [onClose, returnTo]);

  return (
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 md:left-auto md:w-[380px] bg-white flex flex-col shadow-2xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="px-4 flex items-center flex-shrink-0" style={{ height: "56px", borderBottom: "0.5px solid #e5e7eb" }}>
          <div className="flex-1 min-w-0">
            <TodayHeader
              data={data}
              titleId={titleId}
              action={
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="오늘 닫기"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <X size={18} />
                </button>
              }
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          <TodayBody data={data} actions={actions} />
        </div>
      </div>
    </div>
  );
}

/** 상단바 [오늘 N] 버튼 — 1600px 이상에서는 첫 화면 패널이 보이므로 숨긴다 */
export function TodayButton() {
  const today = useToday();
  if (!today?.data) return null;
  const n = today.data.counts.badge;
  return (
    <button
      type="button"
      onClick={(e) => today.openSheet(e.currentTarget)}
      aria-haspopup="dialog"
      aria-expanded={today.sheetOpen}
      aria-label={n > 0 ? `오늘 할 일 ${n}건 보기` : "오늘 보기"}
      className="min-[1600px]:hidden flex items-center gap-1 px-2.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-semibold"
      style={{ height: "34px", fontSize: "13px" }}
    >
      오늘
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
