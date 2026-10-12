"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type AppKey, type MenuItem } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import MenuRow from "./MenuRow";

interface AllMenusSectionProps {
  groups: Array<{ app: AppKey; items: MenuItem[] }>; // 앱 열 순서, 필터 전
  ready: boolean;
  open: boolean;
  editing: boolean;
  pinned: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  onToggleOpen: () => void;
  onTogglePin: (key: string) => void;
  onToggleHidden: (key: string) => void;
}

// ③ 전체 메뉴 (접었다 펴기, 앱별 묶음, 필터 칩)
export default function AllMenusSection({
  groups, ready, open, editing, pinned, hidden, onToggleOpen, onTogglePin, onToggleHidden,
}: AllMenusSectionProps) {
  const [filter, setFilter] = useState<AppKey | "all">("all");
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  // 필터로 고른 앱이 목록에서 사라지면(카탈로그 갱신 등) 전체로
  const activeFilter = filter !== "all" && groups.some((g) => g.app === filter) ? filter : "all";
  const shown = activeFilter === "all" ? groups : groups.filter((g) => g.app === activeFilter);

  return (
    <section className="bg-white rounded-[12px]" style={{ border: "0.5px solid #e5e7eb" }}>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls="launcher-all-menus"
        className="w-full flex items-center gap-2 px-4 text-left"
        style={{ minHeight: "44px" }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>전체 메뉴</span>
        {ready && <span style={{ fontSize: "12px", color: "#6b7280" }}>{total}</span>}
        <span className="ml-auto flex items-center gap-1" style={{ fontSize: "12px", color: "#6b7280" }}>
          {open ? "접기" : "펼치기"}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div id="launcher-all-menus" className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-1.5" style={{ marginBottom: "12px" }}>
            <FilterChip label="전체" active={activeFilter === "all"} onClick={() => setFilter("all")} />
            {groups.map((g) => (
              <FilterChip
                key={g.app}
                label={PORTAL_APPS[g.app].name}
                active={activeFilter === g.app}
                onClick={() => setFilter(g.app)}
              />
            ))}
            {editing && (
              <span className="ml-1" style={{ fontSize: "11px", color: "#6b7280" }}>
                별 = 즐겨찾기 · 눈 = 자주 쓰는 메뉴에서 숨김
              </span>
            )}
          </div>

          {!ready ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: "44px", borderRadius: "10px", backgroundColor: "#f3f4f6" }} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p style={{ fontSize: "12px", color: "#6b7280", padding: "8px 0" }}>불러온 메뉴가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {shown.map((g) => (
                <div key={g.app}>
                  <div className="flex items-center gap-1.5" style={{ marginBottom: "6px" }}>
                    <span
                      className="rounded-full"
                      style={{ width: "8px", height: "8px", backgroundColor: PORTAL_APPS[g.app].tileFg }}
                      aria-hidden
                    />
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>{PORTAL_APPS[g.app].name}</span>
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>{g.items.length}</span>
                  </div>
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(auto-fill, minmax(${editing ? 220 : 176}px, 1fr))`,
                      gap: "6px 8px",
                    }}
                  >
                    {g.items.map((m) => (
                      <MenuRow
                        key={m.key}
                        item={m}
                        editing={editing}
                        pinned={pinned.has(m.key)}
                        hidden={hidden.has(m.key)}
                        onTogglePin={() => onTogglePin(m.key)}
                        onToggleHidden={() => onToggleHidden(m.key)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full px-3 font-medium"
      style={{
        height: "32px",
        fontSize: "12px",
        backgroundColor: active ? "#1f2937" : "#f3f4f6",
        color: active ? "#ffffff" : "#374151",
      }}
    >
      {label}
    </button>
  );
}
