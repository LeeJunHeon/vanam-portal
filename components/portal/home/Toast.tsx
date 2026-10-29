"use client";

// 화면 아래 가운데 토스트 (오른쪽 아래 플로팅 챗 버튼과 겹치지 않게 좌우 여백을 둔다)
// action 이 있으면 글자 오른쪽에 버튼 하나(예: [되돌리기])
export default function Toast({ message, action }: {
  message: string | null;
  action?: { label: string; onClick: () => void } | null;
}) {
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
        wordBreak: "keep-all", // 좁은 화면에서 "업무"처럼 낱말 중간에서 줄이 나뉘지 않게
      }}
    >
      {action ? (
        <span className="inline-flex items-center gap-3">
          <span>{message}</span>
          <button
            type="button"
            onClick={action.onClick}
            className="font-semibold rounded-md hover:bg-white/10 transition-colors"
            style={{ color: "#5eead4", padding: "2px 6px", margin: "-2px -6px -2px 0" }}
          >
            {action.label}
          </button>
        </span>
      ) : (
        message
      )}
    </div>
  );
}
