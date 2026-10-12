"use client";

import { Check, RotateCcw } from "lucide-react";

// 편집 모드 안내 띠 (가운데 맨 위)
export default function EditBanner({ onReset, onDone }: { onReset: () => void; onDone: () => void }) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:px-4"
      style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px" }}
    >
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a8a" }}>편집 중</p>
        <p style={{ fontSize: "12px", color: "#1e40af", lineHeight: 1.5, marginTop: "2px", wordBreak: "keep-all" }}>
          즐겨찾기는 끌어서 순서를 바꾸고 − 로 뺍니다. 자주 쓰는 메뉴는 누르면 즐겨찾기에 들어갑니다. 왼쪽 앱 카드도 끌어서 순서를 바꿀 수 있습니다.
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 rounded-[10px] font-medium"
          style={{ height: "40px", fontSize: "13px", backgroundColor: "#ffffff", border: "1px solid #bfdbfe", color: "#1e40af" }}
        >
          <RotateCcw size={14} />
          초기화
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex items-center gap-1.5 px-4 rounded-[10px] font-semibold text-white"
          style={{ height: "40px", fontSize: "13px", backgroundColor: "#2563eb" }}
        >
          <Check size={14} />
          완료
        </button>
      </div>
    </div>
  );
}
