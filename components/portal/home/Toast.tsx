"use client";

// 화면 아래 가운데 토스트 (오른쪽 아래 플로팅 챗 버튼과 겹치지 않게 좌우 여백을 둔다)
export default function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[70] left-1/2 -translate-x-1/2 rounded-xl text-white text-center shadow-lg"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        maxWidth: "calc(100vw - 176px)",
        width: "max-content",
        padding: "10px 16px",
        fontSize: "13px",
        backgroundColor: "rgba(17,24,39,0.92)",
        lineHeight: 1.4,
      }}
    >
      {message}
    </div>
  );
}
