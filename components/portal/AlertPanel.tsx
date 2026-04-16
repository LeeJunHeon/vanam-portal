import { Bell } from "lucide-react";

export default function AlertPanel() {
  return (
    <div
      className="bg-white rounded-[12px] p-4"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p
        className="font-bold uppercase tracking-widest mb-3"
        style={{ fontSize: "11px", color: "#9ca3af", letterSpacing: "0.08em" }}
      >
        알림
      </p>

      {/* 빈 상태 */}
      <div className="flex flex-col items-center justify-center py-6">
        <div
          className="flex items-center justify-center rounded-full mb-2.5"
          style={{
            width: "32px",
            height: "32px",
            backgroundColor: "#f3f4f6",
          }}
        >
          <Bell size={14} color="#9ca3af" strokeWidth={1.8} />
        </div>
        <p className="text-gray-400 font-medium" style={{ fontSize: "12px" }}>
          새로운 알림이 없습니다
        </p>
      </div>
    </div>
  );
}
