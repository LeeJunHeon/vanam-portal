"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext, horizontalListSortingStrategy, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Wifi, WifiOff } from "lucide-react";
import type { AppKey } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import type { AppSummary } from "./useAppSummaries";
import { DROP_BG, DROP_BORDER, EDIT_BORDER, useLauncherSensors } from "./dnd";

interface AppColumnProps {
  order: AppKey[]; // 보이는 앱 순서
  summaries: Record<AppKey, AppSummary>;
  editing: boolean;
  onMove: (from: AppKey, to: AppKey) => void;
}

// 왼쪽 앱 열 (lg 이상: 세로 카드 / lg 미만: 가로 스크롤 칩)
export default function AppColumn({ order, summaries, editing, onMove }: AppColumnProps) {
  const sensors = useLauncherSensors();
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onMove(e.active.id as AppKey, e.over.id as AppKey);
  };

  return (
    <>
      {/* 데스크톱: 세로 카드 */}
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
      </div>

      {/* 모바일: 가로 스크롤 칩 */}
      <div className="lg:hidden -mx-4 px-4 sm:-mx-5 sm:px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-2 w-max pb-0.5">
              {order.map((app) => (
                <AppChip key={app} app={app} summary={summaries[app]} editing={editing} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
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
      {editing && <GripVertical size={13} className="flex-shrink-0" style={{ color: "#94a3b8" }} aria-hidden />}
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ width: "30px", height: "30px", backgroundColor: meta.iconBgColor }}
      >
        <Icon size={15} color={meta.iconColor} strokeWidth={1.8} />
      </div>
      <span className="font-bold text-gray-900 whitespace-nowrap" style={{ fontSize: "13px" }}>{meta.name}</span>
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: "7px", height: "7px", backgroundColor: online ? "#22c55e" : "#dc2626" }}
        aria-label={online ? "운영중" : "중지"}
      />
    </>
  );
  const cls = "flex items-center gap-2 rounded-[12px] pl-1.5 pr-3 flex-shrink-0";
  const style = { ...sortStyle, height: "44px" };

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
