"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { Pencil, Star } from "lucide-react";
import type { MenuItem } from "@/lib/launcher";
import { LinkTile, SortablePinnedTile, TileGrid, TileSkeleton } from "./LauncherTile";
import { useLauncherSensors } from "./dnd";

interface FavoritesSectionProps {
  items: MenuItem[];
  ready: boolean;
  editing: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: (key: string) => void;
  onMove: (from: string, to: string) => void;
}

// ① 즐겨찾기
export default function FavoritesSection({ items, ready, editing, canEdit, onEdit, onRemove, onMove }: FavoritesSectionProps) {
  const sensors = useLauncherSensors();
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onMove(String(e.active.id), String(e.over.id));
  };

  return (
    <section aria-labelledby="launcher-fav-title">
      <div className="flex items-center justify-between gap-2" style={{ minHeight: "36px", marginBottom: "10px" }}>
        <div className="flex items-center gap-1.5">
          <Star size={15} fill="#f59e0b" color="#f59e0b" aria-hidden />
          <h2 id="launcher-fav-title" style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>즐겨찾기</h2>
          {ready && <span style={{ fontSize: "12px", color: "#6b7280" }}>{items.length}</span>}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            disabled={!canEdit}
            className="flex items-center gap-1.5 px-3 rounded-[10px] font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ height: "36px", fontSize: "13px", backgroundColor: "#f3f4f6" }}
          >
            <Pencil size={13} />
            편집
          </button>
        )}
      </div>

      {!ready ? (
        <TileSkeleton count={6} />
      ) : items.length === 0 ? (
        <div
          className="text-center rounded-[12px]"
          style={{ border: "1.5px dashed #d1d5db", padding: "20px 12px", fontSize: "12px", color: "#6b7280", wordBreak: "keep-all" }}
        >
          {editing
            ? "자주 쓰는 메뉴를 누르거나, 전체 메뉴에서 별을 눌러 즐겨찾기를 추가하세요."
            : "즐겨찾기가 비어 있습니다. 편집을 눌러 자주 가는 메뉴를 고정하세요."}
        </div>
      ) : editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((m) => m.key)} strategy={rectSortingStrategy}>
            <TileGrid>
              {items.map((m) => (
                <SortablePinnedTile key={m.key} item={m} onRemove={() => onRemove(m.key)} />
              ))}
            </TileGrid>
          </SortableContext>
        </DndContext>
      ) : (
        <TileGrid>
          {items.map((m) => (
            <LinkTile key={m.key} item={m} />
          ))}
        </TileGrid>
      )}
    </section>
  );
}
