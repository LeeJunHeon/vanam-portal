"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, GripVertical, Wifi, WifiOff } from "lucide-react";
import type { AppKey } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import type { AppSummary } from "./useAppSummaries";
import { DROP_BG, DROP_BORDER, EDIT_BORDER, useLauncherSensors } from "./dnd";

const CHIP_WIDTH = 140;
const CHIP_GAP = 8;

interface AppColumnProps {
  order: AppKey[]; // 보이는 앱 순서
  summaries: Record<AppKey, AppSummary>;
  editing: boolean;
  canEdit: boolean; // 서버 배치를 받았음 (아니면 [순서 편집] 비활성)
  onMove: (from: AppKey, to: AppKey) => void;
  onStartEdit: () => void;                       // lg 이상 [앱 순서 편집] → 기존 편집 모드
  onFinishEdit: () => void;                      // lg 이상 [완료]
  onOpenSheet: (opener: HTMLElement) => void;    // lg 미만 [순서 편집] → 순서 편집 시트
  loadKey: string;                               // 배치 자료 출처(처음·캐시·서버)가 바뀔 때마다 달라지는 값 — 칩 줄 스크롤 초기화용
}

// 왼쪽 앱 열 (lg 이상: 세로 카드 / lg 미만: 가로 스크롤 칩)
export default function AppColumn({
  order, summaries, editing, canEdit, onMove, onStartEdit, onFinishEdit, onOpenSheet, loadKey,
}: AppColumnProps) {
  const sensors = useLauncherSensors();
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onMove(e.active.id as AppKey, e.over.id as AppKey);
  };

  return (
    <>
      {/* 데스크톱: 세로 카드 (첫 카드 윗선을 가운데·오른쪽 첫 카드와 맞추려고 [앱 순서 편집]은 마지막 카드 아래) */}
      <div className="hidden lg:block">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {order.map((app) => (
                <AppCardItem key={app} app={app} summary={summaries[app]} editing={editing} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="flex justify-end mt-2">
          {editing ? (
            <OrderEditButton label="완료" icon="done" onClick={onFinishEdit} />
          ) : (
            <OrderEditButton label="앱 순서 편집" icon="edit" disabled={!canEdit} onClick={onStartEdit} />
          )}
        </div>
      </div>

      {/* 모바일: 가로 스크롤 칩 (줄 위 오른쪽에 [순서 편집] → 시트) */}
      <div className="lg:hidden flex justify-end mb-1">
        <OrderEditButton
          label="순서 편집"
          icon="edit"
          disabled={!canEdit}
          onClick={(e) => onOpenSheet(e.currentTarget)}
          haspopup
        />
      </div>
      <MobileAppRow resetKey={loadKey}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-2 w-max pb-0.5">
              {order.map((app) => (
                <AppChip key={app} app={app} summary={summaries[app]} editing={editing} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </MobileAppRow>
    </>
  );
}

// 앱 열의 작은 회색 버튼 (lg 이상: 마지막 카드 아래 [앱 순서 편집] / 편집 중 [완료], lg 미만: 칩 줄 위 [순서 편집])
// 높이 28px 고정 — 편집 중 [완료]로 바뀌어도 아래가 밀리지 않는다
function OrderEditButton({ label, icon, disabled, onClick, haspopup }: {
  label: string;
  icon: "edit" | "done";
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  haspopup?: boolean;
}) {
  const Icon = icon === "done" ? Check : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={haspopup ? "dialog" : undefined}
      className="flex items-center gap-1 px-2 rounded-lg transition-colors hover:bg-white hover:text-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ height: "28px", fontSize: "12px", color: icon === "done" ? "#2563eb" : "#6b7280", fontWeight: icon === "done" ? 600 : 500 }}
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  );
}

// lg 미만 가로 스크롤 줄 + 좌우 넘침 안내(그라데이션·화살표 버튼)
// 표시 여부는 마운트 뒤 scroll·ResizeObserver 로만 계산한다(서버 렌더와 첫 화면은 둘 다 숨김)
function MobileAppRow({ children, resetKey }: { children: React.ReactNode; resetKey: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  // 기본 순서로 먼저 그린 뒤 저장된 순서(캐시·서버)가 들어오면 칩이 재배치되는데, 브라우저가 처음 맞춰 둔 칩(snap)을
  // 따라가 줄이 옆으로 밀린 채 보인다. 자료가 들어올 때(처음·캐시·서버)만 맨 앞으로 돌린다 — 사용자가 순서를 바꿀 때는 그대로.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [resetKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdge((cur) => (cur.left === left && cur.right === right ? cur : { left, right }));
    };
    el.addEventListener("scroll", update, { passive: true });
    // observe 하면 처음 한 번 콜백이 불린다 — 칩 줄 너비(앱 수·순서 변경)도 같이 본다
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scrollByChips = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 2 * (CHIP_WIDTH + CHIP_GAP), behavior: "smooth" });
  };

  return (
    <div className="lg:hidden relative">
      <div
        ref={scrollRef}
        className="-mx-4 px-4 sm:-mx-5 sm:px-5 scroll-px-4 sm:scroll-px-5 overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>
      {edge.left && (
        <>
          <div
            className="absolute inset-y-0 -left-4 sm:-left-5 w-10 pointer-events-none"
            style={{ background: "linear-gradient(to left, transparent, #f0f2f5)" }}
            aria-hidden
          />
          <ScrollHintButton side="left" onClick={() => scrollByChips(-1)} />
        </>
      )}
      {edge.right && (
        <>
          <div
            className="absolute inset-y-0 -right-4 sm:-right-5 w-10 pointer-events-none"
            style={{ background: "linear-gradient(to right, transparent, #f0f2f5)" }}
            aria-hidden
          />
          <ScrollHintButton side="right" onClick={() => scrollByChips(1)} />
        </>
      )}
    </div>
  );
}

function ScrollHintButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "앱 이전 보기" : "앱 더 보기"}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "-left-2" : "-right-2"} flex items-center justify-center rounded-full bg-white shadow-md`}
      style={{ width: "28px", height: "28px", zIndex: 20 }}
    >
      <Icon size={16} color="#374151" />
    </button>
  );
}

function sortableStyle(
  s: Pick<ReturnType<typeof useSortable>, "transform" | "transition" | "isDragging" | "isOver">,
  editing: boolean,
): React.CSSProperties {
  const dropTarget = editing && s.isOver && !s.isDragging;
  return {
    transform: CSS.Transform.toString(s.transform),
    transition: s.transition,
    border: editing ? (dropTarget ? DROP_BORDER : EDIT_BORDER) : "0.5px solid #e5e7eb",
    backgroundColor: dropTarget ? DROP_BG : "#ffffff",
    opacity: s.isDragging ? 0.6 : 1,
    zIndex: s.isDragging ? 10 : undefined,
    position: "relative",
    textDecoration: "none",
    touchAction: editing ? "manipulation" : undefined,
  };
}

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span
      className="rounded-full font-semibold flex-shrink-0"
      style={{
        fontSize: "10px",
        padding: "2px 7px",
        backgroundColor: online ? "#dcfce7" : "#fee2e2",
        color: online ? "#15803d" : "#dc2626",
      }}
    >
      {online ? "운영중" : "중지"}
    </span>
  );
}

function SummaryLine({ app, summary }: { app: AppKey; summary: AppSummary }) {
  const text = [summary.stat1, summary.stat2].filter(Boolean).join(" · ") || PORTAL_APPS[app].description;
  return (
    <div className="flex items-center gap-1 min-w-0" style={{ fontSize: "11px", color: "#6b7280", marginTop: "6px" }}>
      {summary.connState &&
        (summary.connState === "online" ? (
          <Wifi size={12} className="text-emerald-500 flex-shrink-0" />
        ) : (
          <WifiOff size={12} className="text-gray-400 flex-shrink-0" />
        ))}
      <span className="truncate" title={text}>{text}</span>
    </div>
  );
}

function AppCardItem({ app, summary, editing }: { app: AppKey; summary: AppSummary; editing: boolean }) {
  const meta = PORTAL_APPS[app];
  const Icon = meta.icon;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: app, disabled: !editing });
  const sortStyle = sortableStyle({ transform, transition, isDragging, isOver }, editing);
  const online = summary.status === "online";

  const body = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {editing && <GripVertical size={14} className="flex-shrink-0" style={{ color: "#94a3b8" }} aria-hidden />}
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: "32px", height: "32px", backgroundColor: meta.iconBgColor }}
        >
          <Icon size={16} color={meta.iconColor} strokeWidth={1.8} />
        </div>
        <span className="font-bold text-gray-900 truncate flex-1" style={{ fontSize: "13px" }}>{meta.name}</span>
        <StatusBadge online={online} />
      </div>
      <SummaryLine app={app} summary={summary} />
    </>
  );

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${meta.name} 순서 바꾸기`}
        className="rounded-[12px] block cursor-grab select-none"
        style={{ ...sortStyle, padding: "12px" }}
      >
        {body}
      </div>
    );
  }
  return (
    <a
      ref={setNodeRef}
      href={meta.base}
      className="rounded-[12px] block transition-colors hover:border-[#93c5fd]"
      style={{ ...sortStyle, padding: "12px" }}
    >
      {body}
    </a>
  );
}

