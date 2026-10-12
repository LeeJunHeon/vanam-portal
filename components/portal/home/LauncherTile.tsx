"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Minus, Plus } from "lucide-react";
import { type MenuItem, menuHref } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import MenuIcon from "./MenuIcon";
import { sendUsage } from "./launcher-client";
import { DROP_BG, DROP_BORDER, EDIT_BORDER } from "./dnd";

// 런처 타일: 앱 아이콘 모양 (56px 박스 + 메뉴 이름 + 앱 약칭)

function TileFace({ item, badge }: { item: MenuItem; badge?: React.ReactNode }) {
  const app = PORTAL_APPS[item.app];
  return (
    <>
      <div className="relative">
        <div
          className="flex items-center justify-center"
          style={{ width: "56px", height: "56px", borderRadius: "16px", backgroundColor: app.tileBg }}
        >
          <MenuIcon name={item.icon} size={26} color={app.tileFg} />
        </div>
        {badge}
      </div>
      <span
        className="text-center"
        style={{
          fontSize: "12px",
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

const TILE_CLASS = "flex flex-col items-center rounded-[12px] px-1 pt-2 pb-1.5 min-w-0";

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
        className="absolute flex items-center justify-center rounded-full bg-white shadow-sm"
        style={{ width: "20px", height: "20px", top: "-6px", left: "-6px", color: "#64748b" }}
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
          className="flex items-center justify-center rounded-full"
          style={{ width: "20px", height: "20px", backgroundColor: "#4b5563" }}
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

/** 편집 중 자주 쓰는 메뉴 타일: 누르면 즐겨찾기에 추가 */
export function AddTile({ item, onAdd, className = "" }: { item: MenuItem; onAdd: () => void; className?: string }) {
  const badge = (
    <span
      className="absolute flex items-center justify-center rounded-full"
      style={{ width: "20px", height: "20px", top: "-6px", right: "-6px", backgroundColor: "#2563eb" }}
      aria-hidden
    >
      <Plus size={12} color="#ffffff" strokeWidth={3} />
    </span>
  );
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`${item.label} 즐겨찾기에 추가`}
      className={`${TILE_CLASS} hover:bg-gray-50 transition-colors ${className}`}
    >
      <TileFace item={item} badge={badge} />
    </button>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))]" style={{ gap: "10px 8px" }}>
      {children}
    </div>
  );
}

export function TileSkeleton({ count }: { count: number }) {
  return (
    <TileGrid>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col items-center pt-2 pb-1.5" aria-hidden>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", backgroundColor: "#f3f4f6" }} />
          <div style={{ width: "48px", height: "10px", borderRadius: "4px", backgroundColor: "#f3f4f6", marginTop: "8px" }} />
        </div>
      ))}
    </TileGrid>
  );
}
