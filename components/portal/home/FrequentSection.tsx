"use client";

import type { MenuItem } from "@/lib/launcher";
import { AddTile, LinkTile, TileGrid, TileSkeleton } from "./LauncherTile";

// ② 자주 쓰는 메뉴 (사용 점수 순 자동 정렬, sm 미만은 앞 8개만)
export default function FrequentSection({
  items,
  ready,
  editing,
  onAdd,
}: {
  items: MenuItem[];
  ready: boolean;
  editing: boolean;
  onAdd: (key: string) => void;
}) {
  return (
    <section aria-labelledby="launcher-freq-title">
      <div className="flex items-baseline justify-between gap-2 flex-wrap" style={{ marginBottom: "10px" }}>
        <div className="flex items-baseline gap-2">
          <h2 id="launcher-freq-title" style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>자주 쓰는 메뉴</h2>
          <span style={{ fontSize: "11px", color: "#6b7280" }}>최근 사용 순 · 자동 정렬</span>
        </div>
        {editing && <span style={{ fontSize: "11px", color: "#2563eb" }}>누르면 즐겨찾기에 추가</span>}
      </div>

      {!ready ? (
        <TileSkeleton count={8} />
      ) : items.length === 0 ? (
        <p style={{ fontSize: "12px", color: "#6b7280", padding: "8px 0", wordBreak: "keep-all" }}>
          메뉴를 쓰기 시작하면 자주 쓰는 메뉴가 여기에 자동으로 모입니다.
        </p>
      ) : (
        <TileGrid>
          {items.map((m, i) => {
            const cls = i >= 8 ? "hidden sm:flex" : "";
            return editing ? (
              <AddTile key={m.key} item={m} onAdd={() => onAdd(m.key)} className={cls} />
            ) : (
              <LinkTile key={m.key} item={m} className={cls} />
            );
          })}
        </TileGrid>
      )}
    </section>
  );
}
