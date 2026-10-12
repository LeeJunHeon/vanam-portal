"use client";

import { Eye, EyeOff, Star } from "lucide-react";
import { type MenuItem, menuHref } from "@/lib/launcher";
import { PORTAL_APPS } from "@/lib/portal-apps";
import MenuIcon from "./MenuIcon";
import { sendUsage } from "./launcher-client";

// 전체 메뉴 한 줄
interface MenuRowProps {
  item: MenuItem;
  pinned: boolean;
  hidden: boolean;
  editing: boolean;
  onTogglePin: () => void;
  onToggleHidden: () => void;
}

const ROW_CLASS = "flex items-center gap-2.5 rounded-[10px] px-2 min-w-0";
const ROW_STYLE: React.CSSProperties = { minHeight: "44px", backgroundColor: "#f9fafb", textDecoration: "none" };

export default function MenuRow({ item, pinned, hidden, editing, onTogglePin, onToggleHidden }: MenuRowProps) {
  const app = PORTAL_APPS[item.app];
  const dim = editing && hidden ? 0.45 : 1;

  const face = (
    <>
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: app.iconBgColor, opacity: dim }}
      >
        <MenuIcon name={item.icon} size={16} color={app.tileFg} />
      </div>
      <span className="truncate flex-1 min-w-0" style={{ fontSize: "13px", color: "#1f2937", opacity: dim }} title={item.label}>
        {item.label}
      </span>
      {item.adminOnly && (
        <span
          className="flex-shrink-0 rounded"
          style={{ fontSize: "10px", padding: "1px 5px", backgroundColor: "#eceef1", color: "#4b5563" }}
        >
          관리자
        </span>
      )}
    </>
  );

  if (!editing) {
    return (
      <a
        href={menuHref(app.base, item)}
        onClick={() => sendUsage(item)}
        aria-label={`${app.name} ${item.label} 열기`}
        className={`${ROW_CLASS} hover:bg-gray-100 transition-colors`}
        style={ROW_STYLE}
      >
        {face}
        {pinned && <Star size={12} fill="#f59e0b" color="#f59e0b" className="flex-shrink-0" aria-label="즐겨찾기" />}
      </a>
    );
  }

  return (
    <div className={ROW_CLASS} style={{ ...ROW_STYLE, paddingRight: "2px" }}>
      {face}
      <button
        type="button"
        onClick={onTogglePin}
        aria-pressed={pinned}
        aria-label={pinned ? `${item.label} 즐겨찾기 해제` : `${item.label} 즐겨찾기 추가`}
        className="flex items-center justify-center rounded-lg flex-shrink-0 hover:bg-gray-200"
        style={{ width: "36px", height: "36px" }}
      >
        <Star size={17} fill={pinned ? "#f59e0b" : "none"} color={pinned ? "#f59e0b" : "#9ca3af"} />
      </button>
      <button
        type="button"
        onClick={onToggleHidden}
        aria-pressed={hidden}
        aria-label={hidden ? `${item.label} 자주 쓰는 메뉴에 다시 표시` : `${item.label} 자주 쓰는 메뉴에서 숨기기`}
        className="flex items-center justify-center rounded-lg flex-shrink-0 hover:bg-gray-200"
        style={{ width: "36px", height: "36px" }}
      >
        {hidden ? <EyeOff size={17} color="#e11d48" /> : <Eye size={17} color="#9ca3af" />}
      </button>
    </div>
  );
}
