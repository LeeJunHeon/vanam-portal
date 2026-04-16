import { Activity } from "lucide-react";

export default function ActivityLog() {
  return (
    <div>
      {/* 섹션 레이블 */}
      <p
        className="font-bold uppercase tracking-widest mb-3"
        style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
      >
        최근 활동
      </p>

      {/* 빈 상태 */}
      <div
        className="bg-white rounded-[12px] flex flex-col items-center justify-center py-10"
        style={{ border: "0.5px solid #e5e7eb" }}
      >
        <div
          className="flex items-center justify-center rounded-full mb-3"
          style={{
            width: "36px",
            height: "36px",
            backgroundColor: "#f3f4f6",
          }}
        >
          <Activity size={16} color="#9ca3af" strokeWidth={1.8} />
        </div>
        <p className="text-gray-400 font-medium" style={{ fontSize: "12px" }}>
          활동 로그가 없습니다
        </p>
        <p className="text-gray-300 mt-1" style={{ fontSize: "11px" }}>
          데이터 연동 후 표시됩니다
        </p>
      </div>
    </div>
  );
}
