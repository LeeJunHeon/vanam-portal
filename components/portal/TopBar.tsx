import { LayoutGrid } from "lucide-react";

export default function TopBar() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 bg-white"
      style={{
        height: "48px",
        borderBottom: "0.5px solid #e5e7eb",
      }}
    >
      {/* 좌측: 로고 */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center rounded-md"
          style={{
            width: "28px",
            height: "28px",
            backgroundColor: "#3b82f6",
          }}
        >
          <LayoutGrid size={15} color="white" strokeWidth={2} />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold text-sm text-gray-900 tracking-tight">
            VanaM
          </span>
          <span className="text-xs text-gray-400 font-medium">Platform</span>
        </div>
      </div>

      {/* 우측: 사용자 아바타 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">관리자</span>
        <div
          className="flex items-center justify-center rounded-full bg-blue-500 text-white font-semibold"
          style={{ width: "28px", height: "28px", fontSize: "11px" }}
        >
          V
        </div>
      </div>
    </header>
  );
}
