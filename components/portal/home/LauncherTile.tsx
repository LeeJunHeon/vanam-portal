"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eraser, GripVertical, Minus, Plus } from "lucide-react";
import { type MenuItem, menuHref } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import MenuIcon from "./MenuIcon";
import { sendUsage } from "./launcher-client";
import { DROP_BG, DROP_BORDER, EDIT_BORDER } from "./dnd";

// 런처 타일: 앱 아이콘 모양 (아이콘 박스 + 메뉴 이름 + 앱 약칭)
// 크기는 sm: 클래스로 나눈다(서버 렌더와 같게, JS 로 폭을 읽지 않음)
//   sm 미만: 박스 44px·rounded 13px·아이콘 22px·이름 11px, 배지 원 18px
//   sm 이상: 박스 56px·rounded 16px·아이콘 26px·이름 12px, 배지 원 20px
const ICON_BOX_CLASS = "w-11 h-11 rounded-[13px] sm:w-14 sm:h-14 sm:rounded-2xl";
const ICON_CLASS = "w-[22px] h-[22px] sm:w-[26px] sm:h-[26px]";
// 배지 원: 중심이 아이콘 박스 모서리에서 안쪽 4px (18px → -5px, 20px → -6px)
const BADGE_DOT_CLASS = "w-[18px] h-[18px] sm:w-5 sm:h-5";
const BADGE_TL_CLASS = "-top-[5px] -left-[5px] sm:-top-1.5 sm:-left-1.5";
const BADGE_TR_CLASS = "-top-[5px] -right-[5px] sm:-top-1.5 sm:-right-1.5";

function TileFace({ item, badge }: { item: MenuItem; badge?: React.ReactNode }) {
  const app = PORTAL_APPS[item.app];
  return (
    <>
      <div className="relative">
        <div
          className={`flex items-center justify-center ${ICON_BOX_CLASS}`}
          style={{ backgroundColor: app.tileBg }}
        >
          <MenuIcon name={item.icon} size={26} color={app.tileFg} className={ICON_CLASS} />
        </div>
        {badge}
      </div>
      <span
        className="text-center text-[11px] sm:text-[12px]"
        style={{
          fontWeight: 500,
          color: "#1f2937",
          lineHeight: 1.3,
          marginTop: "6px",
          wordBreak: "keep-all",
          overflowWrap: "anywhere",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {item.label}
      </span>
      <span style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>{app.short}</span>
    </>
  );
}

const TILE_CLASS = "flex flex-col items-center rounded-[12px] px-1 pt-1.5 pb-1 sm:pt-2 sm:pb-1.5 min-w-0";

/** 일반 모드 타일: 링크 + 사용 기록 */
export function LinkTile({ item, className = "" }: { item: MenuItem; className?: string }) {
  const app = PORTAL_APPS[item.app];
  return (
    <a
      href={menuHref(app.base, item)}
      onClick={() => sendUsage(item)}
      aria-label={`${app.name} ${item.label} 열기`}
      className={`${TILE_CLASS} hover:bg-gray-50 transition-colors ${className}`}
      style={{ textDecoration: "none" }}
    >
      <TileFace item={item} />
    </a>
  );
}

/** 편집 중 즐겨찾기 타일: 끌어서 정렬, − 로 빼기 */
export function SortablePinnedTile({ item, onRemove }: { item: MenuItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.key });
  const dropTarget = isOver && !isDragging;
  const badge = (
    <>
      <span
        className={`absolute flex items-center justify-center rounded-full bg-white shadow-sm ${BADGE_DOT_CLASS} ${BADGE_TL_CLASS}`}
        style={{ color: "#64748b" }}
        aria-hidden
      >
        <GripVertical size={12} />
      </span>
      <button
        type="button"
        onClick={onRemove}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`${item.label} 즐겨찾기에서 빼기`}
        className="absolute flex items-center justify-center"
        style={{ width: "32px", height: "32px", top: "-12px", right: "-12px" }}
      >
        <span
          className={`flex items-center justify-center rounded-full ${BADGE_DOT_CLASS}`}
          style={{ backgroundColor: "#4b5563" }}
        >
          <Minus size={12} color="#ffffff" strokeWidth={3} />
        </span>
      </button>
    </>
  );
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${item.label} 순서 바꾸기`}
      className={`${TILE_CLASS} cursor-grab select-none`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        border: dropTarget ? DROP_BORDER : EDIT_BORDER,
        backgroundColor: dropTarget ? DROP_BG : "#ffffff",
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        touchAction: "manipulation",
      }}
    >
      <TileFace item={item} badge={badge} />
    </div>
  );
}

/**
 * 편집 중 자주 쓰는 메뉴 타일: 누르면 즐겨찾기에 추가, 왼쪽 위 버튼은 사용 기록 지우기.
 * 두 버튼은 형제 요소(버튼 안에 버튼 없음)라 기록 지우기를 눌러도 즐겨찾기 추가가 일어나지 않는다.
 */
export function AddTile({
  item,
  onAdd,
  onClear,
  className = "",
}: {
  item: MenuItem;
  onAdd: () => void;
  onClear: () => void;
  className?: string;
}) {
  const badge = (
    <span
      className={`absolute flex items-center justify-center rounded-full ${BADGE_DOT_CLASS} ${BADGE_TR_CLASS}`}
      style={{ backgroundColor: "#2563eb" }}
      aria-hidden
    >
      <Plus size={12} color="#ffffff" strokeWidth={3} />
    </span>
  );
  return (
    <div className={`relative flex flex-col min-w-0 ${className}`}>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`${item.label} 즐겨찾기에 추가`}
        className={`${TILE_CLASS} w-full hover:bg-gray-50 transition-colors`}
      >
        <TileFace item={item} badge={badge} />
      </button>
      {/* 아이콘 박스 왼쪽 위 — 즐겨찾기 타일 빼기 버튼과 같은 32px 영역, 원 중심은 박스 모서리 안쪽 4px
          sm 미만: 박스 44px·위 여백 6px → top -6px, left 50%-34px / sm 이상: 56px·8px → top -4px, left 50%-40px */}
      <button
        type="button"
        onClick={onClear}
        aria-label={`${item.label} 사용 기록 지우기`}
        title="사용 기록 지우기"
        className="absolute flex items-center justify-center top-[-6px] left-[calc(50%-34px)] sm:top-[-4px] sm:left-[calc(50%-40px)]"
        style={{ width: "32px", height: "32px" }}
      >
        <span
          className={`flex items-center justify-center rounded-full ${BADGE_DOT_CLASS}`}
          style={{ backgroundColor: "#6b7280" }}
        >
          <Eraser size={12} color="#ffffff" />
        </span>
      </button>
    </div>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 gap-x-1 gap-y-1.5 sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))] sm:gap-x-2 sm:gap-y-2.5">
      {children}
    </div>
  );
}

export function TileSkeleton({ count }: { count: number }) {
  return (
    <TileGrid>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col items-center pt-1.5 pb-1 sm:pt-2 sm:pb-1.5" aria-hidden>
          <div className={ICON_BOX_CLASS} style={{ backgroundColor: "#f3f4f6" }} />
          <div style={{ width: "48px", height: "10px", borderRadius: "4px", backgroundColor: "#f3f4f6", marginTop: "8px" }} />
        </div>
      ))}
    </TileGrid>
  );
}
