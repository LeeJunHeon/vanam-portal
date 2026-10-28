"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, RotateCcw, X } from "lucide-react";
import type { AppKey } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";

const WIDE_QUERY = "(min-width: 1024px)"; // 이 폭부터는 왼쪽 앱 열에서 끌어서 바꾸므로 시트를 닫는다

// 1024px 미만 앱 순서 편집 시트 (아래에서 올라옴): 줄마다 ↑ ↓ 로 한 칸씩 옮긴다.
// 옮길 때마다 바로 저장되고 칩 줄에 바로 반영된다(PortalHome 이 prefs.appOrder 를 바꾼다).
// 채팅 버튼(z-60) 위에 뜨도록 '내 할 일' 시트와 같은 z-[65]. 초기화 확인 모달은 이 위에 띄운다(ConfirmModal aboveSheet).
export default function AppOrderSheet({ order, onStep, onReset, onClose, returnTo, paused }: {
  order: AppKey[];                                // 보이는 앱 순서
  onStep: (app: AppKey, dir: -1 | 1) => void;     // 한 칸 위(-1)/아래(1)
  onReset: () => void;                            // 초기화 확인 모달 열기
  onClose: () => void;
  returnTo: React.RefObject<HTMLElement | null>;  // 닫힐 때 포커스를 돌려줄 요소([순서 편집] 버튼)
  paused: boolean;                                // 초기화 확인 모달이 위에 떠 있음 (Esc·포커스 가두기 멈춤)
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const pausedRef = useRef(paused);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const returnEl = returnTo.current;
    doneRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // 포커스를 시트 안에서만 돈다
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

  const step = (app: AppKey, dir: -1 | 1) => {
    const to = order.indexOf(app) + dir;
    if (to < 0 || to >= order.length) return;
    onStep(app, dir);
    setAnnounce(`${PORTAL_APPS[app].name}: ${to + 1}번째`);
    // 끝 줄에 닿아 누른 버튼이 비활성화되면 같은 줄의 반대 버튼으로 포커스를 옮긴다
    if (to === 0 || to === order.length - 1) {
      const other = to === 0 ? "down" : "up";
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLButtonElement>(`[data-app="${app}"][data-dir="${other}"]`)?.focus();
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] bg-white flex flex-col shadow-2xl rounded-t-2xl"
        style={{ maxHeight: "85vh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="px-4 flex items-center flex-shrink-0" style={{ height: "52px", borderBottom: "0.5px solid #e5e7eb" }}>
          <h2 id={titleId} className="flex-1 font-bold text-gray-900" style={{ fontSize: "15px" }}>앱 순서 편집</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="앱 순서 편집 닫기"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <ol className="flex-1 overflow-y-auto px-4 py-2" aria-label="앱 순서">
          {order.map((app, i) => {
            const meta = PORTAL_APPS[app];
            const Icon = meta.icon;
            return (
              <li key={app} className="flex items-center gap-2" style={{ height: "52px", borderBottom: "0.5px solid #f3f4f6" }}>
                <div
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: "32px", height: "32px", backgroundColor: meta.iconBgColor }}
                >
                  <Icon size={16} color={meta.iconColor} strokeWidth={1.8} />
                </div>
                <span className="flex-1 min-w-0 truncate font-semibold text-gray-900" style={{ fontSize: "14px" }}>{meta.name}</span>
                <StepButton app={app} dir="up" disabled={i === 0} onClick={() => step(app, -1)} />
                <StepButton app={app} dir="down" disabled={i === order.length - 1} onClick={() => step(app, 1)} />
              </li>
            );
          })}
        </ol>
        <p className="sr-only" aria-live="polite">{announce}</p>

        <div className="flex gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: "0.5px solid #e5e7eb" }}>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center justify-center gap-1.5 px-3 rounded-[10px] font-medium"
            style={{ height: "44px", fontSize: "13px", backgroundColor: "#ffffff", border: "1px solid #d1d5db", color: "#374151" }}
          >
            <RotateCcw size={14} />
            초기화
          </button>
          <button
            ref={doneRef}
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 rounded-[10px] font-semibold text-white"
            style={{ height: "44px", fontSize: "13px", backgroundColor: "#2563eb" }}
          >
            <Check size={14} />
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

function StepButton({ app, dir, disabled, onClick }: {
  app: AppKey; dir: "up" | "down"; disabled: boolean; onClick: () => void;
}) {
  const Icon = dir === "up" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      data-app={app}
      data-dir={dir}
      onClick={onClick}
      disabled={disabled}
      aria-label={`${PORTAL_APPS[app].name} ${dir === "up" ? "위로" : "아래로"}`}
      className="flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
      style={{ width: "40px", height: "40px", border: "0.5px solid #e5e7eb", color: "#374151" }}
    >
      <Icon size={16} />
    </button>
  );
}