function AppChip({ app, summary, editing }: { app: AppKey; summary: AppSummary; editing: boolean }) {
  const meta = PORTAL_APPS[app];
  const Icon = meta.icon;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: app, disabled: !editing });
  const sortStyle = sortableStyle({ transform, transition, isDragging, isOver }, editing);
  const online = summary.status === "online";

  const body = (
    <>
      {editing && <GripVertical size={12} className="flex-shrink-0 -mr-0.5" style={{ color: "#94a3b8" }} aria-hidden />}
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ width: "32px", height: "32px", backgroundColor: meta.iconBgColor }}
      >
        <Icon size={16} color={meta.iconColor} strokeWidth={1.8} />
      </div>
      <span className="font-bold text-gray-900 whitespace-nowrap truncate flex-1 min-w-0" style={{ fontSize: "13px" }} title={meta.name}>
        {meta.name}
      </span>
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: "7px", height: "7px", backgroundColor: online ? "#22c55e" : "#dc2626" }}
        aria-label={online ? "운영중" : "중지"}
      />
    </>
  );
  // 너비 고정 140px·높이 56px, 스크롤 줄에서 칩 단위로 멈춘다(snap-start)
  const cls = "flex items-center gap-1.5 rounded-[12px] pl-1.5 pr-2 flex-shrink-0 snap-start";
  const style = { ...sortStyle, width: `${CHIP_WIDTH}px`, height: "56px" };

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${meta.name} 순서 바꾸기`}
        className={`${cls} cursor-grab select-none`}
        style={style}
      >
        {body}
      </div>
    );
  }
  return (
    <a ref={setNodeRef} href={meta.base} className={cls} style={style}>
      {body}
    </a>
  );
}
